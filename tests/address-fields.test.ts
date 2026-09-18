import { describe, expect, it } from "vitest";
import { addressIssue, composeAddress, formatPostalCode, parseAddress } from "../app/component/address-fields";

describe("address fields", () => {
  it("reads a full Canadian address", () => {
    expect(parseAddress("955 Oliver Rd, Thunder Bay, ON P7B 5E1")).toEqual({
      street: "955 Oliver Rd",
      city: "Thunder Bay",
      province: "ON",
      postalCode: "P7B 5E1",
    });
  });

  it("reads an address without a postal code", () => {
    expect(parseAddress("500 Donald Street East, Thunder Bay, ON")).toEqual({
      street: "500 Donald Street East",
      city: "Thunder Bay",
      province: "ON",
      postalCode: "",
    });
  });

  it("keeps a street that carries its own comma", () => {
    const parts = parseAddress("Marina Park Drive, Unit 2, Thunder Bay, ON");
    expect(parts.street).toBe("Marina Park Drive, Unit 2");
    expect(parts.city).toBe("Thunder Bay");
  });

  it("accepts a province written in full", () => {
    expect(parseAddress("1 Main St, Toronto, Ontario").province).toBe("ON");
  });

  it("treats a legacy one-line value as the street", () => {
    expect(parseAddress("New market location")).toEqual({
      street: "New market location",
      city: "",
      province: "",
      postalCode: "",
    });
  });

  it("returns empty parts for an empty value", () => {
    expect(parseAddress("   ")).toEqual({ street: "", city: "", province: "", postalCode: "" });
  });

  it("composes the stored line and survives a round trip", () => {
    const parts = { street: "955 Oliver Rd", city: "Thunder Bay", province: "ON", postalCode: "P7B 5E1" };
    const line = composeAddress(parts);
    expect(line).toBe("955 Oliver Rd, Thunder Bay, ON P7B 5E1");
    expect(parseAddress(line)).toEqual(parts);
  });

  it("drops the parts that are still empty", () => {
    expect(composeAddress({ street: "955 Oliver Rd", city: "", province: "", postalCode: "" })).toBe("955 Oliver Rd");
  });

  it("tidies spacing and stray commas", () => {
    expect(composeAddress({ street: "  955   Oliver Rd , ", city: " Thunder Bay ", province: "ON", postalCode: "" }))
      .toBe("955 Oliver Rd, Thunder Bay, ON");
  });

  it("formats a postal code", () => {
    expect(formatPostalCode("p7b5e1")).toBe("P7B 5E1");
    expect(formatPostalCode("P7B 5E1")).toBe("P7B 5E1");
  });

  it("names the first missing field, one at a time", () => {
    expect(addressIssue("")).toBe("Add the street address, so an operator can find the screen.");
    expect(addressIssue("955 Oliver Rd")).toBe("Add the city, so the public page can say where the screen is.");
    expect(addressIssue("955 Oliver Rd, Thunder Bay")).toBe("Choose the province or territory.");
  });

  it("accepts a complete address", () => {
    expect(addressIssue("955 Oliver Rd, Thunder Bay, ON")).toBe("");
    expect(addressIssue("955 Oliver Rd, Thunder Bay, ON P7B 5E1")).toBe("");
  });
});
