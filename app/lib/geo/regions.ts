import { geoToMapPoint, mapPointToLngLat, type PercentPoint } from "./projection";
import { ONTARIO_BOUNDS, ontarioCensusDivisions } from "./ontario-regions";

/** [west, south, east, north] in degrees. */
export type GeoBounds = readonly [number, number, number, number];

export type RawRegion = {
  id: string;
  uid: string;
  name: string;
  label: string;
  kind: string;
  center: [number, number];
  bounds: [number, number, number, number];
};

/**
 * A selectable map location. A point (current location, a map click, a future
 * street result) filters by distance. A region (province or county) filters by
 * its boundary and carries `bounds` so a map can fit it.
 */
export type MapLocation = PercentPoint & {
  id: string;
  label: string;
  level?: "province" | "county" | "street" | "point";
  kind?: string;
  bounds?: GeoBounds;
};

export const ONTARIO_LOCATION_ID = "on";

export const ontarioLocation: MapLocation = {
  id: ONTARIO_LOCATION_ID,
  label: "Ontario",
  level: "province",
  kind: "Province",
  bounds: ONTARIO_BOUNDS,
  // The populated south sits far below the bounding box centre, so the centre
  // used for distance sorting is near the province's population centre.
  ...geoToMapPoint(44.5, -79.5),
};

export const countyLocations: MapLocation[] = ontarioCensusDivisions.map((region) => ({
  id: region.id,
  label: region.label,
  level: "county",
  kind: region.kind,
  bounds: region.bounds,
  ...geoToMapPoint(region.center[1], region.center[0]),
}));

export const regionLocations: MapLocation[] = [ontarioLocation, ...countyLocations];
const regionsById = new Map(regionLocations.map((region) => [region.id, region]));

// Older links named Thunder Bay neighbourhoods. They now open the district.
const legacyLocationIds: Record<string, string> = {
  "thunder-bay": "on-thunder-bay",
  downtown: "on-thunder-bay",
  airport: "on-thunder-bay",
  university: "on-thunder-bay",
  retail: "on-thunder-bay",
  waterfront: "on-thunder-bay",
};

export function normalizeLocationId(id: string | null | undefined) {
  if (!id) return undefined;
  return legacyLocationIds[id] ?? id;
}

export function isRegionLocationId(id: string | null | undefined) {
  return Boolean(id && regionsById.has(normalizeLocationId(id)!));
}

export function regionLocation(id: string | null | undefined) {
  return id ? regionsById.get(normalizeLocationId(id)!) : undefined;
}

export type RegionBoundaries = Record<string, number[][][]>;

/** Loads the boundary rings on demand; they are only needed for filtering. */
export async function loadRegionBoundaries(): Promise<RegionBoundaries> {
  return (await import("./ontario-boundaries")).ontarioBoundaries;
}

function inBounds(bounds: GeoBounds, lng: number, lat: number) {
  return lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];
}

// Even-odd rule over every ring, so holes and islands both work.
function inRings(rings: number[][][], lng: number, lat: number) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether a stored map position falls inside a region. Without boundaries
 * (still loading) it uses the bounding box, which can include a strip of the
 * neighbouring county.
 */
export function regionContains(region: MapLocation, point: PercentPoint, boundaries?: RegionBoundaries | null) {
  if (!region.bounds) return false;
  const [lng, lat] = mapPointToLngLat(point);
  if (!inBounds(region.bounds, lng, lat)) return false;
  if (!boundaries) return true;
  if (region.id === ONTARIO_LOCATION_ID) {
    return countyLocations.some((county) => county.bounds && inBounds(county.bounds, lng, lat) && inRings(boundaries[county.id] ?? [], lng, lat));
  }
  const rings = boundaries[region.id];
  return rings ? inRings(rings, lng, lat) : true;
}
