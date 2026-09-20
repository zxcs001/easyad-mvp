#!/usr/bin/env node

const { pbkdf2Sync, randomBytes } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { AREA_INCOME, SPOT_SECONDS, mapPosition, screens } = require("./demo-data/thunder-bay.cjs");
const { buildDemoCampaigns } = require("./demo-data/bookings.cjs");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const schemaPath = path.join(root, "database", "schema.sql");
const credentialsPath = path.join(root, "DEMO_ACCOUNTS.md");
const currentYear = new Date().getUTCFullYear();

const accounts = [
  {
    key: "government-owner",
    id: "USR-DEMO-GOV-TB",
    name: "City of Thunder Bay Screen Operations",
    role: "institutional",
    operatorLimit: 4,
  },
  {
    key: "government-operator-primary",
    id: "USR-DEMO-GOV-OP-01",
    name: "Maya Chen — Civic Screen Operator",
    role: "operator",
    institutionKey: "government-owner",
  },
  {
    key: "government-operator-backup",
    id: "USR-DEMO-GOV-OP-02",
    name: "Noah Martin — Civic Communications",
    role: "operator",
    institutionKey: "government-owner",
  },
  {
    key: "institution-owner",
    id: "USR-DEMO-INST-LU",
    name: "Lakehead University Campus Media",
    role: "institutional",
    operatorLimit: 3,
  },
  {
    key: "institution-operator",
    id: "USR-DEMO-INST-OP-01",
    name: "Priya Singh — Campus Media Operator",
    role: "operator",
    institutionKey: "institution-owner",
  },
  {
    key: "advertiser-local",
    id: "USR-DEMO-ADV-01",
    name: "Northline Fitness Marketing",
    role: "advertiser",
  },
  {
    key: "advertiser-retail",
    id: "USR-DEMO-ADV-02",
    name: "Atlas Grocery Campaign Team",
    role: "advertiser",
  },
  {
    key: "advertiser-agency",
    id: "USR-DEMO-ADV-03",
    name: "North Shore Media Buying",
    role: "advertiser",
  },
];

// The twelve Thunder Bay screens live in scripts/demo-data/thunder-bay.cjs, with
// the sources for every number in docs/DEMO_DATA_RESEARCH.md. The map stores
// percentages, so each position is derived from the real coordinates.
const devices = screens.map((screen) => ({
  ...screen,
  ...mapPosition(screen.latitude, screen.longitude),
  income: AREA_INCOME,
  // A static face has no loop. It holds one poster, so one slot fills it and a
  // second overlapping booking is refused. Giving it a loop invented capacity
  // that the face does not have.
  imageInterval: screen.deliveryMode === "static" ? 1 : SPOT_SECONDS,
  maxLoopSeconds: screen.deliveryMode === "static" ? 1 : screen.loopSeconds,
  approvalStatus: "approved",
  productionLeadDays: screen.productionLeadDays ?? 0,
  installationLeadDays: screen.installationLeadDays ?? 0,
  specification: screen.deliveryMode === "static"
    ? { trimWidthMm: 3048, trimHeightMm: 1524, visibleWidthMm: 2946, visibleHeightMm: 1422, bleedMm: 25, safeAreaMm: 76, scaleRatio: "1:10", minimumDpi: 150, colourSpace: "CMYK", acceptedFileTypes: ["pdf", "jpg"], maxFileMb: 250, bleedNotes: "Keep critical copy inside the safe area.", mountingNotes: "Bulletin face, illuminated.", finishingNotes: "Hemmed and grommeted vinyl.", proofingNotes: "Dated posting photograph within five business days.", colourProfile: "GRACoL 2013", version: 1 }
    : undefined,
}));

function parseEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")];
    }));
}

function parseCredentials(filePath) {
  if (!existsSync(filePath)) {
    throw new Error("DEMO_ACCOUNTS.md was not found. It is a required local-only file and must never be committed.");
  }

  const credentials = new Map();
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`(.*)`$/, "$1"));
    const [id, , email, password] = cells;
    if (id?.startsWith("USR-DEMO-")) credentials.set(id, { email, password });
  }

  for (const account of accounts) {
    const entry = credentials.get(account.id);
    if (!entry?.email || !entry?.password) throw new Error(`Missing local credentials for ${account.id} in DEMO_ACCOUNTS.md.`);
  }
  return credentials;
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

async function upsertAccount(client, account, savedByKey) {
  const institutionId = account.institutionKey ? savedByKey.get(account.institutionKey)?.id : null;
  if (account.institutionKey && !institutionId) {
    throw new Error(`Institution ${account.institutionKey} must be seeded before ${account.key}.`);
  }

  const collision = await client.query(
    "SELECT id, email FROM users WHERE id = $1 OR email = $2",
    [account.id, account.email],
  );
  if (collision.rows.some((entry) => entry.id !== account.id || entry.email !== account.email)) {
    throw new Error(`Stable demo identity collision for ${account.id} / ${account.email}.`);
  }

  const result = await client.query(`
    INSERT INTO users
      (id, name, email, password_hash, role, status, institution_id, operator_limit, created_at)
    VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      status = 'active',
      institution_id = EXCLUDED.institution_id,
      operator_limit = EXCLUDED.operator_limit
    RETURNING id, name, email, role, status, institution_id, operator_limit
  `, [
    account.id,
    account.name,
    account.email,
    hashPassword(account.password),
    account.role,
    account.role === "operator" ? institutionId : null,
    account.role === "institutional" ? account.operatorLimit ?? 0 : 0,
    new Date().toISOString(),
  ]);
  return result.rows[0];
}

async function upsertDevice(client, device, savedByKey, now) {
  const institution = savedByKey.get(device.institutionKey);
  const manager = savedByKey.get(device.managerKey);
  if (!institution || institution.role !== "institutional") throw new Error(`Invalid owner for ${device.id}.`);
  if (!manager || (manager.id !== institution.id && manager.institution_id !== institution.id)) {
    throw new Error(`Manager ${device.managerKey} is outside the owning institution for ${device.id}.`);
  }

  await client.query(`
    INSERT INTO inventory
      (id, name, operator, format, x, y, address, price, impressions, traffic, income, audience, competitor, occupancy,
       image_interval, max_loop_seconds, available_from, available_to, approval_status, tags, display_template,
       comments_enabled, institution_id, created_by, created_at, updated_at, owner_organization_id, delivery_mode, product_type, production_lead_days, installation_lead_days,
       latitude, longitude, measurement_source, measurement_updated_at,
       content_visibility, advertising_opt_in)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21,
       TRUE, $22, $23, $24, $24, $25, $26, $27, $28, $29, $30, $31, $32, $24,
       'public', TRUE)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      operator = EXCLUDED.operator,
      format = EXCLUDED.format,
      x = EXCLUDED.x,
      y = EXCLUDED.y,
      address = EXCLUDED.address,
      price = EXCLUDED.price,
      impressions = EXCLUDED.impressions,
      traffic = EXCLUDED.traffic,
      income = EXCLUDED.income,
      audience = EXCLUDED.audience,
      competitor = EXCLUDED.competitor,
      occupancy = EXCLUDED.occupancy,
      image_interval = EXCLUDED.image_interval,
      max_loop_seconds = EXCLUDED.max_loop_seconds,
      available_from = EXCLUDED.available_from,
      available_to = EXCLUDED.available_to,
      approval_status = EXCLUDED.approval_status,
      tags = EXCLUDED.tags,
      display_template = EXCLUDED.display_template,
      comments_enabled = EXCLUDED.comments_enabled,
      institution_id = EXCLUDED.institution_id,
      created_by = EXCLUDED.created_by,
      updated_at = EXCLUDED.updated_at
      ,owner_organization_id = EXCLUDED.owner_organization_id
      ,delivery_mode = EXCLUDED.delivery_mode
      ,product_type = EXCLUDED.product_type
      ,production_lead_days = EXCLUDED.production_lead_days
      ,installation_lead_days = EXCLUDED.installation_lead_days
      ,latitude = EXCLUDED.latitude
      ,longitude = EXCLUDED.longitude
      ,measurement_source = EXCLUDED.measurement_source
      ,measurement_updated_at = EXCLUDED.measurement_updated_at
      -- The marketplace lists a screen only when its owner made it public and
      -- opted in. A demo screen that stays out of the list makes Find screens
      -- read as a broken product.
      ,content_visibility = EXCLUDED.content_visibility
      ,advertising_opt_in = EXCLUDED.advertising_opt_in
  `, [
    device.id,
    device.name,
    institution.name,
    device.format,
    device.x,
    device.y,
    device.address,
    device.price,
    device.impressions,
    device.traffic,
    device.income,
    device.audience,
    device.competitor,
    device.occupancy,
    device.imageInterval,
    device.maxLoopSeconds,
    `${currentYear}-01-01`,
    `${currentYear + 1}-12-31`,
    device.approvalStatus,
    JSON.stringify(device.tags),
    device.displayTemplate,
    institution.id,
    manager.id,
    now,
    `ORG-${institution.id}`,
    device.deliveryMode ?? (device.format === "digital" ? "digital" : "unknown"),
    device.productType ?? device.format,
    device.productionLeadDays ?? 0,
    device.installationLeadDays ?? 0,
    device.latitude ?? null,
    device.longitude ?? null,
    // Says plainly whether a figure is published or estimated, so nobody quotes
    // an estimate as a measurement.
    device.measurementSource ?? null,
  ]);

  if (device.specification) {
    const spec = device.specification;
    await client.query("UPDATE inventory_specifications SET status = 'retired' WHERE inventory_id = $1", [device.id]);
    await client.query(`INSERT INTO inventory_specifications
      (id, inventory_id, version, status, trim_width_mm, trim_height_mm, visible_width_mm, visible_height_mm, bleed_mm, safe_area_mm, scale_ratio, minimum_dpi, colour_space, accepted_file_types, maximum_file_bytes, substrate, finishing, notes, created_by, created_at)
      VALUES ($1,$2,1,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (inventory_id, version) DO UPDATE SET status='active', trim_width_mm=EXCLUDED.trim_width_mm, trim_height_mm=EXCLUDED.trim_height_mm, visible_width_mm=EXCLUDED.visible_width_mm, visible_height_mm=EXCLUDED.visible_height_mm, bleed_mm=EXCLUDED.bleed_mm, safe_area_mm=EXCLUDED.safe_area_mm, scale_ratio=EXCLUDED.scale_ratio, minimum_dpi=EXCLUDED.minimum_dpi, colour_space=EXCLUDED.colour_space, accepted_file_types=EXCLUDED.accepted_file_types, maximum_file_bytes=EXCLUDED.maximum_file_bytes, substrate=EXCLUDED.substrate, finishing=EXCLUDED.finishing, notes=EXCLUDED.notes`,
      [`SPEC-${device.id}`, device.id, spec.trimWidthMm, spec.trimHeightMm, spec.visibleWidthMm, spec.visibleHeightMm, spec.bleedMm, spec.safeAreaMm, spec.scaleRatio, spec.minimumDpi, spec.colourSpace, JSON.stringify(spec.acceptedFileTypes), spec.maximumFileBytes, spec.substrate, spec.finishing, spec.notes, manager.id, now]);
  }
}

// A year of campaigns: bookings, creatives, invoices, proof of play and the
// approval trail. Without these, Find screens, Performance and Invoices all show
// empty states and the demo never shows the product working.
async function seedCampaigns(client, savedByKey) {
  const set = buildDemoCampaigns({ today: new Date(), target: 420 });

  // Only rows this seeder owns. A device or booking somebody made by hand in
  // the demo keeps its own id and is left alone. Deleting the bookings cascades
  // to their creatives, invoices, proof-of-play rows and approval events.
  await client.query("DELETE FROM bookings WHERE id LIKE 'BK-TB-%'");

  for (const booking of set.bookings) {
    const creator = savedByKey.get(booking.accountKey);
    if (!creator) throw new Error(`Unknown booking account ${booking.accountKey}`);
    await client.query(`
      INSERT INTO bookings (id, advertiser, inventory_id, campaign, start_date, end_date, ad_slots,
        creative_status, status, spend, paid, pop, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
    `, [booking.id, booking.advertiser, booking.inventoryId, booking.campaign, booking.start, booking.end,
      booking.adSlots, booking.creativeStatus, booking.status, booking.spend, booking.paid, booking.pop,
      creator.id, booking.createdAt]);
  }

  for (const creative of set.creatives) {
    await client.query(`
      INSERT INTO creatives (id, booking_id, source, template, format, width, height, file_type, file_size,
        safe_zone, distortion, original_name, mime_type, public_url, storage_path, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [creative.id, creative.bookingId, creative.source, creative.template, creative.format, creative.width,
      creative.height, creative.fileType, creative.fileSize, creative.safeZone, creative.distortion,
      creative.source === "upload" ? `${creative.template}-artwork.${creative.fileType}` : null,
      creative.source === "upload" ? `image/${creative.fileType === "mp4" ? "mp4" : creative.fileType}` : null,
      null, null, creative.status, creative.createdAt]);
  }

  for (const transaction of set.transactions) {
    await client.query(`
      INSERT INTO transactions (id, booking_id, advertiser, amount, platform_fee, operator_payout, status,
        method, gateway_ref, created_at, paid_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [transaction.id, transaction.bookingId, transaction.advertiser, transaction.amount, transaction.platformFee,
      transaction.operatorPayout, transaction.status, transaction.method, transaction.gatewayRef,
      transaction.createdAt, transaction.paidAt]);
  }

  for (const log of set.popLogs) {
    await client.query(`
      INSERT INTO pop_logs (id, booking_id, inventory_id, plays, impressions, status, source, played_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [log.id, log.bookingId, log.inventoryId, log.plays, log.impressions, log.status, log.source, log.playedAt]);
  }

  for (const event of set.approvalEvents) {
    const actor = savedByKey.get(event.actorKey);
    if (!actor) continue;
    await client.query(`
      INSERT INTO approval_events (id, booking_id, actor_id, action, previous_status, next_status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [event.id, event.bookingId, actor.id, event.action, event.previousStatus, event.nextStatus, event.createdAt]);
  }

  return set.summary;
}

async function main() {
  const credentials = parseCredentials(credentialsPath);
  const seededAccounts = accounts.map((account) => ({ ...account, ...credentials.get(account.id) }));
  const env = { ...parseEnv(envPath), ...process.env };
  const connectionString = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  const databaseUrl = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if ((!localHosts.has(databaseUrl.hostname) || env.NODE_ENV === "production") && env.ALLOW_REMOTE_DEMO_DATA !== "1") {
    throw new Error("Refusing to seed demo data outside a local development database. Set ALLOW_REMOTE_DEMO_DATA=1 only when this is intentional.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(schemaPath, "utf8"));

    const savedByKey = new Map();
    for (const account of seededAccounts.filter((entry) => entry.role === "institutional")) {
      savedByKey.set(account.key, await upsertAccount(client, account, savedByKey));
    }
    for (const account of seededAccounts.filter((entry) => entry.role !== "institutional")) {
      savedByKey.set(account.key, await upsertAccount(client, account, savedByKey));
    }

    for (const account of seededAccounts) {
      const saved = savedByKey.get(account.key);
      const institution = account.institutionKey ? savedByKey.get(account.institutionKey) : null;
      const organizationId = institution ? `ORG-${institution.id}` : `ORG-${saved.id}`;
      if (!institution) {
        const organizationType = account.key === "advertiser-agency" ? "agency" : account.role === "advertiser" ? "advertiser" : account.role === "institutional" ? "institution" : "media_owner";
        await client.query("INSERT INTO organizations (id,name,type,status,created_at,updated_at) VALUES ($1,$2,$3,'active',NOW()::text,NOW()::text) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,updated_at=EXCLUDED.updated_at", [organizationId, saved.name, organizationType]);
      }
      await client.query("INSERT INTO organization_memberships (organization_id,user_id,membership_role,created_at) VALUES ($1,$2,$3,NOW()::text) ON CONFLICT (organization_id,user_id) DO UPDATE SET membership_role=EXCLUDED.membership_role", [organizationId, saved.id, account.role === "operator" ? "operations" : "owner"]);
    }

    const agency = savedByKey.get("advertiser-agency");
    await client.query("INSERT INTO agency_clients (id,agency_organization_id,name,status,created_at,updated_at) VALUES ('CLI-DEMO-NORTH-SHORE-01',$1,'Harbour Dental Group','active',NOW()::text,NOW()::text) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status='active',updated_at=EXCLUDED.updated_at", [`ORG-${agency.id}`]);
    await client.query("INSERT INTO brands (id,client_id,name,default_language,created_at,updated_at) VALUES ('BRD-DEMO-HARBOUR-01','CLI-DEMO-NORTH-SHORE-01','Harbour Smiles','en',NOW()::text,NOW()::text) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=EXCLUDED.updated_at");

    const now = new Date().toISOString();
    for (const device of devices) await upsertDevice(client, device, savedByKey, now);

    // Demo screens this seeder no longer ships. A device created by hand in the
    // demo has its own id and is not touched.
    const removed = await client.query(
      "DELETE FROM inventory WHERE id LIKE 'INV-DEMO-%' AND NOT (id = ANY($1::text[])) RETURNING id",
      [devices.map((device) => device.id)],
    );

    const campaigns = await seedCampaigns(client, savedByKey);

    // Occupancy is reported, not declared. The generator measures the share of
    // each loop it sold over the past year, and that measured figure replaces
    // the estimate on the device. A screen that says 65% while its calendar
    // holds two campaigns is the first thing a buyer catches.
    for (const [screenId, occupancy] of Object.entries(campaigns.occupancy)) {
      await client.query("UPDATE inventory SET occupancy = $2 WHERE id = $1", [screenId, occupancy]);
    }

    await client.query("DELETE FROM sessions WHERE user_id = ANY($1::text[])", [seededAccounts.map((account) => account.id)]);

    const verification = await client.query(`
      SELECT inventory.id, inventory.institution_id, inventory.created_by
      FROM inventory
      WHERE inventory.id = ANY($1::text[])
    `, [devices.map((device) => device.id)]);
    if (verification.rowCount !== devices.length) throw new Error("Not all demo devices were persisted.");

    await client.query("COMMIT");
    console.log(`Created or updated ${seededAccounts.length} demo users and ${devices.length} demo devices.`);
    if (removed.rowCount) console.log(`Removed ${removed.rowCount} demo devices this seed no longer ships.`);
    console.log(`Seeded ${campaigns.bookings} bookings across ${campaigns.campaigns} campaigns, ${campaigns.windowStart} to ${campaigns.windowEnd}.`);
    console.log(`  states: ${Object.entries(campaigns.byStatus).map(([state, count]) => `${state} ${count}`).join(", ")}`);
    console.log(`  revenue: $${campaigns.revenue.toLocaleString("en-CA")} booked; ${campaigns.cityNotices} city notices at no cost.`);
    console.log("Reference: docs/DEMO_USERS_AND_DEVICES.md and docs/DEMO_DATA_RESEARCH.md");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[seed:demo-data] ${error.message}`);
  process.exit(1);
});
