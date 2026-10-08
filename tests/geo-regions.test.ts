import { expect, test, vi } from "vitest";
import { geoToMapPoint } from "../app/lib/geo/projection";
import { ONTARIO_LOCATION_ID, countyLocations, isRegionLocationId, loadRegionBoundaries, normalizeLocationId, ontarioLocation, regionContains, regionLocation } from "../app/lib/geo/regions";
import { createHttpPlaceSearchProvider, defaultPlaceSearchProviders, ontarioCountySearchProvider, searchPlaces } from "../app/lib/geo/search";

const barrie = geoToMapPoint(44.389, -79.69);
const toronto = geoToMapPoint(43.653, -79.383);
const thunderBay = geoToMapPoint(48.38, -89.25);
const detroit = geoToMapPoint(42.331, -83.046);

test("Ontario has its 49 census divisions as county-level locations", () => {
  expect(countyLocations).toHaveLength(49);
  expect(regionLocation("on-simcoe")?.label).toBe("Simcoe County");
  expect(regionLocation("on-york")?.label).toBe("York Region");
  expect(regionLocation("on-thunder-bay")?.label).toBe("Thunder Bay District");
  expect(ontarioLocation.bounds).toBeDefined();
});

test("older Thunder Bay links open the Thunder Bay District", () => {
  expect(normalizeLocationId("thunder-bay")).toBe("on-thunder-bay");
  expect(normalizeLocationId("waterfront")).toBe("on-thunder-bay");
  expect(isRegionLocationId("airport")).toBe(true);
  expect(isRegionLocationId(ONTARIO_LOCATION_ID)).toBe(true);
  expect(isRegionLocationId("nowhere")).toBe(false);
});

test("county membership uses boundaries, not only the bounding box", async () => {
  const simcoe = regionLocation("on-simcoe")!;
  const boundaries = await loadRegionBoundaries();
  expect(regionContains(simcoe, barrie, boundaries)).toBe(true);
  expect(regionContains(simcoe, toronto, boundaries)).toBe(false);
  expect(regionContains(regionLocation("on-toronto")!, toronto, boundaries)).toBe(true);
  expect(regionContains(ontarioLocation, thunderBay, boundaries)).toBe(true);
  // Detroit is inside Ontario's bounding box, but not in Ontario.
  expect(regionContains(ontarioLocation, detroit)).toBe(true);
  expect(regionContains(ontarioLocation, detroit, boundaries)).toBe(false);
});

test("county search ranks the closest names first", () => {
  const simcoe = ontarioCountySearchProvider.search("simcoe") as { id: string; label: string; level: string }[];
  expect(simcoe[0]).toMatchObject({ id: "on-simcoe", label: "Simcoe County", level: "county" });
  const ontario = ontarioCountySearchProvider.search("Ontario") as { id: string; level: string }[];
  expect(ontario[0]).toMatchObject({ id: ONTARIO_LOCATION_ID, level: "province" });
  const york = ontarioCountySearchProvider.search("york") as { label: string }[];
  expect(york[0].label).toBe("York Region");
  expect(ontarioCountySearchProvider.search("")).toEqual([]);
});

test("street level is a provider that is added by configuration", () => {
  expect(defaultPlaceSearchProviders({}).map((provider) => provider.id)).toEqual(["ontario-counties"]);
  expect(defaultPlaceSearchProviders({ NEXT_PUBLIC_STREET_SEARCH_ENDPOINT: "/api/geocode" }).map((provider) => provider.levels)).toEqual([["province", "county"], ["street"]]);
});

test("a street provider's results join county results, and a failing provider is skipped", async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ results: [{ label: "100 Queen St W", detail: "Toronto", lat: 43.6525, lng: -79.3839 }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const street = createHttpPlaceSearchProvider({ id: "street", endpoint: "https://example.test/geocode" });
  const broken = { id: "broken", levels: ["street" as const], search: async () => { throw new Error("down"); } };
  const results = await searchPlaces("toronto", [ontarioCountySearchProvider, street, broken]);
  expect(results[0]).toMatchObject({ id: "on-toronto", level: "county" });
  expect(results.some((result) => result.level === "street" && result.label === "100 Queen St W")).toBe(true);
  expect(String(fetchMock.mock.calls[0][0])).toContain("q=toronto");
  vi.unstubAllGlobals();
});
