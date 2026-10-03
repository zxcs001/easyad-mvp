import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "institutional" }));

vi.mock("../app/lib/db", () => ({
  getUserByEmail: async (email: string) => ({ id: "USR-ROLE", email, role: state.role, status: "active", password_hash: "hash" }),
}));

vi.mock("../app/lib/password", () => ({ verifyPassword: () => true }));
vi.mock("../app/lib/rate-limit", () => ({ isRateLimited: () => false }));
vi.mock("../app/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../app/lib/auth")>("../app/lib/auth");
  return {
    ...actual,
    requestUrl: (request: NextRequest, path: string) => new URL(path, request.nextUrl.origin),
    setSessionCookie: async () => undefined,
  };
});

import { POST } from "../app/api/auth/login/route";

beforeEach(() => {
  state.role = "institutional";
});

test("an Institution account signs in directly to its government dashboard", async () => {
  const response = await POST(loginRequest());

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/government");
});

test("an explicit safe return path still wins over the role home", async () => {
  const response = await POST(loginRequest("/?role=institutional&view=portal"));

  assert.equal(response.headers.get("location"), "http://localhost/?role=institutional&view=portal");
});

test("the government sign-in accepts Institution accounts and stays on the dedicated route", async () => {
  const response = await POST(loginRequest("/government?view=inventory", "government"));

  assert.equal(response.headers.get("location"), "http://localhost/government?view=inventory");
});

test("the government sign-in rejects marketplace-only roles", async () => {
  state.role = "advertiser";
  const response = await POST(loginRequest("/government", "government"));

  assert.equal(response.headers.get("location"), "http://localhost/government/login?error=access");
});

test("login rejects return paths that URL parsing would normalize to another origin", async () => {
  state.role = "advertiser";
  const response = await POST(loginRequest("/\\evil.example"));

  assert.equal(response.headers.get("location"), "http://localhost/?role=advertiser&view=portal");
});

test("government login rejects lookalike paths outside the government route root", async () => {
  const response = await POST(loginRequest("/governmentevil", "government"));

  assert.equal(response.headers.get("location"), "http://localhost/government");
});

function loginRequest(returnTo = "", audience = "marketplace") {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "institution@example.test", password: "SecurePass!2026", returnTo, audience }),
  });
}
