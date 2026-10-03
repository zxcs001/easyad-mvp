import { defineConfig, devices } from "@playwright/test";

const flags = process.env.PILOT_CAMPAIGN_FLAGS === "false" ? "false" : "true";
if (!process.env.TEST_DATABASE_URL) throw new Error("Run npm run test:pilot:e2e to prepare the isolated pilot database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: process.env.PILOT_MANAGED_SERVER === "true" ? undefined : {
    command: `"${process.execPath}" node_modules/next/dist/bin/next dev --webpack -p 3100`,
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: "false", APP_ORIGIN: "http://localhost:3100",
      FEATURE_PLAYER_CONTROL: "true", FEATURE_CAMPAIGN_MODEL_V2: flags, FEATURE_AGENCY_WORKSPACE: flags,
      FEATURE_STATIC_FULFILLMENT: flags, FEATURE_FLEET_OPERATIONS: flags, FEATURE_PAYMENTS: "false",
      // Production defaults are measured in the latency scenario; this also checks configurable timing.
      PLAYER_POLL_MS: "10000", PLAYER_HEARTBEAT_MS: "5000", PLAYER_STALE_MS: "15000",
    },
  },
});
