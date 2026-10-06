// @vitest-environment jsdom
import "./setup";
import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlayerControl from "../app/component/player-control";

afterEach(() => vi.unstubAllGlobals());
test("pairing code is masked and duplicate creation is disabled while awaiting the server", async () => {
  const user = userEvent.setup();
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => init?.method === "POST" ? await new Promise<Response>((resolve) => { finish = resolve; }) : Response.json({ enabled: true, player: null })));
  render(<PlayerControl inventoryId="I1" screenName="Lobby" />);
  expect(await screen.findByRole("link", { name: "Open kiosk player" })).toHaveAttribute("href", "/player?kiosk=1");
  await user.click(await screen.findByRole("button", { name: "Create pairing code" }));
  expect(screen.getByRole("button", { name: "Creating code…" })).toBeDisabled();
  finish(Response.json({ code: "ABCDEF123456", expiresAt: new Date(Date.now() + 60000).toISOString() }));
  expect(await screen.findByLabelText("Pairing code")).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show pairing code" }));
  expect(screen.getByLabelText("Pairing code")).toHaveValue("ABCDEF123456");
});
test("disconnect uses the shared dialog, preserves state on failure, and restores focus", async () => {
  const user = userEvent.setup();
  const player = { id: "P", connection: "stale", lastSeenAt: null, expectedRevision: 3, receivedRevision: 2, validatedRevision: 2, appliedRevision: 2, appliedAt: null, lastError: null, lastErrorAt: null, lastPlaybackAt: null };
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => init?.method === "DELETE" ? Response.json({ error: "Player service is unavailable. Try again." }, { status: 503 }) : Response.json({ enabled: true, player })));
  render(<PlayerControl inventoryId="I1" screenName="Lobby" />);
  const trigger = await screen.findByRole("button", { name: "Disconnect player" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Disconnect player" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
  await user.click(within(dialog).getByRole("button", { name: "Disconnect player" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("unavailable");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByText("Connection stale")).toBeInTheDocument();
});
