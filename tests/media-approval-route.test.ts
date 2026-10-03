import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "institutional" as "institutional" | "operator", updated: "" }));
const resource = { id: "MED-REVIEW", inventoryId: "INV-CIVIC", ownerId: "USR-OP", approvalStatus: "pending review" as const };

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: state.role === "institutional" ? "INST-CIVIC" : "USR-OP", role: state.role }),
  canManageInventoryRecord: () => true,
  canPublishInventoryRecord: (user: { role: string }, inventory: { institutionId: string }) => user.role === "institutional" && inventory.institutionId === "INST-CIVIC",
}));

vi.mock("../app/lib/db", () => ({
  getMediaResource: async () => ({ resource, storagePath: "stored/review.png" }),
  getInventory: async () => ({ id: "INV-CIVIC", institutionId: "INST-CIVIC" }),
  updateMediaApprovalStatus: async (_id: string, approvalStatus: string) => {
    state.updated = approvalStatus;
    return { ...resource, approvalStatus };
  },
  deleteMediaResource: async () => null,
}));

vi.mock("../app/lib/media-storage", () => ({ deleteStoredMedia: async () => undefined }));

import { PATCH } from "../app/api/media/[id]/route";

beforeEach(() => {
  state.role = "institutional";
  state.updated = "";
});

test("owning institution can approve delegated screen content", async () => {
  const response = await PATCH(reviewRequest("approved"), { params: Promise.resolve({ id: resource.id }) });
  assert.equal(response.status, 200);
  assert.equal(state.updated, "approved");
});

test("delegated operator cannot approve its own screen content", async () => {
  state.role = "operator";
  const response = await PATCH(reviewRequest("approved"), { params: Promise.resolve({ id: resource.id }) });
  assert.equal(response.status, 403);
  assert.equal(state.updated, "");
});

function reviewRequest(approvalStatus: string) {
  return new NextRequest(`http://localhost/api/media/${resource.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalStatus }),
  });
}
