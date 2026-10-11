"use client";

import "./maplibre-inventory-map.css";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { Feature, Polygon } from "geojson";
import { InventoryItem, formats } from "../data";
import type { GeoBounds, MapLocation } from "../lib/geo/regions";
import { defaultPlaceSearchProviders, searchPlaces, type PlaceSearchProvider, type PlaceSearchResult } from "../lib/geo/search";
import { mapBounds } from "../utils";
import { useI18n } from "../i18n/client";
import { mapLibreLocale } from "../i18n/maplibre";
import { translate } from "../i18n/messages";
import type { Locale } from "../i18n/config";
import { isMarketplaceInventoryAvailable } from "../lib/inventory-availability";

type MapPoint = {
  x: number;
  y: number;
  /** A region to fit instead of a point to centre on. */
  bounds?: GeoBounds;
};

type MapSearchResult = MapPoint & {
  id: string;
  label: string;
  detail: string;
  source: "place" | "device";
  level?: PlaceSearchResult["level"];
  place?: PlaceSearchResult;
};

// A one-off request to move the view (a search result), for the map that is
// showing. The nonce makes the same result chosen twice move the map twice.
type ViewRequest = { target: MapPoint; zoom?: number; nonce: number };

export type AvailableCity = MapPoint & {
  id: string;
  label: string;
  inventoryCount: number;
};

type Props = {
  inventory: InventoryItem[];
  visibleInventory: InventoryItem[];
  selectedInventoryId: string;
  selectedLocation: MapPoint;
  radius: number;
  onAreaChange?: (point: MapPoint) => void;
  initialZoom?: number;
  onSelect?: (id: string) => void;
  onMarkerOpen?: (id: string) => void;
  variant?: "workspace" | "portal";
  followSelectedLocation?: boolean;
  /** A search result chosen in the map's own search bar. */
  onLocationChange?: (location: MapLocation) => void;
  /** County level by default; a street geocoder adds itself as another provider. */
  searchProviders?: PlaceSearchProvider[];
};

const defaultSearchProviders = defaultPlaceSearchProviders();

const tileSize = 256;
const FALLBACK_PIN_VIEW_BOX = "0 0 34 40";
const FALLBACK_PIN_PATH = "M17 1.5C8.44 1.5 1.5 8.44 1.5 17c0 10.4 11.6 18.75 15.5 21.5C20.9 35.75 32.5 27.4 32.5 17 32.5 8.44 25.56 1.5 17 1.5Z";
export const DEFAULT_MAP_VIEW_RADIUS_KM = 30;
export const DEFAULT_MAP_ZOOM = 9;
export const DEVICE_MARKER_MIN_ZOOM = 8.5;
const initialRasterZoom = DEFAULT_MAP_ZOOM;
const minRasterZoom = 2;
const maxRasterZoom = 15;

export default function MapLibreInventoryMap({
  inventory,
  visibleInventory,
  selectedInventoryId,
  selectedLocation,
  radius,
  onAreaChange,
  initialZoom,
  onSelect,
  onMarkerOpen,
  variant = "workspace",
  followSelectedLocation = true,
  onLocationChange,
  searchProviders = defaultSearchProviders,
}: Props) {
  const { locale, t } = useI18n();
  const isPortal = variant === "portal";
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const selectionEnabled = !isPortal;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const pinSelectedIdRef = useRef<string | null>(null);
  const centerMarkerRef = useRef<Marker | null>(null);
  const onAreaChangeRef = useRef(onAreaChange);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [deviceMarkersVisible, setDeviceMarkersVisible] = useState(() => shouldShowDeviceMarkers(initialZoom ?? DEFAULT_MAP_ZOOM));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [placeResults, setPlaceResults] = useState<MapSearchResult[]>([]);
  const deviceResults = useMemo(() => findDeviceSearchResults(searchQuery, inventory), [inventory, searchQuery]);
  const searchResults = useMemo(() => [...placeResults, ...deviceResults].slice(0, 8), [deviceResults, placeResults]);
  const streetSearch = searchProviders.some((provider) => provider.levels.includes("street"));

  // Places come from providers, which may be remote. Wait for a pause in
  // typing and drop answers to an older query.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) { setPlaceResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(query, searchProviders, { signal: controller.signal, limit: 6 }).then((places) => {
        if (controller.signal.aborted) return;
        setPlaceResults(places.map((place) => ({ id: place.id, label: place.label, detail: place.detail, x: place.x, y: place.y, bounds: place.bounds, source: "place", level: place.level, place })));
      }).catch(() => { if (!controller.signal.aborted) setPlaceResults([]); });
    }, searchProviders.every((provider) => provider.levels.every((level) => level !== "street")) ? 0 : 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchProviders, searchQuery]);
  const availableCities = useMemo(() => getAvailableCities(visibleInventory), [visibleInventory]);

  useEffect(() => {
    onAreaChangeRef.current = onAreaChange;
  }, [onAreaChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setMapStatus("loading");

    const probe = document.createElement("canvas");
    const hasWebGl = Boolean(probe.getContext("webgl2") || probe.getContext("webgl") || probe.getContext("experimental-webgl"));
    if (!hasWebGl) {
      setMapStatus("fallback");
      return;
    }

    let map: MapLibreMap;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "OpenStreetMap contributors",
            },
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
            },
          ],
        },
        center: percentToLngLat(selectedLocation),
        zoom: initialZoom ?? DEFAULT_MAP_ZOOM,
        minZoom: 2,
        maxZoom: 16,
        attributionControl: false,
        locale: mapLibreLocale(locale),
      });
    } catch {
      setMapStatus("fallback");
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "MapLibre GL JS" }), "bottom-right");
    map.doubleClickZoom.disable();
    const handleZoom = () => syncMapMarkerVisibility(map, setDeviceMarkersVisible);
    map.on("zoom", handleZoom);

    // A slow WebGL map gets one chance to load. If it times out, retire it so
    // hidden WebGL events cannot move or replace the clickable raster pins.
    let disposed = false;
    const disposeMap = () => {
      if (disposed) return;
      disposed = true;
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      centerMarkerRef.current?.remove();
      centerMarkerRef.current = null;
      map.off("zoom", handleZoom);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
    const loadTimeout = window.setTimeout(() => {
      disposeMap();
      setMapStatus("fallback");
    }, 8000);

    map.on("load", () => {
      if (disposed) return;
      if (initialZoom === undefined) {
        if (selectedLocation.bounds) fitRegion(map, selectedLocation.bounds, containerRef.current, 0);
        else fitDefaultOperatingRadius(map, selectedLocation, containerRef.current);
      }
      if (!isPortal) {
        map.addSource("radius-area", { type: "geojson", data: radiusFeature(selectedLocation, radius) });
        map.addLayer({
          id: "radius-area-fill",
          type: "fill",
          source: "radius-area",
          paint: {
            "fill-color": "#26735b",
            "fill-opacity": 0.14,
          },
        });
        map.addLayer({
          id: "radius-area-outline",
          type: "line",
          source: "radius-area",
          paint: {
            "line-color": "#26735b",
            "line-width": 2,
            "line-dasharray": [2, 1],
          },
        });
      }

      syncMapData(map, selectedLocation, radius);
      syncMapMarkerVisibility(map, setDeviceMarkersVisible);
      window.clearTimeout(loadTimeout);
      setMapStatus("ready");
    });

    map.on("dblclick", (event) => {
      event.originalEvent.preventDefault();
      onAreaChangeRef.current?.(lngLatToPercent(event.lngLat.lng, event.lngLat.lat));
    });

    mapRef.current = map;

    return () => {
      window.clearTimeout(loadTimeout);
      disposeMap();
    };
  }, [locale]);

  // Read by the marker effect without making the selection one of its
  // dependencies; the selection effect below keeps existing pins in step.
  const selectedInventoryIdRef = useRef(selectedInventoryId);
  selectedInventoryIdRef.current = selectedInventoryId;

  // The search area and its centre marker follow the selected location. They
  // are kept apart from the pins: in Network control the centre is the
  // selected device, so while they shared one effect every selection removed
  // and rebuilt every pin, closing the pin's popup and dropping keyboard focus.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      syncMapData(map, selectedLocation, radius);
    } else {
      map.once("load", () => syncMapData(map, selectedLocation, radius));
    }

    centerMarkerRef.current?.remove();
    // A region has no search centre: the list is every screen inside it.
    centerMarkerRef.current = isPortal || selectedLocation.bounds ? null : createCenterMarker(map, selectedLocation, locale);
  }, [isPortal, locale, radius, selectedLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [
      ...createAvailableCityMarkers(map, availableCities, (city) => {
        lastLocationKeyRef.current = locationKey({ x: city.x, y: city.y });
        onAreaChangeRef.current?.(city);
        map.easeTo({ center: percentToLngLat(city), zoom: DEFAULT_MAP_ZOOM, duration: 500 });
      }, locale),
      ...createInventoryMarkers(map, inventory, visibleInventory, selectedInventoryIdRef.current, selectionEnabled, locale, (id) => {
        pinSelectedIdRef.current = id;
        onSelect?.(id);
      }, onMarkerOpen),
    ];
    syncMapMarkerVisibility(map, setDeviceMarkersVisible);
  }, [availableCities, inventory, locale, onMarkerOpen, onSelect, selectionEnabled, visibleInventory]);

  // A new selection updates the existing pins in place. The marker effect used
  // to depend on it and removed and rebuilt every marker, so a pin's popup
  // closed as it opened and keyboard focus fell off the pin just pressed.
  useEffect(() => {
    markerRefs.current.forEach((marker) => {
      const element = marker.getElement();
      const id = element.dataset.inventoryId;
      if (!id) return;
      const selected = selectionEnabled && id === selectedInventoryId;
      element.classList.toggle("selected", selected);
      element.style.color = selected ? "var(--workspace-green)" : "var(--workspace-muted)";
      if (selectionEnabled) element.setAttribute("aria-pressed", String(selected));
    });
  }, [selectedInventoryId, selectionEnabled]);

  // The view follows a change of location (detected position, a county, a
  // map click), not a change of selected screen. A screen chosen in the list
  // used to pull the map back to the search centre.
  const selectedLocationKey = locationKey(selectedLocation);
  const lastLocationKeyRef = useRef(selectedLocationKey);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followSelectedLocation) return;
    if (lastLocationKeyRef.current === selectedLocationKey) return;
    lastLocationKeyRef.current = selectedLocationKey;
    // Where the location follows the selected screen, a pin click must never
    // move the map beneath the pointer.
    if (pinSelectedIdRef.current === selectedInventoryId) return;
    moveToLocation(map, selectedLocation, containerRef.current);
    // selectedLocation is read through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followSelectedLocation, selectedLocationKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewRequest) return;
    if (viewRequest.zoom !== undefined) map.easeTo({ center: percentToLngLat(viewRequest.target), zoom: Math.max(map.getZoom(), viewRequest.zoom), duration: 500 });
    else moveToLocation(map, viewRequest.target, containerRef.current);
  }, [viewRequest]);

  // An offscreen list selection comes into view. A pin click only changes
  // selection; it must never move the map beneath the pointer.
  const lastPannedInventoryId = useRef(selectedInventoryId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectionEnabled || !selectedInventoryId) return;
    if (lastPannedInventoryId.current === selectedInventoryId) return;
    lastPannedInventoryId.current = selectedInventoryId;
    if (pinSelectedIdRef.current === selectedInventoryId) {
      pinSelectedIdRef.current = null;
      return;
    }
    const item = inventory.find((entry) => entry.id === selectedInventoryId);
    if (!item) return;
    const target = percentToLngLat(item);
    if (map.getBounds().contains(target)) return;
    map.easeTo({ center: target, duration: 500 });
  }, [inventory, selectedInventoryId, selectionEnabled]);

  function selectSearchResult(result: MapSearchResult) {
    setSearchQuery(result.label);
    setSearchOpen(false);
    if (result.source === "place" && result.place) {
      // A county fits its boundary; a street result centres at street scale.
      const target: MapPoint = result.bounds ? { x: result.x, y: result.y, bounds: result.bounds } : { x: result.x, y: result.y };
      lastLocationKeyRef.current = locationKey(target);
      setViewRequest({ target, zoom: result.bounds ? undefined : STREET_ZOOM, nonce: Date.now() });
      if (onLocationChange) onLocationChange(result.place);
      else if (!result.bounds) onAreaChange?.({ x: result.x, y: result.y });
      return;
    }
    lastLocationKeyRef.current = locationKey({ x: result.x, y: result.y });
    onAreaChange?.({ x: result.x, y: result.y });
    setViewRequest({ target: { x: result.x, y: result.y }, zoom: 13, nonce: Date.now() });
  }

  function runSearch() {
    if (searchResults[0]) selectSearchResult(searchResults[0]);
  }

  return (
    <div className={`maplibre-shell ${mapStatus === "ready" ? "maplibre-ready" : mapStatus === "loading" ? "maplibre-loading" : "maplibre-fallback-mode"}`}>
      <div ref={containerRef} className="city-map maplibre-map" role="application" aria-label={t("MapLibre inventory map")} aria-hidden={mapStatus !== "ready"} />
      {mapStatus === "loading" ? <div className="map-loading" role="status">{t("Loading map…")}</div> : null}
      <div className="map-search" role="search">
        <input
          aria-label={t("Map search")}
          ref={searchInputRef}
          value={searchQuery}
          placeholder={t(streetSearch ? "Search address, county, or screen" : "Search county, region, or screen")}
          onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); runSearch(); } }}
        />
        <div className="map-search-actions">
          {searchQuery ? <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); searchInputRef.current?.focus(); }} aria-label={t("Clear map search")}>&times;</button> : null}
          <button type="button" onClick={runSearch} aria-label={t("Search map")}>{t("Search")}</button>
        </div>
        {searchOpen && searchQuery.trim() ? (
          <div className="map-search-results">
            {searchResults.length ? searchResults.map((result) => (
              <button key={`${result.source}-${result.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSearchResult(result)}>
                <strong>{result.label}</strong><span>{searchResultDetail(result, t)}</span>
              </button>
            )) : <span className="map-search-empty">{t("No map matches")}</span>}
          </div>
        ) : null}
      </div>
      {mapStatus === "fallback" ? (
        <FallbackMap
          inventory={inventory}
          visibleInventory={visibleInventory}
          selectedInventoryId={selectedInventoryId}
          selectedLocation={selectedLocation}
          radius={radius}
          onAreaChange={onAreaChange}
          initialZoom={initialZoom}
          onSelect={onSelect}
          onMarkerOpen={onMarkerOpen}
          onDeviceMarkerVisibilityChange={setDeviceMarkersVisible}
          followSelectedLocation={followSelectedLocation}
          availableCities={availableCities}
          variant={variant}
          viewRequest={viewRequest}
        />
      ) : null}
      {mapStatus !== "loading" ? <div className="map-legend" aria-label={t("Map legend")}>
        {deviceMarkersVisible ? (
          <>
            <span><i className="legend-device available" />{t("Available device")}</span>
            {selectionEnabled ? <span><i className="legend-device selected" />{t("Selected device")}</span> : null}
          </>
        ) : availableCities.length ? (
          <>
            <span><i className="legend-city" />{t("Available city")}</span>
            <span className="map-zoom-guidance" role="status">{t("Choose a city or zoom in to view devices")}</span>
          </>
        ) : <span className="map-zoom-guidance" role="status">{t("No available cities match the current filters")}</span>}
      </div> : null}
    </div>
  );
}

export function getAvailableCities(inventory: InventoryItem[]): AvailableCity[] {
  const cities = new Map<string, AvailableCity>();

  for (const item of inventory) {
    if (!isMarketplaceInventoryAvailable(item)) continue;
    const label = cityLabelFromAddress(item.address);
    const id = label === "Available location"
      ? `available-location-${Math.round(item.x)}-${Math.round(item.y)}`
      : `available-city-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const existing = cities.get(id);

    if (existing) {
      // Keep the first matching device as a stable representative point rather
      // than calculating a centroid that may not correspond to a real device.
      existing.inventoryCount += 1;
    } else {
      cities.set(id, { id, label, x: item.x, y: item.y, inventoryCount: 1 });
    }
  }

  return [...cities.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function cityLabelFromAddress(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(", ") : "Available location";
}

function cityMarkerAriaLabel(city: AvailableCity, locale: Locale = "en") {
  return translate(locale, city.inventoryCount === 1 ? "{city}: {count} available device. Zoom in to view devices." : "{city}: {count} available devices. Zoom in to view devices.", { city: city.label, count: city.inventoryCount });
}

function findDeviceSearchResults(query: string, inventory: InventoryItem[]): MapSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return inventory
    .map((item) => ({ id: item.id, label: item.name, detail: [item.address, ...(item.tags ?? [])].join(" - "), x: item.x, y: item.y, source: "device" as const }))
    .filter((candidate) => `${candidate.label} ${candidate.detail}`.toLowerCase().includes(normalized))
    .slice(0, 6);
}

function searchResultDetail(result: MapSearchResult, t: (message: string, variables?: Record<string, string | number>) => string) {
  if (result.source === "device") return t(result.detail);
  if (result.level === "province") return t("Province");
  if (result.level === "county") return t("{kind}, Ontario", { kind: t(result.detail) });
  return result.detail;
}

// Street results open close enough to read street names.
const STREET_ZOOM = 15;

function locationKey(point: MapPoint) {
  return `${point.x.toFixed(4)}:${point.y.toFixed(4)}:${point.bounds?.join(",") ?? ""}`;
}

function FallbackMap({
  inventory,
  visibleInventory,
  selectedInventoryId,
  selectedLocation,
  radius,
  onAreaChange,
  initialZoom,
  onSelect,
  onMarkerOpen,
  onDeviceMarkerVisibilityChange,
  availableCities,
  variant = "workspace",
  followSelectedLocation = true,
  viewRequest,
}: Props & { availableCities: AvailableCity[]; onDeviceMarkerVisibilityChange: (visible: boolean) => void; viewRequest?: ViewRequest | null }) {
  const { locale, t } = useI18n();
  const isPortal = variant === "portal";
  const selectionEnabled = !isPortal;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const pinSelectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    center: LngLat;
    input: "pointer" | "mouse";
    moved: boolean;
  } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 560 });
  const [zoom, setZoom] = useState(initialZoom ?? (selectedLocation.bounds ? zoomForBounds(selectedLocation.bounds, { width: 640, height: 560 }) : initialRasterZoom));
  const [center, setCenter] = useState<LngLat>(() => selectedLocation.bounds ? boundsCenter(selectedLocation.bounds) : (() => {
    const [lng, lat] = percentToLngLat(selectedLocation);
    return { lng, lat };
  })());
  const centerRef = useRef(center);
  const visibleIds = new Set(visibleInventory.map((item) => item.id));
  const centerWorld = lngLatToWorld(center.lng, center.lat, zoom);
  const viewportOrigin = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  };
  const tiles = useMemo(() => getVisibleTiles(viewportOrigin, size, zoom), [size, viewportOrigin.x, viewportOrigin.y, zoom]);
  const radiusPixels = radiusToPixels(radius, center.lat, zoom);
  const deviceMarkersVisible = shouldShowDeviceMarkers(zoom);

  useEffect(() => {
    onDeviceMarkerVisibilityChange(deviceMarkersVisible);
  }, [deviceMarkersVisible, onDeviceMarkerVisibilityChange]);

  // Follow a change of location, not a change of selected screen.
  const selectedLocationKey = locationKey(selectedLocation);
  const lastLocationKey = useRef(selectedLocationKey);
  useEffect(() => {
    if (!followSelectedLocation) return;
    if (lastLocationKey.current === selectedLocationKey) return;
    lastLocationKey.current = selectedLocationKey;
    if (pinSelectedIdRef.current === selectedInventoryId) return;
    showLocation(selectedLocation);
    // selectedLocation is read through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followSelectedLocation, selectedLocationKey]);

  useEffect(() => {
    if (!viewRequest) return;
    lastLocationKey.current = locationKey(viewRequest.target);
    if (viewRequest.zoom !== undefined) {
      const [lng, lat] = percentToLngLat(viewRequest.target);
      setMapCenter({ lng, lat });
      setZoom((current) => Math.max(current, Math.min(maxRasterZoom, Math.round(viewRequest.zoom!))));
    } else showLocation(viewRequest.target);
    // Runs once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  function showLocation(location: MapPoint) {
    if (location.bounds) {
      setMapCenter(boundsCenter(location.bounds));
      setZoom(zoomForBounds(location.bounds, size));
      return;
    }
    const [lng, lat] = percentToLngLat(location);
    setMapCenter({ lng, lat });
    setZoom((current) => (shouldShowDeviceMarkers(current) ? current : DEFAULT_MAP_ZOOM));
  }

  // Only an offscreen list selection moves the viewport; clicking any pin
  // leaves its position unchanged, even at the edge of the map.
  const lastSelectedId = useRef(selectedInventoryId);
  useEffect(() => {
    if (!selectionEnabled || !selectedInventoryId) return;
    if (lastSelectedId.current === selectedInventoryId) return;
    lastSelectedId.current = selectedInventoryId;
    if (pinSelectedIdRef.current === selectedInventoryId) {
      pinSelectedIdRef.current = null;
      return;
    }
    if (followSelectedLocation) return;
    const item = inventory.find((entry) => entry.id === selectedInventoryId);
    if (!item) return;
    const [lng, lat] = percentToLngLat(item);
    const point = lngLatToWorld(lng, lat, zoom);
    const middle = lngLatToWorld(centerRef.current.lng, centerRef.current.lat, zoom);
    if (Math.abs(point.x - middle.x) > size.width / 2 || Math.abs(point.y - middle.y) > size.height / 2) {
      setMapCenter({ lng, lat });
    }
  }, [followSelectedLocation, inventory, selectedInventoryId, selectionEnabled, size.height, size.width, zoom]);

  useEffect(() => {
    if (initialZoom) setZoom(initialZoom);
  }, [initialZoom]);

  useEffect(() => {
    if (!mapRef.current) return;
    const element = mapRef.current;
    const updateSize = () => {
      const box = element.getBoundingClientRect();
      if (box.width && box.height) setSize({ width: box.width, height: box.height });
    };
    updateSize();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (dragRef.current?.input !== "pointer") return;
      event.preventDefault();
      moveDrag(event.clientX, event.clientY);
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (dragRef.current?.input !== "pointer") return;
      finishDrag();
    };
    const handleWindowMouseMove = (event: MouseEvent) => {
      if (dragRef.current?.input !== "mouse") return;
      event.preventDefault();
      moveDrag(event.clientX, event.clientY);
    };
    const handleWindowMouseUp = (event: MouseEvent) => {
      if (dragRef.current?.input !== "mouse") return;
      finishDrag();
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("mousemove", handleWindowMouseMove, { passive: false });
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [zoom, size.width, size.height]);

  function setMapCenter(nextCenter: LngLat) {
    centerRef.current = nextCenter;
    setCenter(nextCenter);
  }

  function zoomBy(delta: number) {
    setZoom((current) => clamp(current + delta, minRasterZoom, maxRasterZoom));
  }

  function canDragFrom(target: EventTarget | null) {
    return !(target as HTMLElement | null)?.closest(".device-marker, .city-marker, .raster-control");
  }

  function startDrag(input: "pointer" | "mouse", clientX: number, clientY: number) {
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      center: centerRef.current,
      input,
      moved: false,
    };
  }

  function moveDrag(clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    const startWorld = lngLatToWorld(drag.center.lng, drag.center.lat, zoom);
    const nextWorld = { x: startWorld.x - deltaX, y: startWorld.y - deltaY };
    setMapCenter(worldToLngLat(nextWorld.x, nextWorld.y, zoom));
  }

  function finishDrag() {
    dragRef.current = null;
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const box = mapRef.current?.getBoundingClientRect();
    if (!box) return;
    const currentWorld = lngLatToWorld(centerRef.current.lng, centerRef.current.lat, zoom);
    const currentOrigin = {
      x: currentWorld.x - size.width / 2,
      y: currentWorld.y - size.height / 2,
    };
    const world = {
      x: currentOrigin.x + event.clientX - box.left,
      y: currentOrigin.y + event.clientY - box.top,
    };
    const nextCenter = worldToLngLat(world.x, world.y, zoom);
    onAreaChange?.(lngLatToPercent(nextCenter.lng, nextCenter.lat));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canDragFrom(event.target)) return;
    event.preventDefault();
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    startDrag("pointer", event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.input !== "pointer") return;
    event.preventDefault();
    moveDrag(event.clientX, event.clientY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.input !== "pointer") return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag();
  }

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current || !canDragFrom(event.target)) return;
    event.preventDefault();
    startDrag("mouse", event.clientX, event.clientY);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current?.input !== "mouse") return;
    event.preventDefault();
    moveDrag(event.clientX, event.clientY);
  }

  function handleMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current?.input !== "mouse") return;
    finishDrag();
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -1 : 1);
  }

  function focusCity(city: AvailableCity) {
    const [lng, lat] = percentToLngLat(city);
    setMapCenter({ lng, lat });
    setZoom((current) => Math.max(current, DEFAULT_MAP_ZOOM));
    onAreaChange?.(city);
  }

  return (
    <div
      className="map-fallback raster-map"
      aria-label={t("Interactive raster map of North America")}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      ref={mapRef}
    >
      <div className="raster-tile-layer" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            alt=""
            className="raster-tile"
            draggable={false}
            key={`${tile.z}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${tile.z}/${tile.urlX}/${tile.y}.png`}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>
      {!isPortal && !selectedLocation.bounds ? (
        <div
          className="fallback-radius"
          style={{
            left: "50%",
            top: "50%",
            width: radiusPixels * 2,
            height: radiusPixels * 2,
          }}
        />
      ) : null}
      <div className="fallback-city-label">
        <strong>{t("North America")}</strong>
        <span>{t("Drag to pan, scroll or use buttons to zoom, double-click to set search center")}</span>
        <small>{center.lat.toFixed(4)}, {center.lng.toFixed(4)}</small>
      </div>
      <div className="raster-controls">
        <button className="raster-control" type="button" onClick={() => zoomBy(1)} aria-label={t("Zoom in")}>+</button>
        <button className="raster-control" type="button" onClick={() => zoomBy(-1)} aria-label={t("Zoom out")}>-</button>
      </div>
      {!isPortal && !selectedLocation.bounds ? <div className="fallback-center" style={markerStyle(selectedLocation, viewportOrigin, zoom)} /> : null}
      {!deviceMarkersVisible ? availableCities.map((city) => (
        <button
          aria-label={cityMarkerAriaLabel(city, locale)}
          className="city-marker fallback-city-marker"
          key={city.id}
          onClick={() => focusCity(city)}
          style={markerStyle(city, viewportOrigin, zoom)}
          type="button"
        >
          <span aria-hidden="true" className="city-marker-count">{city.inventoryCount}</span>
        </button>
      )) : null}
      {deviceMarkersVisible ? inventory.map((item) => {
        const visible = visibleIds.has(item.id);
        const selected = selectionEnabled && item.id === selectedInventoryId;
        const className = `device-marker fallback-pin ${visible ? "visible" : "muted"} ${selected ? "selected" : ""}`;
        const style = markerStyle(item, viewportOrigin, zoom);

        return (
          <button aria-label={`${item.name}, ${t(formats[item.format].label)}`} aria-pressed={selectionEnabled ? selected : undefined} className={className} key={item.id} onClick={() => { pinSelectedIdRef.current = item.id; onSelect?.(item.id); onMarkerOpen?.(item.id); }} style={style} type="button">
            <DevicePinGlyph />
          </button>
        );
      }) : null}
    </div>
  );
}

type LngLat = {
  lng: number;
  lat: number;
};

// Positions are rounded to a tenth of a pixel. A raw value such as
// 324.5875199999937 is written into the server HTML, the browser shortens the
// inline style to six significant digits ("324.588px"), and React then sees the
// client's full-precision number as a different value and reports a hydration
// mismatch. A tenth of a pixel survives that shortening unchanged.
function roundPx(value: number) {
  return Math.round(value * 10) / 10;
}

function markerStyle(point: MapPoint, viewportOrigin: { x: number; y: number }, zoom: number) {
  const [lng, lat] = percentToLngLat(point);
  const world = lngLatToWorld(lng, lat, zoom);
  return {
    left: roundPx(world.x - viewportOrigin.x),
    top: roundPx(world.y - viewportOrigin.y),
  };
}

function getVisibleTiles(viewportOrigin: { x: number; y: number }, size: { width: number; height: number }, zoom: number) {
  const maxTiles = 2 ** zoom;
  const minX = Math.floor(viewportOrigin.x / tileSize) - 1;
  const maxX = Math.floor((viewportOrigin.x + size.width) / tileSize) + 1;
  const minY = Math.max(0, Math.floor(viewportOrigin.y / tileSize) - 1);
  const maxY = Math.min(maxTiles - 1, Math.floor((viewportOrigin.y + size.height) / tileSize) + 1);
  const tiles: { x: number; y: number; z: number; urlX: number; left: number; top: number }[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const urlX = ((x % maxTiles) + maxTiles) % maxTiles;
      tiles.push({
        x,
        y,
        z: zoom,
        urlX,
        left: roundPx(x * tileSize - viewportOrigin.x),
        top: roundPx(y * tileSize - viewportOrigin.y),
      });
    }
  }

  return tiles;
}

function lngLatToWorld(lng: number, lat: number, zoom: number) {
  const scale = tileSize * 2 ** zoom;
  const sin = Math.sin((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToLngLat(x: number, y: number, zoom: number): LngLat {
  const scale = tileSize * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

function radiusToPixels(radiusKm: number, latitude: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return Math.max(18, (radiusKm * 1000) / metersPerPixel);
}

export function shouldShowDeviceMarkers(zoom: number) {
  return zoom >= DEVICE_MARKER_MIN_ZOOM;
}

function fitDefaultOperatingRadius(map: MapLibreMap, center: MapPoint, container: HTMLElement | null) {
  const shortestSide = Math.min(container?.clientWidth || 560, container?.clientHeight || 560);
  const padding = clamp(Math.round(shortestSide * 0.09), 24, 48);
  map.fitBounds(radiusBounds(center, DEFAULT_MAP_VIEW_RADIUS_KM), {
    padding,
    duration: 0,
    maxZoom: 11,
  });
  // Fitting the 30 km operating radius lands at zoom 8.46 in a panel-width
  // container, and DEVICE_MARKER_MIN_ZOOM is 8.5. Missing by 0.04 meant the
  // default view replaced every device pin with a city-count marker and told
  // the reader to zoom in, on a map whose whole purpose is showing those
  // devices. fitBounds has no minZoom, so the floor is applied afterwards.
  if (map.getZoom() < DEVICE_MARKER_MIN_ZOOM) map.setZoom(DEVICE_MARKER_MIN_ZOOM);
}

function radiusBounds(center: MapPoint, radiusKm: number): [[number, number], [number, number]] {
  const [longitude, latitude] = percentToLngLat(center);
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.max(0.2, Math.cos(toRadians(latitude)));
  const longitudeDelta = radiusKm / (111.32 * longitudeScale);
  return [
    [longitude - longitudeDelta, latitude - latitudeDelta],
    [longitude + longitudeDelta, latitude + latitudeDelta],
  ];
}

function syncMapMarkerVisibility(map: MapLibreMap, onChange: (visible: boolean) => void) {
  const visible = shouldShowDeviceMarkers(map.getZoom());
  map.getContainer().querySelectorAll<HTMLElement>(".device-marker").forEach((marker) => {
    marker.hidden = !visible;
  });
  map.getContainer().querySelectorAll<HTMLElement>(".city-marker").forEach((marker) => {
    marker.hidden = visible;
  });
  onChange(visible);
}

function syncMapData(map: MapLibreMap, selectedLocation: MapPoint, radius: number) {
  const source = map.getSource("radius-area") as GeoJSONSource | undefined;
  // A region lists every screen inside it, so no distance circle is drawn.
  source?.setData(selectedLocation.bounds ? { type: "FeatureCollection", features: [] } : radiusFeature(selectedLocation, radius));
}

function regionPadding(container: HTMLElement | null) {
  const shortestSide = Math.min(container?.clientWidth || 560, container?.clientHeight || 560);
  return clamp(Math.round(shortestSide * 0.06), 16, 40);
}

function fitRegion(map: MapLibreMap, bounds: GeoBounds, container: HTMLElement | null, duration = 500) {
  map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: regionPadding(container), duration, maxZoom: 12 });
}

// A region fits its bounds. A point keeps the current zoom at city scale, and
// from a province or county view it opens the 30 km operating radius.
function moveToLocation(map: MapLibreMap, location: MapPoint, container: HTMLElement | null) {
  if (location.bounds) {
    fitRegion(map, location.bounds, container);
    return;
  }
  if (shouldShowDeviceMarkers(map.getZoom())) {
    map.easeTo({ center: percentToLngLat(location), duration: 500 });
    return;
  }
  const camera = map.cameraForBounds(radiusBounds(location, DEFAULT_MAP_VIEW_RADIUS_KM), { padding: regionPadding(container), maxZoom: 11 });
  map.easeTo({ center: camera?.center ?? percentToLngLat(location), zoom: Math.max(camera?.zoom ?? DEFAULT_MAP_ZOOM, DEVICE_MARKER_MIN_ZOOM), duration: 500 });
}

function boundsCenter(bounds: GeoBounds): LngLat {
  const north = lngLatToWorld(bounds[0], bounds[3], 0);
  const south = lngLatToWorld(bounds[2], bounds[1], 0);
  return worldToLngLat((north.x + south.x) / 2, (north.y + south.y) / 2, 0);
}

// The fallback map has whole zoom levels only. Pick the largest that fits.
function zoomForBounds(bounds: GeoBounds, size: { width: number; height: number }) {
  const topLeft = lngLatToWorld(bounds[0], bounds[3], 0);
  const bottomRight = lngLatToWorld(bounds[2], bounds[1], 0);
  const width = Math.max(1e-9, bottomRight.x - topLeft.x);
  const height = Math.max(1e-9, bottomRight.y - topLeft.y);
  const fit = Math.log2(Math.min((size.width * 0.9) / width, (size.height * 0.9) / height));
  return clamp(Math.floor(fit), minRasterZoom, 12);
}

function createInventoryMarkers(
  map: MapLibreMap,
  inventory: InventoryItem[],
  visibleInventory: InventoryItem[],
  selectedInventoryId: string,
  selectionEnabled: boolean,
  locale: Locale,
  onSelect?: (id: string) => void,
  onMarkerOpen?: (id: string) => void,
) {
  const visibleIds = new Set(visibleInventory.map((item) => item.id));

  return inventory.map((item) => {
    const visible = visibleIds.has(item.id);
    const selected = selectionEnabled && item.id === selectedInventoryId;
    const element = document.createElement("button");
    element.type = "button";
    element.dataset.inventoryId = item.id;
    element.className = ["device-marker", "maplibre-device-marker", visible ? "visible" : "muted", selected ? "selected" : null].filter(Boolean).join(" ");
    element.style.color = selected ? "var(--workspace-green)" : "var(--workspace-muted)";
    element.setAttribute("aria-label", `${item.name}, ${translate(locale, formats[item.format].label)}`);
    if (selectionEnabled) element.setAttribute("aria-pressed", String(selected));
    element.append(createDevicePinGlyphElement());

    element.addEventListener("click", (event) => {
      event.preventDefault();
      // Enter on a focused pin fires keypress, which MapLibre handles by opening
      // the popup and moving focus into it, and then this button's own click.
      // That click bubbled to the map, which toggled the popup shut and left
      // focus on the page body. A keyboard click (detail 0) stops at the pin.
      if (event.detail === 0) event.stopPropagation();
      // Freeze any drag momentum at the moment the pin is chosen.
      map.stop();
      onSelect?.(item.id);
      onMarkerOpen?.(item.id);
    });

    return new maplibregl.Marker({ element, anchor: "bottom", subpixelPositioning: true })
      .setLngLat(percentToLngLat(item))
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(item, locale)))
      .addTo(map);
  });
}

function createDevicePinGlyphElement() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "device-pin-glyph");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", FALLBACK_PIN_VIEW_BOX);

  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("class", "device-pin-body");
  path.setAttribute("d", FALLBACK_PIN_PATH);
  const dot = document.createElementNS(svgNamespace, "circle");
  dot.setAttribute("class", "device-pin-dot");
  dot.setAttribute("cx", "17");
  dot.setAttribute("cy", "16.5");
  dot.setAttribute("r", "5");
  svg.append(path, dot);

  return svg;
}

function createAvailableCityMarkers(
  map: MapLibreMap,
  cities: AvailableCity[],
  onOpen: (city: AvailableCity) => void,
  locale: Locale,
) {
  return cities.map((city) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "city-marker maplibre-city-marker";
    element.setAttribute("aria-label", cityMarkerAriaLabel(city, locale));

    const count = document.createElement("span");
    count.className = "city-marker-count";
    count.setAttribute("aria-hidden", "true");
    count.textContent = String(city.inventoryCount);
    element.append(count);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpen(city);
    });

    return new maplibregl.Marker({ element, anchor: "center", subpixelPositioning: true })
      .setLngLat(percentToLngLat(city))
      .addTo(map);
  });
}

function DevicePinGlyph() {
  return (
    <svg aria-hidden="true" className="device-pin-glyph fallback-pin-glyph" focusable="false" viewBox={FALLBACK_PIN_VIEW_BOX}>
      <path className="device-pin-body fallback-pin-body" d={FALLBACK_PIN_PATH} />
      <circle className="device-pin-dot fallback-pin-dot" cx="17" cy="16.5" r="5" />
    </svg>
  );
}

function createCenterMarker(map: MapLibreMap, selectedLocation: MapPoint, locale: Locale) {
  const element = document.createElement("div");
  element.className = "maplibre-center";
  element.title = translate(locale, "Search center");
  return new maplibregl.Marker({ element }).setLngLat(percentToLngLat(selectedLocation)).addTo(map);
}

function popupHtml(item: InventoryItem, locale: Locale) {
  return `
    <div class="map-popup">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.address)}</span>
      <small>${escapeHtml(translate(locale, formats[item.format].label))} - ${escapeHtml(translate(locale, "{count} impressions", { count: new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(item.impressions) }))}</small>
    </div>
  `;
}

function radiusFeature(center: MapPoint, radiusKm: number): Feature<Polygon> {
  const [centerLng, centerLat] = percentToLngLat(center);
  const angularDistance = radiusKm / 6371;
  const latitude = toRadians(centerLat);
  const longitude = toRadians(centerLng);
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const bearing = (index / 64) * Math.PI * 2;
    const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude));
    return [toDegrees(nextLongitude), toDegrees(nextLatitude)];
  });

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}

function percentToLngLat(point: MapPoint): [number, number] {
  const x = clamp(point.x, -20, 120) / 100;
  const y = clamp(point.y, -20, 120) / 100;
  return [
    mapBounds.west + (mapBounds.east - mapBounds.west) * x,
    mapBounds.north - (mapBounds.north - mapBounds.south) * y,
  ];
}

function lngLatToPercent(lng: number, lat: number): MapPoint {
  return {
    x: clamp(((lng - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 100, 0, 100),
    y: clamp(((mapBounds.north - lat) / (mapBounds.north - mapBounds.south)) * 100, 0, 100),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
