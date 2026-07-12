import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "USR-OWNER", deleted: false }));
const resource = { resource: { id: "MED-PRIVATE", inventoryId: "INV-PRIVATE", ownerId: "USR-OWNER" }, storagePath: "missing-test-resource.bin" };

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: state.userId, name: "User", email: "user@example.com", role: "operator", status: "active", institutionId: state.userId === "USR-OWNER" ? "INST-1" : "INST-2", operatorLimit: 0, createdAt: "2026-01-01" }),
  canManageInventoryRecord: (user: { institutionId: string }, inventory: { institutionId: string }) => user.institutionId === inventory.institutionId,
}));
vi.mock("../app/lib/db", () => ({
  getMediaResource: async () => resource,
  getInventory: async () => ({ id: "INV-PRIVATE", institutionId: "INST-1" }),
  deleteMediaResource: async () => { state.deleted = true; return resource; },
}));

import { DELETE } from "../app/api/media/[id]/route";

beforeEach(() => { state.userId = "USR-OWNER"; state.deleted = false; });

test("resource owner can delete their media", async () => {
  const response = await DELETE(new NextRequest("http://localhost/api/media/MED-PRIVATE", { method: "DELETE" }), { params: Promise.resolve({ id: "MED-PRIVATE" }) });
  assert.equal(response.status, 200);
  assert.equal(state.deleted, true);
});

test("account outside the owning institution cannot delete media", async () => {
  state.userId = "USR-OTHER";
  const response = await DELETE(new NextRequest("http://localhost/api/media/MED-PRIVATE", { method: "DELETE" }), { params: Promise.resolve({ id: "MED-PRIVATE" }) });
  assert.equal(response.status, 403);
  assert.equal(state.deleted, false);
});
