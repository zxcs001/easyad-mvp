"use client";

import "./toast.css";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/client";

export type ToastTone = "success" | "error" | "info";
type ToastEntry = { id: number; tone: ToastTone; message: string; leaving?: boolean };

let entries: ToastEntry[] = [];
const listeners = new Set<() => void>();
const expiryTimers = new Map<number, number>();
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

function add(tone: ToastTone, message: string, ttl: number) {
  const duplicate = entries.find((entry) => entry.tone === tone && entry.message === message && !entry.leaving);
  if (duplicate) {
    scheduleExpiry(duplicate.id, ttl);
    return duplicate.id;
  }
  const id = nextId++;
  entries = [...entries.filter((entry) => !entry.leaving), { id, tone, message }].slice(-4);
  emit();
  scheduleExpiry(id, ttl);
  return id;
}

export function dismissToast(id: number) {
  if (!entries.some((entry) => entry.id === id && !entry.leaving)) return;
  const expiryTimer = expiryTimers.get(id);
  if (expiryTimer) window.clearTimeout(expiryTimer);
  expiryTimers.delete(id);
  entries = entries.map((entry) => entry.id === id ? { ...entry, leaving: true } : entry);
  emit();
  if (typeof window === "undefined" || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    removeToast(id);
    return;
  }
  window.setTimeout(() => removeToast(id), 180);
}

function removeToast(id: number) {
  entries = entries.filter((entry) => entry.id !== id);
  expiryTimers.delete(id);
  emit();
}

function scheduleExpiry(id: number, ttl: number) {
  if (typeof window === "undefined" || ttl <= 0) return;
  const previous = expiryTimers.get(id);
  if (previous) window.clearTimeout(previous);
  expiryTimers.set(id, window.setTimeout(() => dismissToast(id), ttl));
}

export const toast = {
  success: (message: string) => add("success", message, 3200),
  error: (message: string) => add("error", message, 4600),
  info: (message: string) => add("info", message, 3200),
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>;
  }
  if (tone === "error") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8h.01M11 12h1v4h1" /></svg>;
}

export function Toaster() {
  const { t } = useI18n();
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!entries.length) return null;
  return (
    <div className="toast-viewport" role="region" aria-label={t("Notifications")}>
      {entries.map((entry) => (
        <div
          aria-atomic="true"
          aria-live={entry.tone === "error" ? "assertive" : "polite"}
          key={entry.id}
          className={`toast toast-${entry.tone}${entry.leaving ? " is-leaving" : ""}`}
          role={entry.tone === "error" ? "alert" : "status"}
        >
          <span className="toast-icon"><ToastIcon tone={entry.tone} /></span>
          <span className="toast-msg">{t(entry.message)}</span>
          <button type="button" className="toast-close" aria-label={t("Dismiss notification")} onClick={() => dismissToast(entry.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
}
