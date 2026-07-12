#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const currentYear = new Date().getUTCFullYear();

const devices = [
  {
    id: "INV-TB-101",
    ownerEmail: "temp.operator@ooh.local",
    name: "Thunder Bay Airport Digital Wall",
    format: "digital",
    x: 67.23008,
    y: 40.96646,
    address: "100 Princess Street, Thunder Bay, ON",
    price: 780,
    impressions: 168000,
    traffic: 92000,
    income: 98000,
    audience: "Travelers and business professionals",
    competitor: "Low",
    occupancy: 36,
    imageInterval: 8,
    maxLoopSeconds: 120,
    approvalStatus: "approved",
    tags: ["large", "digital", "private", "commercial", "airport", "travelers", "high-income", "25-54", "indoor", "high-traffic"],
    displayTemplate: "fullscreen",
  },
  {
    id: "INV-TB-102",
    ownerEmail: "temp.operator@ooh.local",
    name: "Intercity Shopping Centre LED",
    format: "digital",
    x: 67.29667,
    y: 40.91754,
    address: "1000 Fort William Road, Thunder Bay, ON",
    price: 690,
    impressions: 142000,
    traffic: 118000,
    income: 82000,
    audience: "Retail shoppers and families",
    competitor: "High",
    occupancy: 52,
    imageInterval: 10,
    maxLoopSeconds: 150,
    approvalStatus: "approved",
    tags: ["medium", "digital", "private", "urban", "retail", "commercial", "families", "medium-income", "18-44", "near-restaurants"],
    displayTemplate: "weather",
  },
  {
    id: "INV-TB-103",
    ownerEmail: "temp.operator@ooh.local",
    name: "Harbour Expressway Billboard",
    format: "static",
    x: 67.32333,
    y: 40.86154,
    address: "Harbour Expressway at Memorial Avenue, Thunder Bay, ON",
    price: 540,
    impressions: 126000,
    traffic: 104000,
    income: 76000,
    audience: "Daily commuters and commercial traffic",
    competitor: "Medium",
    occupancy: 20,
    imageInterval: 12,
    maxLoopSeconds: 90,
    approvalStatus: "pending approval",
    tags: ["large", "physical", "private", "urban", "commercial", "commuters", "medium-income", "near-major-highway", "outdoor", "high-traffic"],
    displayTemplate: "fullscreen",
  },
  {
    id: "INV-TB-201",
    ownerEmail: "temp.institution.operator@ooh.local",
    name: "Lakehead University Transit Shelter",
    format: "transit",
    x: 67.28175,
    y: 40.89000,
    address: "955 Oliver Road, Thunder Bay, ON",
    price: 430,
    impressions: 96000,
    traffic: 74000,
    income: 61000,
    audience: "Students, faculty, and transit riders",
    competitor: "Low",
    occupancy: 44,
    imageInterval: 8,
    maxLoopSeconds: 120,
    approvalStatus: "approved",
    tags: ["small", "digital", "government", "urban", "transit", "students", "18-34", "near-university", "public-space", "walkable"],
    displayTemplate: "transit",
  },
  {
    id: "INV-TB-202",
    ownerEmail: "temp.institution.operator@ooh.local",
    name: "Marina Park Waterfront Display",
    format: "digital",
    x: 67.32117,
    y: 40.86431,
    address: "Marina Park Drive, Thunder Bay, ON",
    price: 620,
    impressions: 114000,
    traffic: 68000,
    income: 87000,
    audience: "Residents, tourists, and event visitors",
    competitor: "Medium",
    occupancy: 31,
    imageInterval: 9,
    maxLoopSeconds: 120,
    approvalStatus: "approved",
    tags: ["medium", "digital", "government", "urban", "waterfront", "tourism", "events", "families", "public-space", "near-bars-clubs"],
    displayTemplate: "community",
  },
  {
    id: "INV-TB-203",
    ownerEmail: "temp.institution.operator@ooh.local",
    name: "Fort William Civic Information Kiosk",
    format: "digital",
    x: 67.29117,
    y: 40.95185,
    address: "500 Donald Street East, Thunder Bay, ON",
    price: 470,
    impressions: 88000,
    traffic: 57000,
    income: 69000,
    audience: "Civic visitors and downtown workers",
    competitor: "Low",
    occupancy: 18,
    imageInterval: 10,
    maxLoopSeconds: 100,
    approvalStatus: "pending approval",
    tags: ["medium", "digital", "government", "urban", "civic", "downtown", "public-space", "workers", "medium-income", "accessible"],
    displayTemplate: "public-info",
  },
];

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

async function main() {
  const env = { ...parseEnv(envPath), ...process.env };
  const connectionString = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  const databaseUrl = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if ((!localHosts.has(databaseUrl.hostname) || env.NODE_ENV === "production") && env.ALLOW_REMOTE_TEST_DATA !== "1") {
    throw new Error("Refusing to create test inventory outside a local development database. Set ALLOW_REMOTE_TEST_DATA=1 only when this is intentional.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const ownersResult = await client.query(`
      SELECT id, name, email, role, status, institution_id
      FROM users
      WHERE email = ANY($1::text[])
    `, [Array.from(new Set(devices.map((device) => device.ownerEmail)))]);
    const owners = new Map(ownersResult.rows.map((owner) => [owner.email, owner]));

    for (const email of new Set(devices.map((device) => device.ownerEmail))) {
      const owner = owners.get(email);
      if (!owner || owner.role !== "operator" || owner.status !== "active" || !owner.institution_id) {
        throw new Error(`Active institutional operator ${email} was not found. Run npm run seed:temp-accounts first.`);
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        operator TEXT NOT NULL,
        format TEXT NOT NULL,
        x DOUBLE PRECISION NOT NULL,
        y DOUBLE PRECISION NOT NULL,
        address TEXT NOT NULL,
        price INTEGER NOT NULL,
        impressions INTEGER NOT NULL,
        traffic INTEGER NOT NULL,
        income INTEGER NOT NULL,
        audience TEXT NOT NULL,
        competitor TEXT NOT NULL,
        occupancy INTEGER NOT NULL,
        image_interval INTEGER NOT NULL DEFAULT 6,
        max_loop_seconds INTEGER NOT NULL DEFAULT 120,
        available_from TEXT NOT NULL,
        available_to TEXT NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'approved',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        display_template TEXT NOT NULL DEFAULT 'fullscreen',
        comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        institution_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const now = new Date().toISOString();
    for (const device of devices) {
      const owner = owners.get(device.ownerEmail);
      await client.query(`
        INSERT INTO inventory
          (id, name, operator, format, x, y, address, price, impressions, traffic, income, audience, competitor, occupancy,
           image_interval, max_loop_seconds, available_from, available_to, approval_status, tags, display_template,
           comments_enabled, institution_id, created_by, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, TRUE, $22, $23, $24, $24)
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
      `, [
        device.id,
        device.name,
        owner.name,
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
        owner.institution_id,
        owner.id,
        now,
      ]);
    }

    await client.query("COMMIT");
    console.log(`Created or updated ${devices.length} test devices:`);
    for (const device of devices) console.log(`- ${device.id}: ${device.name} (${device.ownerEmail}, ${device.approvalStatus})`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[seed:test-inventory] ${error.message}`);
  process.exit(1);
});
