import { describe, expect, test } from "vitest";
import { isDigitalInventory } from "../app/lib/inventory-delivery";

describe("digital inventory eligibility", () => {
  test("uses an explicit delivery mode as the authority", () => {
    expect(isDigitalInventory({ deliveryMode: "digital", format: "static" })).toBe(true);
    expect(isDigitalInventory({ deliveryMode: "static", format: "digital" })).toBe(false);
    expect(isDigitalInventory({ deliveryMode: "unknown", format: "digital" })).toBe(false);
  });

  test("falls back to the legacy format only when delivery mode is absent", () => {
    expect(isDigitalInventory({ format: "digital" })).toBe(true);
    expect(isDigitalInventory({ format: "static" })).toBe(false);
    expect(isDigitalInventory({ format: "transit" })).toBe(false);
  });
});
