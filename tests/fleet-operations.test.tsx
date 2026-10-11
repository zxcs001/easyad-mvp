/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import FleetOperations from "../app/component/fleet-operations";

const snapshot = {
  owner: true,
  staleMs: 90000,
  operators: [{ id: "USR-OP", name: "Library editor" }],
  screens: [
    { id: "INV-1", name: "City Hall Screen", building: "City Hall", department: "Clerk", content_visibility: "public", advertising_opt_in: false, reserved_seconds: 0, restricted_categories: [], fleet_version: 3 },
    { id: "INV-2", name: "Library Screen", building: "Library", department: "Culture", content_visibility: "public", advertising_opt_in: true, reserved_seconds: 12, restricted_categories: ["alcohol"], fleet_version: 1 },
  ],
  media: [],
  announcements: [],
  audit: [],
  alertDelivery: [],
};

function mockFleet(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ results: [{ id: "INV-2", ok: true }] }), { status: 200 });
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

test("fleet tools show the screen choice once and one task at a time", async () => {
  const user = userEvent.setup();
  const fetchMock = mockFleet(snapshot);
  render(<FleetOperations />);

  const tools = await screen.findByRole("region", { name: "Fleet tools" });
  const tabs = within(tools).getByRole("tablist", { name: "Fleet tasks" });
  expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Screen policy", "Announcements", "Editor access", "Alert delivery", "Audit history"]);
  expect(within(tabs).getByRole("tab", { name: "Screen policy" })).toHaveAttribute("aria-selected", "true");
  // Only the selected task's form is on the page.
  expect(screen.getByRole("button", { name: "Save selected screen policy" })).toBeDisabled();
  expect(screen.getByText("Choose at least one screen in step 1 first.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Schedule selected screens" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("checkbox", { name: /Library Screen/ }));
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  expect(screen.getByLabelText("Building")).toHaveValue("Library");
  await user.click(screen.getByRole("button", { name: "Save selected screen policy" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/institution/fleet", expect.objectContaining({ method: "POST" })));
  const posted = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
  expect(posted).toMatchObject({ action: "settings", targets: [{ id: "INV-2", version: 1 }], building: "Library", restrictedCategories: ["alcohol"] });
  expect(await screen.findByText(/INV-2: Succeeded/)).toBeInTheDocument();

  await user.click(within(tabs).getByRole("tab", { name: "Announcements" }));
  expect(screen.getByRole("button", { name: "Schedule selected screens" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save selected screen policy" })).not.toBeInTheDocument();
  // The selection carries across tasks; old results do not.
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  expect(screen.queryByText(/INV-2: Succeeded/)).not.toBeInTheDocument();

  await user.click(within(tabs).getByRole("tab", { name: "Alert delivery" }));
  expect(screen.getByText("No emergency overrides have been sent to these screens yet.")).toBeInTheDocument();
});

test("a department editor sees no owner policy and no editor access task", async () => {
  mockFleet({ ...snapshot, owner: false, operators: [] });
  render(<FleetOperations />);

  const tabs = await screen.findByRole("tablist", { name: "Fleet tasks" });
  expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Announcements", "Alert delivery", "Audit history"]);
  expect(within(tabs).getByRole("tab", { name: "Announcements" })).toHaveAttribute("aria-selected", "true");
});

test("switched-off fleet operations explain themselves instead of rendering nothing", async () => {
  mockFleet({ error: "Not found" }, 404);
  render(<FleetOperations />);
  expect(await screen.findByText("Fleet tools are switched off")).toBeInTheDocument();
});
