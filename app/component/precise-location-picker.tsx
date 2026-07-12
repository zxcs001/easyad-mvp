"use client";

import "./precise-location-picker.css";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { mapBounds } from "../utils";

type Point = { x: number; y: number };

export default function PreciseLocationPicker({ point, onChange }: { point: Point; onChange: (point: Point) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("webgl2") && !canvas.getContext("webgl") && !canvas.getContext("experimental-webgl")) {
      setFallback(true);
      return;
    }

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: rasterStyle(),
        center: pointToLngLat(point),
        zoom: 12,
        minZoom: 2,
        maxZoom: 16,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "MapLibre GL JS" }), "bottom-right");

      map.on("load", () => {
        const markerElement = document.createElement("div");
        markerElement.className = "precise-location-marker-anchor";
        markerElement.setAttribute("aria-label", "Device location marker");
        const markerIcon = document.createElement("i");
        markerIcon.className = "precise-location-marker";
        markerElement.append(markerIcon);
        markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "bottom" }).setLngLat(pointToLngLat(point)).addTo(map);
      });
      map.on("contextmenu", (event) => {
        event.originalEvent.preventDefault();
        const nextPoint = lngLatToPoint(event.lngLat.lng, event.lngLat.lat);
        markerRef.current?.setLngLat([event.lngLat.lng, event.lngLat.lat]);
        onChangeRef.current(nextPoint);
      });
      map.on("error", () => {
        if (!map.isStyleLoaded()) setFallback(true);
      });
      mapRef.current = map;

      return () => {
        markerRef.current?.remove();
        markerRef.current = null;
        map.remove();
        mapRef.current = null;
      };
    } catch {
      setFallback(true);
    }
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat(pointToLngLat(point));
  }, [point]);

  function setFallbackPoint(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    onChange({
      x: clamp(((event.clientX - box.left) / box.width) * 100, 0, 100),
      y: clamp(((event.clientY - box.top) / box.height) * 100, 0, 100),
    });
  }

  return (
    <div className="precise-location-picker">
      <div ref={containerRef} className="precise-location-map" role="application" aria-label="Precise device location map" />
      {fallback ? <div className="precise-location-fallback" onContextMenu={setFallbackPoint}><i className="precise-location-marker" style={{ left: `${point.x}%`, top: `${point.y}%` }} /></div> : null}
    </div>
  );
}

function rasterStyle() {
  return {
    version: 8 as const,
    sources: {
      osm: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
  };
}

function pointToLngLat(point: Point): [number, number] {
  return [
    mapBounds.west + (mapBounds.east - mapBounds.west) * (point.x / 100),
    mapBounds.north - (mapBounds.north - mapBounds.south) * (point.y / 100),
  ];
}

function lngLatToPoint(lng: number, lat: number): Point {
  return {
    x: clamp(((lng - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 100, 0, 100),
    y: clamp(((mapBounds.north - lat) / (mapBounds.north - mapBounds.south)) * 100, 0, 100),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
