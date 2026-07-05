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
