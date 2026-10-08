import { geoToMapPoint } from "./projection";
import { countyLocations, ontarioLocation, type GeoBounds, type MapLocation } from "./regions";

/**
 * Map search is built from providers. Each provider answers for one or more
 * levels. The app ships one local provider for the province and its counties.
 * A street-level geocoder plugs in as another provider without changes to the
 * map: see createHttpPlaceSearchProvider and defaultPlaceSearchProviders.
 */
export type PlaceSearchLevel = "province" | "county" | "street";

export type PlaceSearchResult = MapLocation & {
  level: PlaceSearchLevel | "point";
  /** A short second line, such as "County" or a street address's town. */
  detail: string;
  /** Lower ranks list first. */
  rank?: number;
};

export type PlaceSearchOptions = { signal?: AbortSignal; limit?: number };

export type PlaceSearchProvider = {
  id: string;
  levels: PlaceSearchLevel[];
  /** Queries shorter than this are not sent; a remote geocoder wants 3 or more. */
  minQueryLength?: number;
  search: (query: string, options?: PlaceSearchOptions) => PlaceSearchResult[] | Promise<PlaceSearchResult[]>;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("en-CA").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function matchRank(query: string, haystacks: string[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const value of haystacks.map(normalize)) {
    if (value === query) best = Math.min(best, 0);
    else if (value.startsWith(query)) best = Math.min(best, 1);
    else if (value.split(" ").some((word) => word.startsWith(query))) best = Math.min(best, 2);
    else if (value.includes(query)) best = Math.min(best, 3);
  }
  return best;
}

/** The province and its 49 census divisions (counties, regions, districts and single-tier cities). */
export const ontarioCountySearchProvider: PlaceSearchProvider = {
  id: "ontario-counties",
  levels: ["province", "county"],
  minQueryLength: 1,
  search(query, options) {
    const normalized = normalize(query);
    if (!normalized) return [];
    const candidates = [ontarioLocation, ...countyLocations];
    return candidates
      .map((location) => ({ location, rank: matchRank(normalized, [location.label, location.label.replace(/^(District Municipality|United Counties) of /, ""), location.kind ?? ""]) }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((a, b) => a.rank - b.rank || a.location.label.localeCompare(b.location.label))
      .slice(0, options?.limit ?? 6)
      .map(({ location, rank }) => ({
        ...location,
        level: location.level === "province" ? "province" as const : "county" as const,
        detail: location.level === "province" ? "Province" : `${location.kind ?? "County"}, Ontario`,
        rank,
      }));
  },
};

type RemotePlace = { id?: string; label: string; detail?: string; lat: number; lng: number; bounds?: GeoBounds; level?: PlaceSearchLevel };

/**
 * A remote geocoder for street-level results. The endpoint takes `?q=` and
 * `&level=` and answers `{ "results": [{ label, detail?, lat, lng, bounds? }] }`.
 * Keep the provider's key on the server: point this at an app route that
 * calls the geocoder, never at the geocoder itself.
 */
export function createHttpPlaceSearchProvider({ id, endpoint, levels = ["street"], minQueryLength = 3 }: { id: string; endpoint: string; levels?: PlaceSearchLevel[]; minQueryLength?: number }): PlaceSearchProvider {
  return {
    id,
    levels,
    minQueryLength,
    async search(query, options) {
      const url = new URL(endpoint, typeof window === "undefined" ? "http://localhost" : window.location.origin);
      url.searchParams.set("q", query);
      url.searchParams.set("level", levels.join(","));
      if (options?.limit) url.searchParams.set("limit", String(options.limit));
      const response = await fetch(url, { signal: options?.signal, headers: { accept: "application/json" } });
      if (!response.ok) return [];
      const payload = await response.json().catch(() => ({})) as { results?: RemotePlace[] };
      return (payload.results ?? []).slice(0, options?.limit ?? 6).map((place, index) => ({
        id: place.id ?? `${id}-${index}-${place.lat}-${place.lng}`,
        label: place.label,
        detail: place.detail ?? "",
        level: place.level ?? "street",
        bounds: place.bounds,
        rank: 10 + index,
        ...geoToMapPoint(place.lat, place.lng),
      }));
    },
  };
}

/**
 * The providers the maps use. County level is always on. Set
 * NEXT_PUBLIC_STREET_SEARCH_ENDPOINT to an app route to add street results.
 */
export function defaultPlaceSearchProviders(environment: Record<string, string | undefined> = { NEXT_PUBLIC_STREET_SEARCH_ENDPOINT: process.env.NEXT_PUBLIC_STREET_SEARCH_ENDPOINT }): PlaceSearchProvider[] {
  const providers = [ontarioCountySearchProvider];
  const endpoint = environment.NEXT_PUBLIC_STREET_SEARCH_ENDPOINT?.trim();
  if (endpoint) providers.push(createHttpPlaceSearchProvider({ id: "street", endpoint }));
  return providers;
}

/** Runs every provider that accepts the query; one failing provider does not hide the others. */
export async function searchPlaces(query: string, providers: PlaceSearchProvider[], options?: PlaceSearchOptions) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const settled = await Promise.allSettled(providers
    .filter((provider) => trimmed.length >= (provider.minQueryLength ?? 1))
    .map(async (provider) => provider.search(trimmed, options)));
  return settled
    .flatMap((entry) => entry.status === "fulfilled" ? entry.value : [])
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
}
