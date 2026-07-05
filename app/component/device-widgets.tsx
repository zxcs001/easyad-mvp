"use client";

import { useEffect, useState } from "react";

// --- deterministic per-device helpers ------------------------------------------

function hashSeed(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

// --- weather icons -------------------------------------------------------------

type ConditionKey = "clear" | "partly" | "cloudy" | "rain" | "snow";

const conditions: { key: ConditionKey; label: string }[] = [
  { key: "clear", label: "Clear" },
  { key: "partly", label: "Partly cloudy" },
  { key: "cloudy", label: "Cloudy" },
  { key: "rain", label: "Light rain" },
  { key: "snow", label: "Snow" },
];

function WeatherIcon({ condition, size = 40 }: { condition: ConditionKey; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", "aria-hidden": true } as const;
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (condition === "clear") {
    return (
      <svg {...common}><circle cx="24" cy="24" r="9" fill="#f7c948" stroke="#f7c948" />{[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => { const r = (deg * Math.PI) / 180; return <line key={deg} x1={24 + Math.cos(r) * 14} y1={24 + Math.sin(r) * 14} x2={24 + Math.cos(r) * 19} y2={24 + Math.sin(r) * 19} stroke="#f7c948" strokeWidth={2.4} strokeLinecap="round" />; })}</svg>
    );
  }
  if (condition === "partly") {
    return <svg {...common}><circle cx="18" cy="18" r="7" fill="#f7c948" stroke="#f7c948" /><path d="M16 32h18a7 7 0 0 0 0-14 9 9 0 0 0-17 2 6 6 0 0 0-1 12z" fill="#cfd8e3" {...stroke} stroke="#cfd8e3" /></svg>;
  }
  if (condition === "rain") {
    return <svg {...common}><path d="M15 28h18a7 7 0 0 0 0-14 9 9 0 0 0-17 2 6 6 0 0 0-1 12z" fill="#b9c4d0" stroke="#b9c4d0" />{[18, 26, 34].map((x) => <line key={x} x1={x} y1={34} x2={x - 3} y2={42} {...stroke} stroke="#5fb0e6" />)}</svg>;
  }
  if (condition === "snow") {
    return <svg {...common}><path d="M15 28h18a7 7 0 0 0 0-14 9 9 0 0 0-17 2 6 6 0 0 0-1 12z" fill="#cdd6e0" stroke="#cdd6e0" />{[16, 24, 32].map((x) => <text key={x} x={x} y={43} fill="#dceaf5" fontSize="9" textAnchor="middle">*</text>)}</svg>;
  }
  return <svg {...common}><path d="M15 31h18a7 7 0 0 0 0-14 9 9 0 0 0-17 2 6 6 0 0 0-1 12z" fill="#cfd8e3" stroke="#cfd8e3" /></svg>;
}

// --- live clock ----------------------------------------------------------------

export function DeviceClock({ city }: { city: string }) {
  const mounted = useMounted();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = mounted && now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const date = mounted && now
    ? now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
    : "";
  return (
    <div className="device-clock">
      <strong>{time}</strong>
      <span>{date || " "}</span>
      <small>{city}</small>
    </div>
  );
}

// --- weather panel -------------------------------------------------------------

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildForecast(seed: string) {
  const rand = mulberry32(hashSeed(`${seed}-weather`));
  const baseTemp = Math.round(6 + rand() * 16);
  const current = conditions[Math.floor(rand() * conditions.length)];
  const todayIndex = new Date().getDay();
  const days = Array.from({ length: 4 }, (_, offset) => {
    const condition = conditions[Math.floor(rand() * conditions.length)];
    const hi = baseTemp + Math.round(rand() * 5) - offset;
    const lo = hi - Math.round(4 + rand() * 5);
    return { label: offset === 0 ? "Today" : dayNames[(todayIndex + offset) % 7], condition: condition.key, hi, lo };
  });
  return {
    current: current.key,
    currentLabel: current.label,
    temp: baseTemp,
    feels: baseTemp - Math.round(rand() * 3),
    humidity: 45 + Math.round(rand() * 40),
    wind: 6 + Math.round(rand() * 22),
    days,
  };
}

export function WeatherPanel({ city, seed, compact = false }: { city: string; seed: string; compact?: boolean }) {
  const forecast = buildForecast(seed);
  if (compact) {
    return (
      <div className="weather-compact">
        <span className="weather-compact-icon"><WeatherIcon condition={forecast.current} size={34} /></span>
        <strong>{forecast.temp}&deg;</strong>
        <span>{forecast.currentLabel}</span>
      </div>
    );
  }
  return (
    <div className="weather-panel">
      <span className="device-widget-eyebrow">Local weather</span>
      <div className="weather-now">
        <WeatherIcon condition={forecast.current} size={64} />
        <div>
          <strong>{forecast.temp}&deg;C</strong>
          <span>{forecast.currentLabel}</span>
        </div>
      </div>
      <div className="weather-meta">
        <span>Feels {forecast.feels}&deg;</span>
        <span>Humidity {forecast.humidity}%</span>
        <span>Wind {forecast.wind} km/h</span>
      </div>
      <div className="weather-forecast">
        {forecast.days.map((day) => (
          <div className="weather-day" key={day.label}>
            <span>{day.label}</span>
            <WeatherIcon condition={day.condition} size={30} />
            <strong>{day.hi}&deg;</strong>
            <small>{day.lo}&deg;</small>
          </div>
        ))}
      </div>
      <span className="device-widget-source">{city} &middot; updated continuously</span>
    </div>
  );
}

// --- public information / local government -------------------------------------

const civicNotices = [
  { title: "City Hall hours", body: "Service counters open Mon-Fri, 8:30am - 4:30pm." },
  { title: "Overnight parking ban", body: "Snow-route parking ban in effect 1:00am - 7:00am." },
  { title: "Public library", body: "Free Wi-Fi and warming centre open until 9:00pm." },
  { title: "Waste collection", body: "Recycling pickup moves to Wednesday this week." },
];

export function PublicInfoPanel({ city }: { city: string }) {
  return (
    <div className="public-info-panel">
      <span className="device-widget-eyebrow">Public information</span>
      <div className="civic-notice-list">
        {civicNotices.map((notice) => (
          <div className="civic-notice" key={notice.title}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ))}
      </div>
      <div className="civic-reserved" role="note">
        <span className="device-widget-eyebrow">Reserved for local government</span>
        <span>{city} municipal messaging space</span>
      </div>
    </div>
  );
}

// --- transit / bus stops -------------------------------------------------------

const transitRoutes = [
  { route: "3", dest: "Downtown Terminal" },
  { route: "12", dest: "Lakehead University" },
  { route: "8", dest: "Intercity Mall" },
  { route: "2", dest: "Marina Waterfront" },
  { route: "14", dest: "Airport" },
];

function buildDepartures(seed: string) {
  const rand = mulberry32(hashSeed(`${seed}-transit`));
  return transitRoutes.map((entry) => ({ ...entry, minutes: 1 + Math.floor(rand() * 18) })).sort((a, b) => a.minutes - b.minutes);
}

export function TransitPanel({ stopName, seed, ticker = false }: { stopName: string; seed: string; ticker?: boolean }) {
  const mounted = useMounted();
  const [departures, setDepartures] = useState(() => buildDepartures(seed));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDepartures((current) =>
        current
          .map((entry) => ({ ...entry, minutes: entry.minutes <= 1 ? 1 + Math.floor(Math.random() * 18) : entry.minutes - 1 }))
          .sort((a, b) => a.minutes - b.minutes),
      );
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (ticker) {
    return (
      <div className="transit-ticker" aria-label={`Departures from ${stopName}`}>
        <span className="transit-ticker-label">Next buses</span>
        <div className="transit-ticker-track">
          {departures.map((entry) => (
            <span className="transit-ticker-item" key={entry.route}>
              <b>{entry.route}</b> {entry.dest} <em>{mounted ? `${entry.minutes} min` : "-- min"}</em>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="transit-panel">
      <span className="device-widget-eyebrow">Next departures</span>
      <span className="transit-stop">{stopName}</span>
      <div className="transit-list">
        {departures.map((entry) => (
          <div className="transit-row" key={entry.route}>
            <span className="transit-route">{entry.route}</span>
            <span className="transit-dest">{entry.dest}</span>
            <span className="transit-eta">{mounted ? entry.minutes : "--"}<small>min</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}
