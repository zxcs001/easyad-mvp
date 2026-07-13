const { readFileSync } = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function localEnvironment() {
  try {
    return Object.fromEntries(readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
  } catch {
    return {};
  }
}

async function main() {
  const env = { ...localEnvironment(), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const ca = env.DATABASE_SSL_CA_BASE64
    ? Buffer.from(env.DATABASE_SSL_CA_BASE64, "base64").toString("utf8")
    : env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const ssl = env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false", ...(ca ? { ca } : {}) }
    : undefined;
  const pool = new Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const schema = readFileSync(path.join(process.cwd(), "database", "schema.sql"), "utf8");
    await pool.query(schema);
    console.log("Database schema is ready.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
