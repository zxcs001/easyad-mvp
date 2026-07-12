#!/usr/bin/env node

const { pbkdf2Sync, randomBytes } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const accountsPath = path.join(root, "TEMP_ACCOUNTS.txt");
const envPath = path.join(root, ".env.local");

const accountDefinitions = {
  "Super admin": { id: "USR-TEMP-ADMIN", name: "Temporary Super Admin", role: "admin" },
  "Inventory operator": { id: "USR-TEMP-OPERATOR", name: "Temporary Inventory Operator", role: "operator" },
  "Institutional user": { id: "USR-TEMP-INSTITUTION", name: "Temporary Civic Institution", role: "institutional" },
  "Institution operator (belongs to Temporary Civic Institution)": { id: "USR-TEMP-INSTITUTION-OPERATOR", name: "Temporary Institution Operator", role: "operator" },
  "Advertiser": { id: "USR-TEMP-ADVERTISER", name: "Temporary Advertiser", role: "advertiser" },
};

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

function parseAccounts(contents) {
  const accounts = [];
  let current = null;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (Object.hasOwn(accountDefinitions, line)) {
      current = { ...accountDefinitions[line], heading: line };
      accounts.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Email:")) current.email = line.slice("Email:".length).trim().toLowerCase();
    if (line.startsWith("Password:")) current.password = line.slice("Password:".length).trim();
    if (line.startsWith("Operator seats:")) current.operatorLimit = Number(line.slice("Operator seats:".length).trim());
  }

  if (accounts.length !== Object.keys(accountDefinitions).length) {
    throw new Error(`Expected ${Object.keys(accountDefinitions).length} account sections in TEMP_ACCOUNTS.txt, found ${accounts.length}.`);
  }
  for (const account of accounts) {
    if (!account.email || !account.password) throw new Error(`Missing email or password for ${account.heading}.`);
  }
  return accounts;
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

async function upsertUser(client, account, institutionId = null) {
  const result = await client.query(`
    INSERT INTO users
      (id, name, email, password_hash, role, status, institution_id, operator_limit, created_at)
    VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
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

async function main() {
  if (!existsSync(accountsPath)) throw new Error("TEMP_ACCOUNTS.txt was not found.");
  const accounts = parseAccounts(readFileSync(accountsPath, "utf8"));
  const env = { ...parseEnv(envPath), ...process.env };
  const connectionString = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  const databaseUrl = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if ((!localHosts.has(databaseUrl.hostname) || env.NODE_ENV === "production") && env.ALLOW_REMOTE_TEMP_ACCOUNTS !== "1") {
    throw new Error("Refusing to create temporary accounts outside a local development database. Set ALLOW_REMOTE_TEMP_ACCOUNTS=1 only when this is intentional.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('advertiser', 'operator', 'institutional', 'admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
        institution_id TEXT,
        operator_limit INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);

    const institution = accounts.find((account) => account.role === "institutional");
    const institutionUser = await upsertUser(client, institution);
    const saved = [institutionUser];
    for (const account of accounts.filter((entry) => entry !== institution)) {
      saved.push(await upsertUser(client, account, account.role === "operator" ? institutionUser.id : null));
    }
    const sessionsTable = await client.query("SELECT to_regclass('public.sessions') AS table_name");
    if (sessionsTable.rows[0]?.table_name) {
      await client.query("DELETE FROM sessions WHERE user_id = ANY($1::text[])", [saved.map((account) => account.id)]);
    }
    await client.query("COMMIT");

    console.log(`Created or updated ${saved.length} temporary accounts:`);
    for (const account of saved.sort((left, right) => left.role.localeCompare(right.role))) {
      const scope = account.institution_id ? `, institution ${account.institution_id}` : "";
      console.log(`- ${account.email} (${account.role}${scope})`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[seed:temp-accounts] ${error.message}`);
  process.exit(1);
});
