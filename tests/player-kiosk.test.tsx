// @vitest-environment jsdom
import "./setup";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PlayerKiosk from "../app/component/player-kiosk";

let fullscreenElement: Element | null;
let requestFullscreen: ReturnType<typeof vi.fn>;
let requestWakeLock: ReturnType<typeof vi.fn>;

function sentinel() {
  const lock = Object.assign(new EventTarget(), {
    released: false,
    type: "screen" as const,
    release: vi.fn(async () => {
      lock.released = true;
      lock.dispatchEvent(new Event("release"));
    }),
  });
  return lock;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/player");
  fullscreenElement = null;
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { get: () => fullscreenElement, configurable: true });
  requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", { value: requestFullscreen, configurable: true });
  Object.defineProperty(document, "exitFullscreen", { value: vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  }), configurable: true });
  requestWakeLock = vi.fn(async () => sentinel());
  vi.stubGlobal("navigator", Object.create(navigator, { wakeLock: { value: { request: requestWakeLock }, configurable: true } }));
  vi.stubGlobal("isSecureContext", true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const property of ["hidden", "fullscreenElement", "exitFullscreen"]) Reflect.deleteProperty(document, property);
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
});

test("mode starts from a click, keeps the player mounted, and exits without clearing pairing or media", async () => {
  const view = render(<PlayerKiosk enabled><input aria-label="Player state" defaultValue="paired" /></PlayerKiosk>);
  const player = screen.getByLabelText("Player state");
  expect(requestWakeLock).not.toHaveBeenCalled();
  expect(requestFullscreen).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start kiosk mode" })));
  expect(window.location.search).toBe("?kiosk=1");
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
  expect(requestWakeLock).toHaveBeenCalledWith("screen");
  expect(view.container.querySelector('[data-controls="hidden"]')).toBeInTheDocument();
  expect(screen.getByLabelText("Player state")).toBe(player);
  fireEvent.click(screen.getByRole("button", { name: "Show kiosk controls" }));
  expect(await screen.findByText("Screen wake lock active.")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Exit kiosk mode" })));
  expect(window.location.search).toBe("");
  expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Player state")).toHaveValue("paired");
  expect(screen.getByLabelText("Player state")).toBe(player);
});

test("query restores kiosk mode without automatic fullscreen, and restores wake lock on visibility", async () => {
  window.history.replaceState(null, "", "/player?kiosk=1");
  const first = sentinel();
  const next = sentinel();
  requestWakeLock.mockResolvedValueOnce(first).mockResolvedValueOnce(next);
  const view = render(<PlayerKiosk enabled><p>Content</p></PlayerKiosk>);
  await screen.findByText("Screen wake lock active.");
  expect(requestFullscreen).not.toHaveBeenCalled();
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  await act(async () => fireEvent(document, new Event("visibilitychange")));
  expect(first.release).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  await act(async () => fireEvent(document, new Event("visibilitychange")));
  expect(requestWakeLock).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(next.release).toHaveBeenCalledTimes(1);
});

test("a pending wake lock is released when the component unmounts", async () => {
  window.history.replaceState(null, "", "/player?kiosk=1");
  let resolve!: (value: ReturnType<typeof sentinel>) => void;
  requestWakeLock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<PlayerKiosk enabled><p>Content</p></PlayerKiosk>);
  expect(requestWakeLock).toHaveBeenCalledTimes(1);
  view.unmount();
  const lock = sentinel();
  await act(async () => resolve(lock));
  expect(lock.release).toHaveBeenCalledTimes(1);
});

test("denied fullscreen and wake lock show recovery actions while content remains available", async () => {
  requestFullscreen.mockRejectedValue(new Error("gesture denied"));
  requestWakeLock.mockRejectedValueOnce(new Error("power saving"));
  render(<PlayerKiosk enabled><p>Content</p></PlayerKiosk>);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start kiosk mode" })));
  expect(screen.getByRole("alert")).toHaveTextContent("Fullscreen unavailable");
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(screen.getByText("Screen wake lock unavailable. Keep the screen awake in device settings.")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry wake lock" })));
  await screen.findByText("Screen wake lock active.");
});

test("insecure origins explain HTTPS and disabled players never start kiosk APIs", async () => {
  window.history.replaceState(null, "", "/player?kiosk=1");
  vi.stubGlobal("isSecureContext", false);
  const view = render(<PlayerKiosk enabled><p>Content</p></PlayerKiosk>);
  await screen.findByText("Use HTTPS to enable screen wake lock and offline recovery.");
  expect(requestWakeLock).not.toHaveBeenCalled();
  view.rerender(<PlayerKiosk enabled={false}><p>Disabled</p></PlayerKiosk>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(requestWakeLock).not.toHaveBeenCalled();
});

test("controls hide after inactivity, preserve keyboard focus, and reopen on fullscreen exit", async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/player?kiosk=1");
  render(<PlayerKiosk enabled><p>Content</p></PlayerKiosk>);
  await act(async () => {});
  const hide = screen.getByRole("button", { name: "Hide controls" });
  hide.focus();
  await act(async () => vi.advanceTimersByTime(6000));
  expect(screen.getByRole("region", { name: "Kiosk controls" })).toBeInTheDocument();
  hide.blur();
  await act(async () => vi.advanceTimersByTime(6000));
  expect(screen.queryByRole("region", { name: "Kiosk controls" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show kiosk controls" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })));
  await act(async () => { fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); });
  expect(screen.getByRole("region", { name: "Kiosk controls" })).toBeInTheDocument();
});
