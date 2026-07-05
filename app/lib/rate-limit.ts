import { NextRequest } from "next/server";

type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();

export function isRateLimited(request: NextRequest, scope: string, identifier: string, limit: number, windowMs: number) {
  const forwarded = request.headers.get("x-forwarded-for");
  const client = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const key = `${scope}:${client}:${identifier.toLowerCase()}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}
