import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { getDb, getOrganizationMembership, initializeDatabase } from "../../../lib/db";
import { organizationIdsForUser } from "../../../lib/campaigns";
import { hasCapability } from "../../../lib/capabilities";
import { isFeatureEnabled } from "../../../lib/feature-flags";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initializeDatabase();
  const orgs = await organizationIdsForUser(user);
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20)));
  const query = `%${request.nextUrl.searchParams.get("q")?.trim() ?? ""}%`;
  const total = await getDb().query<{ count: string }>("SELECT COUNT(*) count FROM agency_clients WHERE agency_organization_id=ANY($1::text[]) AND name ILIKE $2", [orgs, query]);
  const clients = await getDb().query(`SELECT agency_clients.*, COALESCE(json_agg(brands ORDER BY brands.name) FILTER (WHERE brands.id IS NOT NULL),'[]') brands
    FROM agency_clients LEFT JOIN brands ON brands.client_id=agency_clients.id
    WHERE agency_organization_id=ANY($1::text[]) AND agency_clients.name ILIKE $2
    GROUP BY agency_clients.id ORDER BY lower(agency_clients.name) LIMIT $3 OFFSET $4`, [orgs, query, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ clients: clients.rows, total: Number(total.rows[0]?.count ?? 0), page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const organizationId = String(body.organizationId ?? "");
  const membership = await getOrganizationMembership(user.id, organizationId);
  if (user.role !== "admin" && !hasCapability("clients.manage", { membershipRole: membership?.membership_role, legacyRole: user.role })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const org = await getDb().query("SELECT id FROM organizations WHERE id=$1 AND type='agency' AND status='active'", [organizationId]);
  if (!org.rows[0] || !String(body.name ?? "").trim()) return NextResponse.json({ error: "An active agency and client name are required" }, { status: 422 });
  const now = new Date().toISOString();
  const clientId = id("CLI");
  await getDb().query("INSERT INTO agency_clients (id,agency_organization_id,name,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)", [clientId, organizationId, String(body.name).trim(), now]);
  let brandId: string | null = null;
  if (String(body.brandName ?? "").trim()) {
    brandId = id("BRD");
    await getDb().query("INSERT INTO brands (id,client_id,name,default_language,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)", [brandId, clientId, String(body.brandName).trim(), body.defaultLanguage === "fr" ? "fr" : "en", now]);
  }
  return NextResponse.json({ clientId, brandId }, { status: 201 });
}

function id(prefix: string) { return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
