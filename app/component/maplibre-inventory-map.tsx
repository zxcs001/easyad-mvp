"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { Feature, Polygon } from "geojson";
import { FormatKey, InventoryItem, businesses, formats, locations } from "../data";
import { mapBounds } from "../utils";

type MapPoint = {
  x: number;
  y: number;
};

type MapSearchResult = MapPoint & {
  id: string;
  label: string;
  detail: string;
};

type Props = {
  inventory: InventoryItem[];
  visibleInventory: InventoryItem[];
  selectedInventoryId: string;
  selectedLocation: MapPoint;
  radius: number;
  showCompetitors: boolean;
  onAreaChange?: (point: MapPoint) => void;
  initialZoom?: number;
  onSelect?: (id: string) => void;
  onMarkerOpen?: (id: string) => void;
};

const formatClass: Record<FormatKey, string> = {
  digital: "digital",
  static: "static",
  transit: "transit",
};

const tileSize = 256;
const initialRasterZoom = 3;
const minRasterZoom = 2;
const maxRasterZoom = 15;

export default function MapLibreInventoryMap({
  inventory,
  visibleInventory,
  selectedInventoryId,
  selectedLocation,
  radius,
  showCompetitors,
  onAreaChange,
  initialZoom,
  onSelect,
  onMarkerOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const onAreaChangeRef = useRef(onAreaChange);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchResults = useMemo(() => findMapSearchResults(searchQuery, inventory), [inventory, searchQuery]);

  useEffect(() => {
    onAreaChangeRef.current = onAreaChange;
  }, [onAreaChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

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
        zoom: 3.2,
        minZoom: 2,
        maxZoom: 16,
        attributionControl: false,
      });
    } catch {
      setMapStatus("fallback");
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "MapLibre GL JS" }), "bottom-right");
    map.doubleClickZoom.disable();

    map.on("load", () => {
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

      syncMapData(map, selectedLocation, radius);
      setMapStatus("ready");
    });

    map.on("error", () => {
      if (!map.isStyleLoaded()) setMapStatus("fallback");
    });
    map.on("dblclick", (event) => {
      event.originalEvent.preventDefault();
      onAreaChangeRef.current?.(lngLatToPercent(event.lngLat.lng, event.lngLat.lat));
    });

    mapRef.current = map;

    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      syncMapData(map, selectedLocation, radius);
    } else {
      map.once("load", () => syncMapData(map, selectedLocation, radius));
    }

    markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [
      createCenterMarker(map, selectedLocation),
      ...createBusinessMarkers(map, showCompetitors),
      ...createInventoryMarkers(map, inventory, visibleInventory, selectedInventoryId, onSelect, onMarkerOpen),
    ];
  }, [inventory, onMarkerOpen, onSelect, radius, selectedInventoryId, selectedLocation, showCompetitors, visibleInventory]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: percentToLngLat(selectedLocation), duration: 500 });
  }, [selectedLocation]);

  function selectSearchResult(result: MapSearchResult) {
    setSearchQuery(result.label);
    setSearchOpen(false);
    onAreaChange?.({ x: result.x, y: result.y });
    mapRef.current?.easeTo({ center: percentToLngLat(result), zoom: Math.max(mapRef.current.getZoom(), 13), duration: 500 });
  }

  function runSearch() {
    if (searchResults[0]) selectSearchResult(searchResults[0]);
  }

  return (
    <div className={`maplibre-shell ${mapStatus === "fallback" ? "maplibre-fallback-mode" : ""}`}>
      <div ref={containerRef} className="city-map maplibre-map" role="application" aria-label="MapLibre inventory map" />
      <div className="map-search" role="search">
        <input
          aria-label="Map search"
          value={searchQuery}
          placeholder="Search address, device, or landmark"
          onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }}
        />
        <button type="button" onClick={runSearch} aria-label="Search map">Search</button>
        {searchOpen && searchQuery.trim() ? (
          <div className="map-search-results">
            {searchResults.length ? searchResults.map((result) => (
              <button key={result.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSearchResult(result)}>
                <strong>{result.label}</strong><span>{result.detail}</span>
              </button>
            )) : <span className="map-search-empty">No map matches</span>}
          </div>
        ) : null}
      </div>
      {mapStatus !== "ready" ? (
        <FallbackMap
          inventory={inventory}
          visibleInventory={visibleInventory}
          selectedInventoryId={selectedInventoryId}
          selectedLocation={selectedLocation}
          radius={radius}
          showCompetitors={showCompetitors}
          onAreaChange={onAreaChange}
          initialZoom={initialZoom}
          onSelect={onSelect}
          onMarkerOpen={onMarkerOpen}
        />
      ) : null}
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot digital" />Digital</span>
        <span><i className="legend-dot static" />Static</span>
        <span><i className="legend-dot transit" />Transit</span>
        <span><i className="legend-square" />Nearby business</span>
      </div>
    </div>
  );
}

function findMapSearchResults(query: string, inventory: InventoryItem[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const candidates: MapSearchResult[] = [
    ...locations.map((location) => ({ ...location, detail: "Location" })),
    ...inventory.map((item) => ({ id: item.id, label: item.name, detail: [item.address, ...(item.tags ?? [])].join(" - "), x: item.x, y: item.y })),
    ...businesses.map((business) => ({ id: business.name, label: business.name, detail: business.category, x: business.x, y: business.y })),
  ];
  return candidates
    .filter((candidate) => `${candidate.label} ${candidate.detail}`.toLowerCase().includes(normalized))
    .slice(0, 6);
}

function FallbackMap({
  inventory,
  visibleInventory,
  selectedInventoryId,
  selectedLocation,
  radius,
  showCompetitors,
  onAreaChange,
  initialZoom,
  onSelect,
  onMarkerOpen,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    center: LngLat;
    input: "pointer" | "mouse";
    moved: boolean;
  } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 560 });
  const [zoom, setZoom] = useState(initialZoom ?? initialRasterZoom);
  const [center, setCenter] = useState<LngLat>(() => {
    const [lng, lat] = percentToLngLat(selectedLocation);
    return { lng, lat };
  });
  const centerRef = useRef(center);
  const visibleIds = new Set(visibleInventory.map((item) => item.id));
  const centerWorld = lngLatToWorld(center.lng, center.lat, zoom);
  const viewportOrigin = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  };
  const tiles = useMemo(() => getVisibleTiles(viewportOrigin, size, zoom), [size, viewportOrigin.x, viewportOrigin.y, zoom]);
  const radiusPixels = radiusToPixels(radius, center.lat, zoom);

  useEffect(() => {
    const [lng, lat] = percentToLngLat(selectedLocation);
    setMapCenter({ lng, lat });
  }, [selectedLocation]);

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
    return !(target as HTMLElement | null)?.closest(".maplibre-pin, .raster-control");
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

  return (
    <div
      className="map-fallback raster-map"
      aria-label="Interactive raster map of North America"
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
      <div
        className="fallback-radius"
        style={{
          left: "50%",
          top: "50%",
          width: radiusPixels * 2,
          height: radiusPixels * 2,
        }}
      />
      <div className="fallback-city-label">
        <strong>North America</strong>
        <span>Drag to pan, scroll or use buttons to zoom, double-click to set search center</span>
        <small>{center.lat.toFixed(4)}, {center.lng.toFixed(4)}</small>
      </div>
      <div className="raster-controls">
        <button className="raster-control" type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
        <button className="raster-control" type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">-</button>
      </div>
      <div className="fallback-center" style={markerStyle(selectedLocation, viewportOrigin, zoom)} />
      {showCompetitors ? businesses.map((business) => (
        <div className="fallback-business" key={business.name} title={`${business.name} (${business.category})`} style={markerStyle(business, viewportOrigin, zoom)} />
      )) : null}
      {inventory.map((item) => {
        const visible = visibleIds.has(item.id);
        const selected = item.id === selectedInventoryId;
        const className = `maplibre-pin fallback-pin ${formatClass[item.format]} ${visible ? "visible" : "muted"} ${selected ? "selected" : ""}`;
        const content = <><strong>{item.id.replace("INV-", "")}</strong><span>{formats[item.format].label}</span></>;
        const style = markerStyle(item, viewportOrigin, zoom);

        return <button className={className} key={item.id} onClick={() => { onSelect?.(item.id); onMarkerOpen?.(item.id); }} style={style} type="button">{content}</button>;
      })}
    </div>
  );
}

type LngLat = {
  lng: number;
  lat: number;
};

function markerStyle(point: MapPoint, viewportOrigin: { x: number; y: number }, zoom: number) {
  const [lng, lat] = percentToLngLat(point);
  const world = lngLatToWorld(lng, lat, zoom);
  return {
    left: world.x - viewportOrigin.x,
    top: world.y - viewportOrigin.y,
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
        left: x * tileSize - viewportOrigin.x,
        top: y * tileSize - viewportOrigin.y,
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

function syncMapData(map: MapLibreMap, selectedLocation: MapPoint, radius: number) {
  const source = map.getSource("radius-area") as GeoJSONSource | undefined;
  source?.setData(radiusFeature(selectedLocation, radius));
}

function createInventoryMarkers(
  map: MapLibreMap,
  inventory: InventoryItem[],
  visibleInventory: InventoryItem[],
  selectedInventoryId: string,
  onSelect?: (id: string) => void,
  onMarkerOpen?: (id: string) => void,
) {
  const visibleIds = new Set(visibleInventory.map((item) => item.id));

  return inventory.map((item) => {
    const visible = visibleIds.has(item.id);
    const selected = item.id === selectedInventoryId;
    const element = document.createElement("button");
    element.type = "button";
    element.className = `maplibre-pin ${formatClass[item.format]} ${visible ? "visible" : "muted"} ${selected ? "selected" : ""}`;
    element.setAttribute("aria-label", `${item.name}, ${formats[item.format].label}`);
    const idLabel = document.createElement("strong");
    idLabel.textContent = item.id.replace("INV-", "");
    const formatLabel = document.createElement("span");
    formatLabel.textContent = formats[item.format].label;
    element.append(idLabel, formatLabel);

    element.addEventListener("click", (event) => { event.preventDefault(); onSelect?.(item.id); onMarkerOpen?.(item.id); });

    return new maplibregl.Marker({ element, anchor: "bottom" })
      .setLngLat(percentToLngLat(item))
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(item)))
      .addTo(map);
  });
}

function createBusinessMarkers(map: MapLibreMap, showCompetitors: boolean) {
  if (!showCompetitors) return [];

  return businesses.map((business) => {
    const element = document.createElement("div");
    element.className = "maplibre-business";
    element.title = `${business.name} (${business.category})`;
    return new maplibregl.Marker({ element })
      .setLngLat(percentToLngLat(business))
      .addTo(map);
  });
}

function createCenterMarker(map: MapLibreMap, selectedLocation: MapPoint) {
  const element = document.createElement("div");
  element.className = "maplibre-center";
  element.title = "Search center";
  return new maplibregl.Marker({ element }).setLngLat(percentToLngLat(selectedLocation)).addTo(map);
}

function popupHtml(item: InventoryItem) {
  return `
    <div class="map-popup">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.address)}</span>
      <small>${formats[item.format].label} - ${item.impressions.toLocaleString("en-US")} impressions</small>
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
