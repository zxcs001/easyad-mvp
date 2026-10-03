import { describe, expect, test } from "vitest";
import {
  inventoryAvailabilityLabel,
  isInventoryAvailableForDates,
  isInventoryAvailableOn,
  isMarketplaceInventoryAvailable,
  isValidAvailabilityWindow,
} from "../app/lib/inventory-availability";

const window = { availableFrom: "2026-08-01", availableTo: "2026-08-31" };

describe("physical billboard availability", () => {
  test("uses an inclusive owner-defined date window", () => {
    expect(isInventoryAvailableOn(window, "2026-08-01")).toBe(true);
    expect(isInventoryAvailableOn(window, "2026-08-31")).toBe(true);
    expect(isInventoryAvailableOn(window, "2026-07-31")).toBe(false);
    expect(inventoryAvailabilityLabel(window, "2026-09-01")).toBe("Unavailable");
  });

  test("requires the complete requested range to fit inside the window", () => {
    expect(isInventoryAvailableForDates(window, "2026-08-10", "2026-08-20")).toBe(true);
    expect(isInventoryAvailableForDates(window, "2026-07-31", "2026-08-20")).toBe(false);
    expect(isInventoryAvailableForDates(window, "2026-08-20", "2026-09-01")).toBe(false);
  });

  test("rejects invalid or reversed dates", () => {
    expect(isValidAvailabilityWindow({ availableFrom: "2026-08-31", availableTo: "2026-08-01" })).toBe(false);
    expect(isValidAvailabilityWindow({ availableFrom: "2026-02-30", availableTo: "2026-03-01" })).toBe(false);
  });

  test("date availability filters static inventory without changing digital inventory", () => {
    expect(isMarketplaceInventoryAvailable({ ...window, format: "static", deliveryMode: "static" }, "2026-09-01")).toBe(false);
    expect(isMarketplaceInventoryAvailable({ ...window, format: "digital", deliveryMode: "digital" }, "2026-09-01")).toBe(true);
  });
});
