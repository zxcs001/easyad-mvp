import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "institutional",
  userId: "INST-CIVIC",
  devices: {} as Record<string, Record<string, unknown>>,
  alerts: [] as Record<string, unknown>[],
  createdInput: null as Record<string, unknown> | null,
}));

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => state.role === "signed-out" ? null : ({
    id: state.userId,
    name: "City Emergency Management",
    email: "alerts@city.example",
    role: state.role,
    status: "active",
    institutionId: null,
    operatorLimit: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  canManageInstitutionAlerts: (user: { role: string }) => user.role === "institutional" || user.role === "admin",
  canManageInventoryRecord: (user: { id: string; role: string }, inventory: { institutionId?: string }) => user.role === "admin" || inventory.institutionId === user.id,
}));

vi.mock("../app/lib/db", () => ({
  getInventory: async (id: string) => state.devices[id] ?? null,
  listDeviceAlerts: async (institutionId?: string) => state.alerts.filter((alert) => !institutionId || alert.institutionId === institutionId),
  createDeviceAlertIfNoConflict: async (input: Record<string, unknown>) => {
    const targetDeviceIds = input.targetDeviceIds as string[];
    const conflictingAlert = state.alerts.find((alert) => alert.institutionId === input.institutionId
      && alert.status === "active"
      && Date.parse(String(alert.expiresAt)) > Date.now()
      && (alert.targetDeviceIds as string[]).some((id) => targetDeviceIds.includes(id)));
    if (conflictingAlert) return { alert: null, conflictingAlert };
    state.createdInput = input;
    return { alert: { id: "ALT-CREATED", status: "active", createdAt: "2026-01-01T00:00:00.000Z", endedAt: null, ...input }, conflictingAlert: null };
  },
}));

import { POST } from "../app/api/institution/alerts/route";

beforeEach(() => {
  state.role = "institutional";
  state.userId = "INST-CIVIC";
  state.devices = {
    "INV-OWNED": { id: "INV-OWNED", institutionId: "INST-CIVIC", approvalStatus: "approved" },
    "INV-OTHER": { id: "INV-OTHER", institutionId: "INST-OTHER", approvalStatus: "approved" },
    "INV-DRAFT": { id: "INV-DRAFT", institutionId: "INST-CIVIC", approvalStatus: "pending approval" },
  };
  state.alerts = [];
  state.createdInput = null;
});

test("institution staff can publish an authorized override only to their published screens", async () => {
  const response = await POST(alertRequest(["INV-OWNED"]));
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.alert.alertType, "amber");
  assert.deepEqual(state.createdInput?.targetDeviceIds, ["INV-OWNED"]);
  assert.equal(state.createdInput?.institutionId, "INST-CIVIC");
});

test("super admins can publish an override for a single institution network", async () => {
  state.role = "admin";
  state.userId = "USR-SUPER-ADMIN";

  const response = await POST(alertRequest(["INV-OWNED"]));

  assert.equal(response.status, 201);
  assert.equal(state.createdInput?.institutionId, "INST-CIVIC");
  assert.deepEqual(state.createdInput?.targetDeviceIds, ["INV-OWNED"]);
});

test("an institution cannot target another institution's screen", async () => {
  const response = await POST(alertRequest(["INV-OTHER"]));

  assert.equal(response.status, 403);
  assert.equal(state.createdInput, null);
});

test("an unpublished screen cannot receive an emergency override", async () => {
  const response = await POST(alertRequest(["INV-DRAFT"]));

  assert.equal(response.status, 409);
  assert.equal(state.createdInput, null);
});

test("operators cannot use institution emergency controls", async () => {
  state.role = "operator";
  const response = await POST(alertRequest(["INV-OWNED"]));

  assert.equal(response.status, 403);
  assert.equal(state.createdInput, null);
});

test("an overlapping active override is rejected by the atomic create operation", async () => {
  state.alerts = [{
    id: "ALT-ACTIVE",
    institutionId: "INST-CIVIC",
    status: "active",
    targetDeviceIds: ["INV-OWNED"],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }];

  const response = await POST(alertRequest(["INV-OWNED"]));

  assert.equal(response.status, 409);
  assert.equal(state.createdInput, null);
});

function alertRequest(targetDeviceIds: string[]) {
  return new NextRequest("http://localhost/api/institution/alerts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      alertType: "amber",
      title: "Missing child",
      message: "Call emergency services with verified information.",
      area: "River District",
      targetDeviceIds,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
}
