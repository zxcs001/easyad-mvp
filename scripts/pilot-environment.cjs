const { Pool } = require("pg");

// All pilot writes stay in a dedicated schema of a local test database.
async function preparePilotEnvironment() {
  const url = new URL(process.env.TEST_DATABASE_URL || "postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("Pilot checks require TEST_DATABASE_URL pointing to a local *_test database.");
  }
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try { await pool.query("CREATE SCHEMA IF NOT EXISTS easyad_player_pilot"); }
  finally { await pool.end(); }
  url.searchParams.set("options", "-csearch_path=easyad_player_pilot");
  return { ...process.env, TEST_DATABASE_URL: url.toString(), DATABASE_URL: url.toString(), DATABASE_SSL: "false", FEATURE_PAYMENTS: "false" };
}
module.exports = { preparePilotEnvironment };
