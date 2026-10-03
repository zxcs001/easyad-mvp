// @vitest-environment jsdom

import "./setup";
import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DeviceScreen from "../app/component/device-screen";
import type { DeviceAlert } from "../app/data";

test("full device pages contain no API guide or playback controls", () => {
  render(<DeviceScreen inventoryName="Thunder Bay Screen" city="Thunder Bay, ON" imageInterval={8} slides={[]} template="fullscreen" />);

  expect(screen.queryByLabelText("Thunder Bay Screen developer API")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("full device pages use their configured language", () => {
  render(<DeviceScreen displayLanguage="fr" inventoryName="Écran de Thunder Bay" city="Thunder Bay, ON" imageInterval={8} slides={[]} template="fullscreen" />);

  expect(screen.getByLabelText("Écran de Thunder Bay lecteur multimédia")).toHaveAttribute("lang", "fr");
  expect(screen.getByText("Aucune image ni vidéo n'a encore été téléversée pour cet appareil.")).toBeInTheDocument();
});

test("an active emergency override replaces regular screen content", () => {
  const alert: DeviceAlert = {
    id: "ALT-101",
    institutionId: "INST-101",
    alertType: "amber",
    title: "Missing child",
    message: "Call emergency services if you have information.",
    area: "Thunder Bay",
    status: "active",
    targetDeviceIds: ["INV-101"],
    issuedBy: "City Emergency Management",
    createdBy: "USR-101",
    createdAt: "2099-07-10T10:00:00.000Z",
    expiresAt: "2099-07-10T12:00:00.000Z",
    endedAt: null,
  };

  render(<DeviceScreen activeAlert={alert} inventoryName="Thunder Bay Screen" city="Thunder Bay, ON" imageInterval={8} slides={[]} template="fullscreen" />);

  expect(screen.getByRole("alert", { name: "AMBER Alert: Missing child" })).toBeInTheDocument();
  expect(screen.getByText("Call emergency services if you have information.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Thunder Bay Screen developer API")).not.toBeInTheDocument();
});

test("regular content resumes when an emergency override expires", () => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-08-21T12:00:00.000Z");
  const alert: DeviceAlert = {
    id: "ALT-EXPIRING",
    institutionId: "INST-101",
    alertType: "public-safety",
    title: "Temporary closure",
    message: "Use the marked detour.",
    area: "Waterfront",
    status: "active",
    targetDeviceIds: ["INV-101"],
    issuedBy: "City Operations",
    createdBy: "USR-101",
    createdAt: "2026-08-21T11:59:00.000Z",
    expiresAt: "2026-08-21T12:00:01.000Z",
    endedAt: null,
  };

  try {
    render(<DeviceScreen activeAlert={alert} inventoryName="Thunder Bay Screen" city="Thunder Bay, ON" imageInterval={8} slides={[]} template="fullscreen" />);
    expect(screen.getByRole("alert", { name: "Public safety alert: Temporary closure" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_100));

    expect(screen.queryByRole("alert", { name: "Public safety alert: Temporary closure" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thunder Bay Screen developer API")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
