"use client";

import "./toronto-starter.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { ArrowUpRight } from "lucide-react";
import { INTRO_COOKIE_MAX_AGE, INTRO_COOKIE_NAME } from "../lib/preferences";

import { LanguageSelector, useI18n } from "../i18n/client";
import { readCookieConsent } from "../lib/cookie-consent";
import { mapLibreLocale } from "../i18n/maplibre";

const downtownTorontoCenter: [number, number] = [-79.3832, 43.6532];

export default function TorontoStarter({ show, children }: { show: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(show);
  const [leaving, setLeaving] = useState(false);
  const [remember, setRemember] = useState(false);
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    const unavailable = () => { if (!disposed) setLocating(false); };
    if (!navigator.geolocation) {
      unavailable();
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (disposed) return;
      if (Number.isFinite(coords.longitude) && Number.isFinite(coords.latitude)
        && Math.abs(coords.longitude) <= 180 && Math.abs(coords.latitude) <= 90) {
        setLocation([coords.longitude, coords.latitude]);
      }
      setLocating(false);
    }, unavailable, { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 });
    return () => { disposed = true; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("starter-active");
    return () => document.body.classList.remove("starter-active");
  }, [visible]);

  function enterPortal() {
    if (remember && readCookieConsent() === "preferences") {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${INTRO_COOKIE_NAME}=1; Max-Age=${INTRO_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    }
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 520);
  }

  if (!visible) return children;

  return <main className={`toronto-starter${leaving ? " is-leaving" : ""}`} aria-label={t("Ad campaign starter")}>
    <TorontoThreeDimensionalMap location={location ?? (locating ? null : downtownTorontoCenter)} />
    <div className="toronto-map-wash" aria-hidden="true" />
    <header className="toronto-starter-brand">
      <strong>{t("EasyAD Platform")}</strong>
      <span>{t("Interactive campaign canvas")}</span>
    </header>
    {/* The page's floating language control sits under this full-screen
        starter, so a French speaker could not switch language on the first
        screen. The starter carries its own. */}
    <div className="toronto-starter-language"><LanguageSelector placement="embedded" /></div>
    <section className="toronto-starter-action" aria-label={t("Enter campaign portal")}>
      <p className="starter-eyebrow"><i aria-hidden="true" />{t("Next-gen OOH marketing platform")}</p>
      <h1>{t("The city is your")} <em>{t("canvas.")}</em></h1>
      <p className="starter-sub">{t("Plan, book, and verify out-of-home campaigns across Canada — from geospatial discovery to proof-of-play, in one workspace.")}</p>
      <div className="starter-cta-row">
        <button type="button" onClick={enterPortal}>
          <span>{t("Start my campaign")}</span>
          <i className="starter-cta-arrow" aria-hidden="true"><ArrowUpRight /></i>
        </button>
        <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>{t("Don't show this screen again")} — {t("Requires optional cookies")}</span></label>
      </div>
      <ul className="starter-features" aria-label={t("Platform capabilities")}>
        <li>{t("Geospatial discovery")}</li>
        <li>{t("Creative validation")}</li>
        <li>{t("Proof-of-play")}</li>
      </ul>
    </section>
    <footer className="toronto-starter-meta">
      <span role="status">{location
        ? `${Math.abs(location[1]).toFixed(4)} ${location[1] < 0 ? "S" : "N"} / ${Math.abs(location[0]).toFixed(4)} ${location[0] < 0 ? "W" : "E"}`
        : t(locating ? "Finding your location…" : "Location unavailable — showing downtown Toronto")}</span>
      <span>{t("Building geometry / OpenStreetMap")}</span>
    </footer>
  </main>;
}

function TorontoThreeDimensionalMap({ location }: { location: [number, number] | null }) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: locationRef.current ?? downtownTorontoCenter,
        zoom: 14.7,
        pitch: 62,
        bearing: -28,
        canvasContextAttributes: { antialias: true },
        maxPitch: 82,
        attributionControl: false,
        locale: mapLibreLocale(locale),
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
      if (locationRef.current) {
        map.easeTo({ center: locationRef.current, zoom: 15.55, pitch: 68, bearing: -15, duration: 1800 });
      }
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) setStatus("error");
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [locale]);

  useEffect(() => {
    if (location && mapRef.current?.isStyleLoaded()) {
      mapRef.current.easeTo({ center: location, zoom: 15.55, pitch: 68, bearing: -15, duration: 1800 });
    }
  }, [location]);

  return <div className={`toronto-map status-${status}`}>
    <div ref={containerRef} className="toronto-map-canvas" role="application" aria-label={t("Interactive 3D map")} />
    {status === "loading" ? <div className="toronto-map-loader"><i /><span>{t("Assembling map")}</span></div> : null}
    {status === "error" ? <div className="toronto-map-fallback"><span>{t("Map unavailable")}</span><small>{t("Interactive map data needs an internet connection.")}</small></div> : null}
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
