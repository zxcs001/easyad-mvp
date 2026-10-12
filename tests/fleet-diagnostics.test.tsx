/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import FleetDiagnostics from "../app/component/fleet-diagnostics";
import { browserHealth } from "./helpers/kiosk-diagnostics-fixtures";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test("operator diagnostics expose operational status without recovery controls", async () => {
  render(<FleetDiagnostics players={[browserHealth(), browserHealth({ inventoryId: "INV-2", playerId: null, lastSeenAt: null, diagnostics: null, diagnosticsAt: null })]} names={{ "INV-1": "Hall", "INV-2": "Library" }} canRecover={false} onRefresh={vi.fn()} />);
  expect(screen.getByText("Healthy browser")).toBeVisible(); expect(screen.getByText("Chrome 140.0.0.0 · Windows")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Reload kiosk page" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Show screens needing attention"));
  expect(screen.queryByRole("article", { name: "Hall" })).not.toBeInTheDocument(); expect(screen.getByRole("article", { name: "Library" })).toBeVisible();
});
test("an uncertain request retries the same key; bulk recovery uses only explicitly selected screens", async () => {
  const user = userEvent.setup(), refresh = vi.fn();
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValue(new Response(JSON.stringify({ results: [{ id: "INV-1", ok: true }, { id: "INV-2", ok: false, error: "Screen changed" }] })));
  vi.stubGlobal("fetch", fetchMock);
  render(<FleetDiagnostics players={[browserHealth(), browserHealth({ inventoryId: "INV-2", playerId: "PLY-2" }), browserHealth({ inventoryId: "INV-3", playerId: "PLY-3" })]} names={{ "INV-1": "Hall", "INV-2": "Library" }} selected={["INV-1", "INV-2"]} canRecover onRefresh={refresh} />);
  const button = screen.getByRole("button", { name: "Refresh content on selected screens" });
  await user.click(button); expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  await user.click(button); expect(await screen.findByText("Hall: Queued for player")).toBeVisible();
  expect(screen.getByText("Library: Screen changed")).toBeVisible(); expect(refresh).toHaveBeenCalledOnce();
  const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[1]).toMatchObject({ action: "recover_players", targets: [{ id: "INV-1", playerId: "PLY-1" }, { id: "INV-2", playerId: "PLY-2" }] });
});
test("pending commands disable single recovery and owner actions work outside the fleet endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ command: {} }), { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<FleetDiagnostics players={[browserHealth(), browserHealth({ inventoryId: "INV-2", commands: [{ id: "REC-1", kind: "reload_player", status: "received", requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), finishedAt: null, result: null }] })]} names={{ "INV-1": "Hall", "INV-2": "Library" }} canRecover onRefresh={vi.fn()} />);
  expect(within(screen.getByRole("article", { name: "Library" })).getByRole("button", { name: "Reload kiosk page" })).toBeDisabled();
  await userEvent.click(within(screen.getByRole("article", { name: "Hall" })).getByRole("button", { name: "Rebuild media cache" }));
  expect(fetchMock.mock.calls[0][0]).toBe("/api/inventory/INV-1/player/recovery");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ kind: "rebuild_cache", playerId: "PLY-1" });
});
