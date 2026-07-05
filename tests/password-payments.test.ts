import * as assert from "node:assert/strict";
import { test } from "vitest";
import { hashPassword, isAcceptablePassword, verifyPassword } from "../app/lib/password";
import { processCharge, processRefund } from "../app/lib/payments";
import { canManageInventoryRecord, canReadBooking, canSubmitCreative } from "../app/lib/auth";
import type { DbUser } from "../app/lib/db";

test("password hashes verify the original password only", () => {
  const firstHash = hashPassword("TempPassword!2026");
  const secondHash = hashPassword("TempPassword!2026");

  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyPassword("TempPassword!2026", firstHash), true);
  assert.equal(verifyPassword("wrong-password", firstHash), false);
  assert.equal(verifyPassword("TempPassword!2026", "malformed-hash"), false);
  assert.equal(isAcceptablePassword("short1"), false);
  assert.equal(isAcceptablePassword("letters-only"), false);
  assert.equal(isAcceptablePassword("StrongPass2026"), true);
});

test("mock payment gateway accepts positive charges and rejects invalid amounts", () => {
  const approved = processCharge({ amount: 1250, method: "card" });
  assert.equal(approved.ok, true);
  assert.match(approved.gatewayRef, /^ch_[a-f0-9]{20}$/);
  assert.equal(approved.method, "card");
  assert.ok(Date.parse(approved.processedAt));

  const declined = processCharge({ amount: 0, method: "card" });
  assert.equal(declined.ok, false);
  assert.equal(declined.gatewayRef, "");
  assert.equal(declined.declineReason, "Invalid amount");
});

test("mock refunds preserve the original charge reference body", () => {
  assert.equal(processRefund({ gatewayRef: "ch_123abc" }).gatewayRef, "re_123abc");
  assert.match(processRefund({ gatewayRef: null }).gatewayRef, /^re_[a-f0-9]{20}$/);
});

test("creative submissions require advertiser ownership or super-admin access", () => {
  const advertiser: DbUser = { id: "USR-ADVERTISER", name: "Advertiser", email: "advertiser@example.test", role: "advertiser", status: "active", institutionId: null, operatorLimit: 0, createdAt: "2026-01-01" };
  const operator: DbUser = { id: "USR-OPERATOR", name: "Operator", email: "operator@example.test", role: "operator", status: "active", institutionId: "USR-INSTITUTION", operatorLimit: 0, createdAt: "2026-01-01" };
  const admin: DbUser = { id: "USR-ADMIN", name: "Admin", email: "admin@example.test", role: "admin", status: "active", institutionId: null, operatorLimit: 0, createdAt: "2026-01-01" };

  assert.equal(canSubmitCreative(advertiser, advertiser.id), true);
  assert.equal(canSubmitCreative(advertiser, "USR-ANOTHER-ADVERTISER"), false);
  assert.equal(canSubmitCreative(operator, advertiser.id), false);
  assert.equal(canSubmitCreative(admin, advertiser.id), true);
  const inventory = { institutionId: "USR-INSTITUTION" } as Parameters<typeof canManageInventoryRecord>[1];
  assert.equal(canManageInventoryRecord(operator, inventory), true);
  assert.equal(canManageInventoryRecord(operator, { ...inventory, institutionId: "USR-ANOTHER" }), false);
  assert.equal(canReadBooking(advertiser, advertiser.id, inventory), true);
  assert.equal(canReadBooking(advertiser, "USR-ANOTHER-ADVERTISER", inventory), false);
});
