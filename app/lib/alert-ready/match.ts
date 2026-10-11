// Which screens sit inside an official alert's area. Server only.
//
// NAAD alerts carry polygons ("strongly recommended") and Statistics Canada
// SGC geocodes. A polygon is the precise area, so when an area has one, only
// the polygon decides. Without a polygon the geocode decides: a province code
// (35) covers Ontario, a census division (4 digits) covers that division, and
// a census subdivision (7 digits) is widened to its census division because
// the platform has no subdivision boundaries. That last case is marked
// approximate so a person can see it.
import type { InventoryItem } from "../../data";
import { ontarioBoundaries } from "../geo/ontario-boundaries";
import { ontarioCensusDivisions } from "../geo/ontario-regions";
import { mapPointToLngLat } from "../geo/projection";
import type { CapArea, CapInfo } from "./cap";

export type AreaMatch = "polygon" | "census-division" | "census-subdivision-approximate" | "province";
export type ScreenMatch = { inventoryId: string; match: AreaMatch };

export function screenLatLng(screen: Pick<InventoryItem, "latitude" | "longitude" | "x" | "y">): [number, number] {
  if (Number.isFinite(screen.latitude) && Number.isFinite(screen.longitude)) return [Number(screen.latitude), Number(screen.longitude)];
  const [lng, lat] = mapPointToLngLat({ x: screen.x, y: screen.y });
  return [lat, lng];
}

/** Even-odd ray cast. `ring` holds [latitude, longitude] points. */
export function insideRing(lat: number, lng: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

/** The Ontario census division (SGC code, 4 digits) that contains a point, if any. */
export function censusDivisionAt(lat: number, lng: number) {
  for (const division of ontarioCensusDivisions) {
    const [west, south, east, north] = division.bounds;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const rings = ontarioBoundaries[division.id] ?? [];
    let inside = false;
    // Boundary rings are [lng, lat]; outer and inner rings combine even-odd.
    for (const ring of rings) if (insideRing(lat, lng, ring.map(([x, y]) => [y, x] as [number, number]))) inside = !inside;
    if (inside) return division.uid ?? null;
  }
  return null;
}

function matchArea(area: CapArea, lat: number, lng: number, division: string | null): AreaMatch | null {
  if (area.polygons.length) return area.polygons.some((ring) => insideRing(lat, lng, ring)) ? "polygon" : null;
  let best: AreaMatch | null = null;
  for (const code of area.geocodes) {
    if (code.length === 2 && code === "35") best ??= "province";
    if (division && code.length === 4 && code === division) return "census-division";
    if (division && code.length === 7 && code.startsWith(division)) best = "census-subdivision-approximate";
  }
  return best;
}

const precision: AreaMatch[] = ["polygon", "census-division", "census-subdivision-approximate", "province"];

/** Screens inside any area of the info block, with how each one matched. */
export function matchScreens(info: Pick<CapInfo, "areas">, screens: Pick<InventoryItem, "id" | "latitude" | "longitude" | "x" | "y">[]): ScreenMatch[] {
  const matches: ScreenMatch[] = [];
  for (const screen of screens) {
    const [lat, lng] = screenLatLng(screen);
    const needsDivision = info.areas.some((area) => !area.polygons.length && area.geocodes.some((code) => code.length > 2));
    const division = needsDivision ? censusDivisionAt(lat, lng) : null;
    const found = info.areas.map((area) => matchArea(area, lat, lng, division)).filter((match): match is AreaMatch => Boolean(match));
    if (found.length) matches.push({ inventoryId: screen.id, match: found.sort((a, b) => precision.indexOf(a) - precision.indexOf(b))[0] });
  }
  return matches;
}
