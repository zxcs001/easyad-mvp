"use client";

import "./toast.css";
import { useEffect, useState } from "react";

export type ToastTone = "success" | "error" | "info";
type ToastEntry = { id: number; tone: ToastTone; message: string };

let entries: ToastEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

function add(tone: ToastTone, message: string, ttl: number) {
  const id = nextId++;
  entries = [...entries, { id, tone, message }];
  emit();
  if (ttl > 0 && typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), ttl);
  }
  return id;
}

export function dismissToast(id: number) {
  entries = entries.filter((entry) => entry.id !== id);
  emit();
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
    <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
      {entries.map((entry) => (
        <div key={entry.id} className={`toast toast-${entry.tone}`} role="status">
          <span className="toast-icon"><ToastIcon tone={entry.tone} /></span>
          <span className="toast-msg">{entry.message}</span>
          <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismissToast(entry.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
}
