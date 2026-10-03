import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { getDb, getOrganizationMembership, initializeDatabase } from "../../../lib/db";
import { hasCapability } from "../../../lib/capabilities";
import { organizationIdsForUser } from "../../../lib/campaigns";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { deleteStoredMedia, storeMedia } from "../../../lib/media-storage";
import { inspectCreativeUpload } from "../../../lib/uploads";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgs = await organizationIdsForUser(user); const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1)); const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20)));
  const rows = await getDb().query(`SELECT creative_assets.*, latest.id latest_version_id, latest.version latest_version, latest.status latest_status, latest.original_name
    FROM creative_assets LEFT JOIN LATERAL (SELECT * FROM creative_versions WHERE asset_id=creative_assets.id ORDER BY version DESC LIMIT 1) latest ON TRUE
    WHERE creative_assets.organization_id=ANY($1::text[]) ORDER BY creative_assets.created_at DESC LIMIT $2 OFFSET $3`, [orgs, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ assets: rows.rows, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData(); const campaignId = String(form.get("campaignId") ?? ""); const placementId=String(form.get("placementId")??""); const existingAssetId = String(form.get("assetId") ?? ""); const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an artwork file" }, { status: 422 });
  await initializeDatabase();
  const orgs = await organizationIdsForUser(user);
  const campaign = await getDb().query<{ organization_id: string }>("SELECT organization_id FROM campaigns WHERE id=$1 AND organization_id=ANY($2::text[])", [campaignId, orgs]);
  const organizationId = campaign.rows[0]?.organization_id; if (!organizationId) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const membership = await getOrganizationMembership(user.id, organizationId);
  if (!hasCapability("creative.write", { membershipRole: membership?.membership_role, legacyRole: user.role })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if(placementId){const target=await getDb().query("SELECT id FROM placements WHERE id=$1 AND campaign_id=$2 AND status<>'cancelled'",[placementId,campaignId]);if(!target.rows[0])return NextResponse.json({error:"Placement is outside this campaign"},{status:422});}
  const specs = await getDb().query<{ accepted_file_types: string[]; maximum_file_bytes: string | null }>(`SELECT specification_snapshot->'accepted_file_types' accepted_file_types, specification_snapshot->>'maximum_file_bytes' maximum_file_bytes
    FROM placements WHERE campaign_id=$1 AND delivery_mode='static' AND specification_snapshot IS NOT NULL AND ($2='' OR id=$2)`, [campaignId,placementId]);
  const allowed = specs.rows.length ? specs.rows.reduce<string[]>((types,row)=>types.filter(type=>Array.isArray(row.accepted_file_types)&&row.accepted_file_types.includes(type)),["pdf","png","jpg"]) : ["pdf", "png", "jpg"];
  const maximum = specs.rows.reduce((value, row) => row.maximum_file_bytes ? Math.min(value, Number(row.maximum_file_bytes)) : value, 50 * 1024 * 1024);
  if(!allowed.length)return NextResponse.json({error:"These placements require separate artwork files"},{status:422});
  const inspected = await inspectCreativeUpload(file, allowed, maximum);
  if (!inspected) return NextResponse.json({ error: "The file signature, type, or size does not match the selected placement specifications" }, { status: 422 });
  const assetId = existingAssetId || id("AST"); const versionId = id("CRV"); const checksum = createHash("sha256").update(inspected.bytes).digest("hex"); const now = new Date().toISOString();
  const storagePath = await storeMedia(`creative/${organizationId}/${assetId}/${versionId}.${inspected.extension}`, inspected.bytes, inspected.mimeType);
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    if (existingAssetId) {
      const asset = await client.query("SELECT id FROM creative_assets WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 FOR UPDATE", [assetId, organizationId, campaignId]);
      if (!asset.rows[0]) throw new UploadError(404, "Creative asset not found");
    } else {
      const retention = new Date(now); retention.setUTCFullYear(retention.getUTCFullYear() + 7);
      await client.query("INSERT INTO creative_assets (id,organization_id,campaign_id,name,retention_until,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [assetId, organizationId, campaignId, String(form.get("name") ?? file.name).trim() || file.name, retention.toISOString(), user.id, now]);
    }
    const next = await client.query<{ version: number }>("SELECT COALESCE(MAX(version),0)+1 version FROM creative_versions WHERE asset_id=$1", [assetId]);
    const version = Number(next.rows[0]?.version ?? 1);
    const preflight = { ...(placementId?{placementIds:[placementId]}:{}), signatureVerified: true, manualChecks: ["colour_space", "font_outlines", "effective_dpi", "complex_pdf"], specificationCount: specs.rows.length };
    await client.query("INSERT INTO creative_versions (id,asset_id,version,original_name,mime_type,size_bytes,storage_path,checksum,status,preflight,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9::jsonb,$10,$11)", [versionId, assetId, version, file.name, inspected.mimeType, inspected.bytes.byteLength, storagePath, checksum, JSON.stringify(preflight), user.id, now]);
    await client.query("UPDATE design_requests SET status='in_review',version=version+1,updated_at=$1 WHERE campaign_id=$2", [now, campaignId]);
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,next_state,metadata,retention_until,created_at) VALUES ($1,$2,$3,'creative_version',$4,'uploaded','submitted',$5::jsonb,$6,$7)", [id("EVT"), organizationId, user.id, versionId, JSON.stringify({ assetId, version }), retention(now), now]);
    await client.query("COMMIT"); return NextResponse.json({ assetId, versionId, version, preflight }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined); await deleteStoredMedia(storagePath).catch(() => undefined);
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Artwork could not be saved; retry the file" }, { status: 500 });
  } finally { client.release(); }
}

class UploadError extends Error { constructor(public status: number, message: string) { super(message); } }
function id(prefix: string) { return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
function retention(value: string) { const date = new Date(value); date.setUTCFullYear(date.getUTCFullYear() + 7); return date.toISOString(); }
