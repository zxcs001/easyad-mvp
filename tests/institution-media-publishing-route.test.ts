import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "institutional" as "institutional" | "operator" | "admin",
  created: null as null | Record<string, unknown>,
}));

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: state.role === "institutional" ? "INST-CIVIC" : `USR-${state.role.toUpperCase()}`, role: state.role }),
  canManageInventory: () => true,
  canManageInventoryRecord: () => true,
  canDirectPublishInstitutionContent: (user: { role: string; id: string }, inventory: { institutionId: string | null }) => Boolean(inventory.institutionId && (user.role === "admin" || user.role === "institutional" && inventory.institutionId === user.id)),
}));

vi.mock("../app/lib/db", () => ({
  getInventory: async () => ({ id: "INV-CIVIC", institutionId: "INST-CIVIC", approvalStatus: "approved" }),
  listMediaResources: async () => [],
  createMediaResource: async (resource: Record<string, unknown>) => {
    state.created = resource;
    return resource;
  },
}));

vi.mock("../app/lib/uploads", () => ({
  inspectMediaUpload: async () => ({ bytes: Buffer.from("image"), mimeType: "image/png", mediaType: "image" }),
}));

vi.mock("../app/lib/media-storage", () => ({
  storeMedia: async () => "stored/content.png",
  deleteStoredMedia: async () => undefined,
}));

vi.mock("../app/utils", () => ({ truncateFileName: (name: string) => name }));

import { POST } from "../app/api/inventory/[id]/media/route";

beforeEach(() => {
  state.role = "institutional";
  state.created = null;
});

test.each(["institutional", "admin"] as const)("%s content bypasses approval and publishes immediately", async (role) => {
  state.role = role;
  const response = await POST(uploadRequest(), { params: Promise.resolve({ id: "INV-CIVIC" }) });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(state.created?.approvalStatus, "approved");
  assert.deepEqual(body.publishing, { approvalRequired: false, status: "published" });
});

test("delegated operator content remains in the institution review queue", async () => {
  state.role = "operator";
  const response = await POST(uploadRequest(), { params: Promise.resolve({ id: "INV-CIVIC" }) });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(state.created?.approvalStatus, "pending review");
  assert.deepEqual(body.publishing, { approvalRequired: true, status: "pending review" });
});

function uploadRequest() {
  const form = new FormData();
  form.set("title", "Road closure notice");
  form.set("file", new File(["image"], "closure.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/inventory/INV-CIVIC/media", { method: "POST", body: form });
}
