import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  currentRole: "admin",
  created: null as null | { name: string; email: string; role: string; options: Record<string, unknown> },
}));

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "USR-ADMIN", role: state.currentRole }),
  isAllowedRole: (role: unknown) => ["advertiser", "operator", "institutional", "admin"].includes(String(role)),
}));

vi.mock("../app/lib/db", () => ({
  countInstitutionOperators: async () => 0,
  getUserByEmail: async () => null,
  getUserById: async () => null,
  listNonAdminUsers: async () => [],
  createUser: async (name: string, email: string, _passwordHash: string, role: string, options: Record<string, unknown>) => {
    state.created = { name, email, role, options };
    return { id: "USR-INSTITUTION", name, email, role, status: "active", institutionId: null, operatorLimit: options.operatorLimit, createdAt: "2026-08-21T00:00:00.000Z" };
  },
}));

vi.mock("../app/lib/password", () => ({
  hashPassword: () => "hashed-password",
  isAcceptablePassword: (password: string) => password.length >= 10,
}));

import { POST } from "../app/api/admin/users/route";

beforeEach(() => {
  state.currentRole = "admin";
  state.created = null;
});

test("Super Admin can create an Institution account", async () => {
  const response = await POST(new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Lakehead Public Services",
      email: "screens@lakehead.example",
      password: "SecurePass!2026",
      role: "institutional",
      operatorLimit: 8,
    }),
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(state.created, {
    name: "Lakehead Public Services",
    email: "screens@lakehead.example",
    role: "institutional",
    options: { institutionId: null, operatorLimit: 8 },
  });
});

test("non-admin roles cannot create Institution accounts", async () => {
  state.currentRole = "institutional";
  const response = await POST(new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Blocked", email: "blocked@example.test", password: "SecurePass!2026", role: "institutional" }),
  }));

  assert.equal(response.status, 403);
  assert.equal(state.created, null);
});
