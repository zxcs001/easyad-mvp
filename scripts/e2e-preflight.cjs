const { Pool } = require("pg");

const connectionString = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || "postgres://postgres:postgres@localhost:5432/ooh_market";

function mask(url) {
  return url.replace(/:[^:@/]+@/, ":***@");
}

(async () => {
  const pool = new Pool({ connectionString });
  try {
    await pool.query("SELECT 1");
    if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  } catch (error) {
    console.error(`E2E PostgreSQL preflight failed for ${mask(connectionString)}`);
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Set TEST_DATABASE_URL or DATABASE_URL to a reachable PostgreSQL database before running npm run test:e2e.");
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
