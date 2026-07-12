"use client";

import "./google-inventory-map.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InventoryItem } from "../data";
import { formats } from "../data";
import { mapBounds, money, number } from "../utils";

type GoogleMapsGlobal = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindow;
    Circle: new (options: Record<string, unknown>) => GoogleCircle;
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
  };
};

type GoogleMap = {
  setCenter: (position: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  setMapTypeId: (mapTypeId: string) => void;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
};

type GoogleCircle = {
  setMap: (map: GoogleMap | null) => void;
};

type GoogleInfoWindow = {
  open: (options: { map: GoogleMap; anchor: GoogleMarker }) => void;
};

type LatLngLiteral = {
  lat: number;
  lng: number;
};

type GoogleMapWindow = Window & {
  google?: GoogleMapsGlobal;
  __googleMapsPromise?: Promise<GoogleMapsGlobal>;
  __resolveGoogleMaps?: () => void;
};

type Props = {
  apiKey: string;
  inventory: InventoryItem[];
  center?: { x: number; y: number };
};

const defaultCenter = { x: 67.29, y: 40.95 };

export default function GoogleInventoryMap({ apiKey, inventory, center = defaultCenter }: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRefs = useRef<GoogleMarker[]>([]);
  const circleRef = useRef<GoogleCircle | null>(null);
  const [status, setStatus] = useState<"missing-key" | "loading" | "ready" | "error">(
    apiKey ? "loading" : "missing-key",
  );
  const [selectedId, setSelectedId] = useState(inventory[0]?.id ?? "");
  const [radiusKm, setRadiusKm] = useState(20);
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  const selectedItem = useMemo(
    () => inventory.find((item) => item.id === selectedId) ?? inventory[0],
    [inventory, selectedId],
  );
  const selectedPosition = useMemo(
    () => selectedItem ? inventoryToLatLng(selectedItem) : percentToLatLng(center),
    [center, selectedItem],
  );

  useEffect(() => {
    if (!apiKey || !mapElementRef.current) return;

    let disposed = false;

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (disposed || !mapElementRef.current) return;

        const map = new google.maps.Map(mapElementRef.current, {
          center: selectedPosition,
          zoom: selectedItem ? 13 : 4,
          mapTypeId: mapType,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: true,
          clickableIcons: true,
          gestureHandling: "greedy",
        });

        mapRef.current = map;
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });

    return () => {
      disposed = true;
      clearGoogleOverlays();
      if (mapRef.current) {
        getGoogleMaps()?.maps.event.clearInstanceListeners(mapRef.current);
      }
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const google = getGoogleMaps();
    if (status !== "ready" || !map || !google) return;

    clearGoogleOverlays();

    map.setMapTypeId(mapType);
    map.setCenter(selectedPosition);
    map.setZoom(selectedItem ? 13 : 4);

    circleRef.current = new google.maps.Circle({
      map,
      center: selectedPosition,
      radius: radiusKm * 1000,
      strokeColor: "#1f7a5a",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#1f7a5a",
      fillOpacity: 0.12,
    });

    markerRefs.current = inventory.map((item) => {
      const marker = new google.maps.Marker({
        map,
        position: inventoryToLatLng(item),
        title: item.name,
        label: item.format.slice(0, 1).toUpperCase(),
      });
      const info = new google.maps.InfoWindow({
        content: popupHtml(item),
      });
      markerClick(marker, () => {
        setSelectedId(item.id);
        info.open({ map, anchor: marker });
      });
      return marker;
    });
  }, [inventory, mapType, radiusKm, selectedId, selectedItem, selectedPosition, status]);

  function clearGoogleOverlays() {
    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];
    circleRef.current?.setMap(null);
    circleRef.current = null;
  }

  if (!apiKey) {
    return (
      <div className="google-map-empty">
        <strong>Google Maps API key required</strong>
        <span>Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local`, then restart the dev server.</span>
      </div>
    );
  }

  return (
    <div className="google-map-frame">
      <div className="google-map-toolbar">
        <label>
          Device
          <select value={selectedItem?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
            {inventory.length ? inventory.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            )) : <option value="">No published inventory</option>}
          </select>
        </label>
        <label>
          Radius
          <input
            type="range"
            min="8"
            max="30"
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
          />
          <span>{radiusKm} km</span>
        </label>
        <label>
          Layer
          <select value={mapType} onChange={(event) => setMapType(event.target.value as "roadmap" | "satellite")}>
            <option value="roadmap">Roadmap</option>
            <option value="satellite">Satellite</option>
          </select>
        </label>
      </div>
      <div ref={mapElementRef} className="google-map-canvas" role="application" aria-label="Google inventory map" />
      {status !== "ready" ? <div className="google-map-status">{status === "error" ? "Google Maps failed to load." : "Loading Google Maps..."}</div> : null}
      {selectedItem ? (
        <div className="google-map-summary">
          <strong>{selectedItem.name}</strong>
          <span>{selectedItem.address}</span>
          <span>{formats[selectedItem.format].label} - {number(selectedItem.impressions)} impressions - {money(selectedItem.price)}/day</span>
        </div>
      ) : null}
    </div>
  );
}

function loadGoogleMaps(apiKey: string) {
  const currentWindow = window as GoogleMapWindow;
  if (currentWindow.google?.maps) return Promise.resolve(currentWindow.google);
  if (currentWindow.__googleMapsPromise) return currentWindow.__googleMapsPromise;

  currentWindow.__googleMapsPromise = new Promise<GoogleMapsGlobal>((resolve, reject) => {
    currentWindow.__resolveGoogleMaps = () => {
      if (currentWindow.google?.maps) resolve(currentWindow.google);
      else reject(new Error("Google Maps loaded without a maps object."));
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      callback: "__resolveGoogleMaps",
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Unable to load Google Maps."));
    document.head.appendChild(script);
  });

  return currentWindow.__googleMapsPromise;
}

function getGoogleMaps() {
  return (window as GoogleMapWindow).google;
}

function markerClick(marker: GoogleMarker, handler: () => void) {
  const maybeMarker = marker as GoogleMarker & { addListener?: (eventName: string, handler: () => void) => void };
  maybeMarker.addListener?.("click", handler);
}

function inventoryToLatLng(item: InventoryItem) {
  return percentToLatLng({ x: item.x, y: item.y });
}

function percentToLatLng(point: { x: number; y: number }): LatLngLiteral {
  return {
    lng: mapBounds.west + (mapBounds.east - mapBounds.west) * (point.x / 100),
    lat: mapBounds.north - (mapBounds.north - mapBounds.south) * (point.y / 100),
  };
}

function popupHtml(item: InventoryItem) {
  const tags = item.tags?.length ? `<p>${item.tags.slice(0, 5).map(escapeHtml).join(", ")}</p>` : "";
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:240px">
      <strong style="display:block;margin-bottom:4px">${escapeHtml(item.name)}</strong>
      <span style="display:block;color:#5b6770">${escapeHtml(item.address)}</span>
      <span style="display:block;margin-top:8px">${formats[item.format].label}</span>
      <span style="display:block">${number(item.impressions)} impressions</span>
      ${tags}
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
