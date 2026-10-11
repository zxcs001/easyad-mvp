/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import AlertReadyPanel from "../app/component/alert-ready-panel";

const alert = {
  key: "cap-pac@canada.ca|urn:oid:1|2026-10-09T18:00:00-00:00", event: "tornado", headline: "Tornado warning in effect", headlineFr: null, areaDescription: "City of Thunder Bay",
  sent: "2026-10-09T18:00:00.000Z", expiresAt: "2099-10-09T20:00:00.000Z", msgType: "Alert", broadcastImmediately: true, signature: "unsigned",
  screens: [{ id: "TB-1", name: "City Hall", match: "polygon" }, { id: "TB-2", name: "Library", match: "census-subdivision-approximate" }], state: "waiting", showingAlertIds: [] as string[],
};
const snapshot: { enabled: boolean; mode: string; signatureConfigured: boolean; feed: { lastHeartbeatAt: string; lastAlertAt: null; healthy: boolean }; alerts: (typeof alert)[] } = { enabled: true, mode: "review", signatureConfigured: false, feed: { lastHeartbeatAt: new Date().toISOString(), lastAlertAt: null, healthy: true }, alerts: [alert] };

afterEach(() => vi.unstubAllGlobals());

test("an institution sees official alerts over its screens, chooses the mode, and shows one on screens", async () => {
  const user = userEvent.setup();
  const calls: { url: string; init?: RequestInit }[] = [];
  let current: typeof snapshot = snapshot;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") { current = { ...current, alerts: [{ ...alert, state: "showing", showingAlertIds: ["ALT-1"] }] }; return Response.json({ alertIds: ["ALT-1"] }, { status: 201 }); }
    if (init?.method === "PUT") { current = { ...current, mode: JSON.parse(String(init.body)).mode }; return Response.json({ mode: current.mode }); }
    return Response.json(current);
  }));
  const onScreensChanged = vi.fn();
  const onEnd = vi.fn(async () => ({}));
  render(<AlertReadyPanel institutionId="INST-1" onScreensChanged={onScreensChanged} onEnd={onEnd} />);

  const panel = await screen.findByRole("region", { name: "Alert Ready" });
  expect(within(panel).getByText("Feed connected")).toBeInTheDocument();
  expect(within(panel).getByText(/It does not issue alerts/)).toBeInTheDocument();
  expect(within(panel).getByRole("radio", { name: /Ask me first/ })).toBeChecked();
  expect(within(panel).getByText("Tornado warning in effect")).toBeInTheDocument();
  expect(within(panel).getByText(/2 of your screens are in the area · approximate area/)).toBeInTheDocument();
  expect(within(panel).getByText("Not signed")).toBeInTheDocument();

  await user.click(within(panel).getByRole("button", { name: "Show on 2 screens" }));
  await waitFor(() => expect(within(panel).getByText("Showing on screens")).toBeInTheDocument());
  expect(JSON.parse(String(calls.find((call) => call.init?.method === "POST")?.init?.body))).toEqual({ key: alert.key, institutionId: "INST-1" });
  expect(onScreensChanged).toHaveBeenCalled();

  await user.click(within(panel).getByRole("button", { name: "End on my screens" }));
  expect(onEnd).toHaveBeenCalledWith("ALT-1");

  await user.click(within(panel).getByRole("radio", { name: /Show automatically/ }));
  await waitFor(() => expect(within(panel).getByRole("radio", { name: /Show automatically/ })).toBeChecked());
  // Without the Pelmorex certificate, automatic mode says what it cannot do.
  expect(within(panel).getByText(/Automatic display needs the Pelmorex signing certificate/)).toBeInTheDocument();
});

test("the panel stays hidden while the relay is switched off", async () => {
  const fetchMock = vi.fn(async () => Response.json({ error: "off" }, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(<AlertReadyPanel institutionId="INST-1" onScreensChanged={vi.fn()} onEnd={vi.fn()} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
