"use client";

import { useEffect, useState } from "react";

const maxTimerDelay = 2_147_483_647;

export function useExpiringClock(expiresAtValues: string[]) {
  const [now, setNow] = useState(() => Date.now());
  const nextExpiry = expiresAtValues
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > now)
    .sort((left, right) => left - right)[0];

  useEffect(() => {
    if (nextExpiry === undefined) return;
    const delay = Math.min(maxTimerDelay, Math.max(0, nextExpiry - Date.now() + 25));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [nextExpiry]);

  return now;
}
