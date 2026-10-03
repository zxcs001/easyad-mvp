import { describe, expect, test } from "vitest";
import { capabilitiesFor, hasCapability } from "../app/lib/capabilities";

describe("organization capabilities and legacy compatibility", () => {
  test("keeps institutional inventory behavior during membership migration", () => {
    expect(hasCapability("inventory.manage", { legacyRole: "institutional" })).toBe(true);
    expect(hasCapability("media_plans.create", { legacyRole: "institutional" })).toBe(false);
  });

  test("separates designers, reviewers, operations, and member administration", () => {
    expect(capabilitiesFor({ membershipRole: "designer" })).toEqual(["creative.write"]);
    expect(hasCapability("creative.client_approve", { membershipRole: "reviewer" })).toBe(true);
    expect(hasCapability("creative.operator_approve", { membershipRole: "reviewer" })).toBe(false);
    expect(hasCapability("organization.members.manage", { membershipRole: "operations" })).toBe(false);
    expect(hasCapability("fulfillment.manage", { membershipRole: "operations" })).toBe(true);
  });
});
