"use client";

import "./toronto-starter.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { ArrowUpRight } from "lucide-react";
import { INTRO_COOKIE_MAX_AGE, INTRO_COOKIE_NAME } from "../lib/preferences";

const torontoCenter: [number, number] = [-79.3832, 43.6532];

export default function TorontoStarter({ show, children }: { show: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(show);
  const [leaving, setLeaving] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("starter-active");
    return () => document.body.classList.remove("starter-active");
  }, [visible]);

  function enterPortal() {
    if (remember) {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${INTRO_COOKIE_NAME}=1; Max-Age=${INTRO_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    }
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 520);
  }

  if (!visible) return children;

  return <main className={`toronto-starter${leaving ? " is-leaving" : ""}`} aria-label="Toronto campaign starter">
    <TorontoThreeDimensionalMap />
    <div className="toronto-map-wash" aria-hidden="true" />
    <header className="toronto-starter-brand">
      <strong>OOH / TORONTO</strong>
      <span>Interactive campaign canvas</span>
    </header>
    <section className="toronto-starter-action" aria-label="Enter campaign portal">
      <p>Next Gen Marketing Platform</p>
      <button type="button" onClick={enterPortal}><span>Start My Campaign</span><ArrowUpRight aria-hidden="true" /></button>
      <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>Don&apos;t show this screen again</span></label>
    </section>
    <footer className="toronto-starter-meta">
      <span>43.6532 N / 79.3832 W</span>
      <span>Toronto building geometry / OpenStreetMap</span>
    </footer>
  </main>;
}

function TorontoThreeDimensionalMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: torontoCenter,
        zoom: 14.7,
        pitch: 62,
        bearing: -28,
        canvasContextAttributes: { antialias: true },
        maxPitch: 82,
        attributionControl: false,
      });
    } catch {
      setStatus("error");
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "MapLibre GL JS" }), "bottom-right");
    map.on("load", () => {
      styleTorontoBuildings(map);
      setStatus("ready");
      map.easeTo({ center: [-79.3821, 43.6509], zoom: 15.55, pitch: 68, bearing: -15, duration: 5200, essential: true });
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) setStatus("error");
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div className={`toronto-map status-${status}`}>
    <div ref={containerRef} className="toronto-map-canvas" role="application" aria-label="Interactive 3D map of downtown Toronto" />
    {status === "loading" ? <div className="toronto-map-loader"><i /><span>Assembling Toronto</span></div> : null}
    {status === "error" ? <div className="toronto-map-fallback"><span>Toronto</span><small>Interactive map data needs an internet connection.</small></div> : null}
  </div>;
}

function styleTorontoBuildings(map: MapLibreMap) {
  const existing = map.getLayer("building-3d");
  if (!existing && map.getSource("openmaptiles")) {
    map.addLayer({
      id: "starter-building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 8], 0, "#deddd4", 40, "#c8cac2", 130, "#aeb5b0", 260, "#889b98"],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": .94,
      },
    });
  }
  const layerId = map.getLayer("building-3d") ? "building-3d" : map.getLayer("starter-building-3d") ? "starter-building-3d" : null;
  if (layerId) {
    map.setPaintProperty(layerId, "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 8], 0, "#e4e1d7", 45, "#c9ccc4", 130, "#aab6b1", 260, "#718f8a"]);
    map.setPaintProperty(layerId, "fill-extrusion-opacity", .94);
  }
}
