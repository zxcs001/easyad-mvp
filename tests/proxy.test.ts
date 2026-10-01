import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { test, vi } from "vitest";
import { proxy } from "../proxy";

test("production CSP permits map data while restricting other external connections", () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    const response = proxy(new NextRequest("https://easyad.example/"));
    const policy = response.headers.get("Content-Security-Policy");
    assert.ok(policy);
    const connect = policy.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("connect-src "));
    assert.deepEqual(connect?.split(/\s+/).slice(1), [
      "'self'",
      "https://tile.openstreetmap.org",
      "https://tiles.openfreemap.org",
    ]);
    assert.ok(policy.includes("worker-src 'self' blob:"));
  } finally {
    vi.unstubAllEnvs();
  }
});

test("HTML creative documents can be framed only by this site and cannot run scripts", () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    const response = proxy(new NextRequest("https://easyad.example/creative-html/CRV-1"));
    assert.equal(response.headers.get("X-Frame-Options"), "SAMEORIGIN");
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    assert.ok(policy.includes("sandbox"));
    assert.ok(policy.includes("default-src 'none'"));
    assert.ok(policy.includes("frame-ancestors 'self'"));
    assert.ok(!policy.includes("script-src"));
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  } finally {
    vi.unstubAllEnvs();
  }
});

test("only the player can validate and frame cached HTML blob ads", () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    const player = proxy(new NextRequest("https://easyad.example/player"));
    const playerPolicy = player.headers.get("Content-Security-Policy") ?? "";
    assert.ok(playerPolicy.includes("connect-src 'self' blob:"));
    assert.ok(playerPolicy.includes("frame-src 'self' blob:"));
    const otherPolicy = proxy(new NextRequest("https://easyad.example/")).headers.get("Content-Security-Policy") ?? "";
    assert.ok(!otherPolicy.includes("connect-src 'self' blob:"));
    assert.ok(!otherPolicy.includes("frame-src 'self' blob:"));
  } finally {
    vi.unstubAllEnvs();
  }
});

test("proxy rejects cross-origin API mutations and permits same-origin requests", () => {
  const blocked = proxy(new NextRequest("http://localhost:3000/api/bookings", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(blocked.status, 403);

  const allowed = proxy(new NextRequest("http://localhost:3000/api/bookings", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  }));
  assert.notEqual(allowed.status, 403);
  assert.equal(allowed.headers.get("X-Content-Type-Options"), "nosniff");
});

test("proxy accepts the browser origin derived from the request host", () => {
  const allowed = proxy(new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
    },
  }));

  assert.notEqual(allowed.status, 403);
});

test("proxy keeps mutation requests without an origin blocked", () => {
  const blocked = proxy(new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
  }));

  assert.equal(blocked.status, 403);
});

test("proxy lets public API routes define their own cache policy", () => {
  const response = proxy(new NextRequest("http://localhost:3000/api/public/devices/INV-1/media"));
  assert.equal(response.headers.get("Cache-Control"), null);
});

test("proxy defaults to English when no locale or Quebec region is present", () => {
  const response = proxy(new NextRequest("http://localhost:3000/"));
  assert.equal(response.headers.get("x-middleware-request-x-easyad-locale"), "en");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("proxy defaults Quebec requests to French", () => {
  const response = proxy(new NextRequest("http://localhost:3000/", {
    headers: {
      "x-vercel-ip-country": "CA",
      "x-vercel-ip-country-region": "QC",
    },
  }));
  assert.equal(response.headers.get("x-middleware-request-x-easyad-locale"), "fr");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("proxy preserves an explicit language choice over Quebec detection", () => {
  const response = proxy(new NextRequest("http://localhost:3000/", {
    headers: {
      cookie: "easyad_locale=en",
      "x-vercel-ip-country": "CA",
      "x-vercel-ip-country-region": "QC",
    },
  }));
  assert.equal(response.headers.get("x-middleware-request-x-easyad-locale"), "en");
  assert.equal(response.headers.get("set-cookie"), null);
});
