import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("campaign v2 non-payment policy boundaries", () => {
  const schema = readFileSync(path.join(process.cwd(), "database/schema.sql"), "utf8");

  test("defines separate campaign, placement, creative, static and digital evidence records", () => {
    for (const table of ["campaigns", "placements", "quotes", "creative_versions", "production_jobs", "installation_work_orders", "proof_records", "digital_delivery_events", "activity_events", "notifications"]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  test("stores offline acceptance without adding payment-provider entities", () => {
    expect(schema).toContain("commercial_acceptances");
    expect(schema).toContain("method TEXT NOT NULL DEFAULT 'offline'");
    expect(schema).not.toContain("payment_intents");
    expect(schema).not.toContain("webhook_events");
  });

  test("keeps proof private and supports conflict-safe/idempotent operations", () => {
    expect(schema).toContain("client_shareable BOOLEAN NOT NULL DEFAULT FALSE");
    expect(schema).toContain("public_shareable BOOLEAN NOT NULL DEFAULT FALSE");
    expect(schema).toContain("version INTEGER NOT NULL DEFAULT 1");
    expect(schema).toContain("idempotency_records");
  });
});
