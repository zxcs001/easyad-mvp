import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { test } from "vitest";
import { proxy } from "../proxy";

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
