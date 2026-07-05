#!/usr/bin/env node

const { existsSync, copyFileSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const envExamplePath = path.join(root, ".env.example");
const envLocalPath = path.join(root, ".env.local");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  console.log(`[init] ${message}`);
}

function warn(message) {
  console.warn(`[init] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return values;
      }

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        return values;
      }

      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

function commandWorks(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
}

function maskConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function waitForDatabase(connectionString, label) {
  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch {
    fail("The pg package is not installed. Run npm install, then run npm run init again.");
  }

  log(`Waiting for ${label} at ${maskConnectionString(connectionString)}`);

  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 1000,
      max: 1,
    });

    try {
      await pool.query("select 1");
      await pool.end();
      log(`${label} is ready.`);
      return true;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => {});
      await wait(1000);
    }
  }

  fail(`${label} is not reachable yet. Last error: ${lastError?.message ?? "unknown error"}`);
}

async function main() {
  log("Initializing local project environment.");

  if (!existsSync(envExamplePath)) {
    fail(".env.example is missing, so the initializer cannot create .env.local.");
  }

  if (!existsSync(envLocalPath)) {
    copyFileSync(envExamplePath, envLocalPath);
    log("Created .env.local from .env.example.");
  } else {
    log(".env.local already exists; leaving it unchanged.");
  }

  const env = {
    ...parseEnvFile(envExamplePath),
    ...parseEnvFile(envLocalPath),
    ...process.env,
  };

  const databaseUrl =
    env.DATABASE_URL ?? env.POSTGRES_URL ?? "postgres://postgres:postgres@localhost:5432/ooh_market";
  const testDatabaseUrl = env.TEST_DATABASE_URL;

  const hasDocker = commandWorks("docker", ["--version"]);
  const hasCompose = hasDocker && commandWorks("docker", ["compose", "version"]);

  if (hasCompose) {
    log("Starting PostgreSQL with Docker Compose.");
    const compose = run("docker", ["compose", "up", "-d", "postgres"]);
    if (compose.status !== 0) {
      fail("Docker Compose could not start the postgres service.");
    }
  } else {
    warn("Docker Compose was not found. Skipping automatic PostgreSQL startup.");
    warn("Make sure DATABASE_URL points to a running PostgreSQL instance.");
  }

  await waitForDatabase(databaseUrl, "DATABASE_URL");

  if (testDatabaseUrl) {
    try {
      await waitForDatabase(testDatabaseUrl, "TEST_DATABASE_URL");
    } catch (error) {
      warn(error.message);
      warn("The app database is ready, but integration or e2e tests may need the test database.");
    }
  }

  log("Initialization complete.");
  log("Next: npm run dev");
}

main().catch((error) => {
  console.error(`[init] ${error.message}`);
  process.exit(1);
});
