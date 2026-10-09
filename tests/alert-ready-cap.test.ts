import { describe, expect, test } from "vitest";
import { capKey, CapError, parseCap, trustedCertificatesFromEnvironment, verifyCapSignature } from "../app/lib/alert-ready/cap";
import { censusDivisionAt, matchScreens } from "../app/lib/alert-ready/match";
import { alertTypeFor } from "../app/lib/alert-ready/relay";
import { capXml, heartbeatXml, otherSigningKey, signCap, sudburyPolygon, testSigningCert } from "./helpers/cap-fixtures";

describe("CAP-CP parsing", () => {
  test("reads a bilingual NAAD alert with its SOREM flag, polygon and SGC geocode", () => {
    const alert = parseCap(capXml());
    expect(alert).toMatchObject({ sender: "cap-pac@canada.ca", status: "Actual", msgType: "Alert", isHeartbeat: false, signatureCount: 0 });
    expect(alert.infos.map((info) => info.language)).toEqual(["en-CA", "fr-CA"]);
    expect(alert.infos[0]).toMatchObject({ eventCode: "tornado", responseTypes: ["Shelter"], broadcastImmediately: true, headline: "Tornado warning in effect" });
    expect(alert.infos[0].areas[0].polygons[0][0]).toEqual([48.3, -89.4]);
    expect(alert.infos[0].areas[0].geocodes).toEqual(["3558004"]);
    expect(capKey(alert)).toBe("cap-pac@canada.ca|urn:oid:2.49.0.1.124.0000000001.2026|2026-10-09T18:00:00-00:00");
  });

  test("reads a heartbeat and the alerts it lists", () => {
    const heartbeat = parseCap(heartbeatXml(["cap-pac@canada.ca,urn:oid:1,2026-10-09T18:00:00-00:00", "cap-pac@canada.ca,urn:oid:2,2026-10-09T18:00:30-00:00"]));
    expect(heartbeat.isHeartbeat).toBe(true);
    expect(heartbeat.references.map((reference) => reference.identifier)).toEqual(["urn:oid:1", "urn:oid:2"]);
  });

  test("refuses DTDs, other XML and incomplete alerts", () => {
    expect(() => parseCap(`<!DOCTYPE a [<!ENTITY x "y">]>${capXml()}`)).toThrow(CapError);
    expect(() => parseCap("<feed/>")).toThrow(CapError);
    expect(() => parseCap("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.1\"><identifier>a</identifier></alert>")).toThrow(CapError);
    expect(() => parseCap(capXml().replace(/<sender>.*<\/sender>/, ""))).toThrow(CapError);
    expect(() => parseCap("<alert><unclosed></alert>")).toThrow(CapError);
  });

  test("maps CAP-CP events to the screen message types", () => {
    expect(alertTypeFor({ eventCode: "amber", event: "amber", responseTypes: [] })).toBe("amber");
    expect(alertTypeFor({ eventCode: "tornado", event: "tornado", responseTypes: ["Shelter"] })).toBe("weather");
    expect(alertTypeFor({ eventCode: "fire", event: "fire", responseTypes: ["Evacuate"] })).toBe("evacuation");
    expect(alertTypeFor({ eventCode: "civilEmerg", event: "civilEmerg", responseTypes: [] })).toBe("public-safety");
  });
});

describe("signatures", () => {
  const trusted = trustedCertificatesFromEnvironment(testSigningCert);

  test("an enveloped signature by a trusted certificate verifies", () => {
    expect(trusted).toHaveLength(1);
    expect(verifyCapSignature(signCap(capXml()), trusted)).toBe("verified");
    expect(trustedCertificatesFromEnvironment(Buffer.from(testSigningCert).toString("base64"))).toEqual(trusted);
  });

  test("an unsigned, untrusted or altered alert does not verify", () => {
    expect(verifyCapSignature(capXml(), trusted)).toBe("unsigned");
    expect(verifyCapSignature(signCap(capXml()), [])).toBe("no-trusted-certificate");
    expect(verifyCapSignature(signCap(capXml(), otherSigningKey), trusted)).toBe("unverified");
    const altered = signCap(capXml()).replace("Take shelter now", "Stay calm, nothing");
    expect(verifyCapSignature(altered, trusted)).toBe("unverified");
  });
});

describe("area matching", () => {
  const screen = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude, x: 0, y: 0 });
  const cityHall = screen("CITY-HALL", 48.3809, -89.2477);
  const sudbury = screen("SUDBURY", 46.49, -81.0);

  test("a polygon decides on its own when the alert has one", () => {
    const alert = parseCap(capXml({ geocodes: ["35"] }));
    expect(matchScreens(alert.infos[0], [cityHall, sudbury])).toEqual([{ inventoryId: "CITY-HALL", match: "polygon" }]);
    const elsewhere = parseCap(capXml({ polygon: sudburyPolygon }));
    expect(matchScreens(elsewhere.infos[0], [cityHall, sudbury])).toEqual([{ inventoryId: "SUDBURY", match: "polygon" }]);
  });

  test("without a polygon, SGC codes match by census division, widening a subdivision", () => {
    expect(censusDivisionAt(48.3809, -89.2477)).toBe("3558");
    const division = parseCap(capXml({ polygon: null, geocodes: ["3558"] }));
    expect(matchScreens(division.infos[0], [cityHall, sudbury])).toEqual([{ inventoryId: "CITY-HALL", match: "census-division" }]);
    const subdivision = parseCap(capXml({ polygon: null, geocodes: ["3558004"] }));
    expect(matchScreens(subdivision.infos[0], [cityHall])).toEqual([{ inventoryId: "CITY-HALL", match: "census-subdivision-approximate" }]);
    const province = parseCap(capXml({ polygon: null, geocodes: ["35"] }));
    expect(matchScreens(province.infos[0], [cityHall, sudbury]).map((match) => match.match)).toEqual(["province", "province"]);
    const quebec = parseCap(capXml({ polygon: null, geocodes: ["24"] }));
    expect(matchScreens(quebec.infos[0], [cityHall])).toEqual([]);
  });
});
