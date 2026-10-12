// @vitest-environment jsdom
import "./setup";
import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import ContentScheduleEditor from "../app/component/content-schedule-editor";
import type { MediaResource } from "../app/data";
import type { ContentSchedule } from "../app/lib/content-schedule";
import { FixedLocaleProvider } from "../app/i18n/client";

const media: MediaResource = { id: "m", inventoryId: "i", ownerId: "o", title: "Message", originalName: "message.png", mimeType: "image/png", mediaType: "image", approvalStatus: "approved", sizeBytes: 1, publicUrl: "/media/m", createdAt: "2026-10-11T00:00:00Z", revision: 1 };
test("weekly overnight saves, then pause and resume preserve the rule", async () => {
  const user = userEvent.setup(), save = vi.fn();
  function Harness() {
    const [resource, setResource] = useState(media);
    return <ContentScheduleEditor key={resource.revision} resource={resource} requiresReview={false} onSave={async (id, schedule, revision) => { save(id, schedule, revision); setResource({ ...resource, revision: revision + 1, contentSchedule: JSON.parse(JSON.stringify(schedule, Object.keys(schedule!).sort())) }); return true; }} />;
  }
  render(<Harness />);
  expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Repeat"), "weekly");
  await user.click(screen.getByLabelText("All day"));
  await user.clear(screen.getByLabelText("Start time"));
  await user.type(screen.getByLabelText("Start time"), "22:00");
  await user.clear(screen.getByLabelText("End time"));
  await user.type(screen.getByLabelText("End time"), "02:00");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("m", expect.objectContaining({ startTime: "22:00", endTime: "02:00", daysOfWeek: [1, 2, 3, 4, 5] }), 1));
  expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Pause schedule" }));
  expect(save.mock.calls[1][1].paused).toBe(true);
  await user.click(screen.getByRole("button", { name: "Resume schedule" }));
  expect(save.mock.calls[2][1].paused).toBe(false);
  expect(save.mock.calls[2][1].startTime).toBe("22:00");
});
test("invalid weekdays do not save, and server conflicts remain visible", async () => {
  const user = userEvent.setup(), save = vi.fn().mockRejectedValue(new Error("This content changed. Reload before saving its schedule."));
  render(<ContentScheduleEditor resource={media} requiresReview onSave={save} />);
  expect(screen.getByText("Schedule changes require institution approval before playback.")).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Repeat"), "weekly");
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) await user.click(screen.getByLabelText(day));
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Select at least one weekday.");
  await user.click(screen.getByLabelText("Sunday"));
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This content changed."));
});
test("French schedule controls and always-available clearing are supported", async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(true);
  const rule: ContentSchedule = { version: 1, timezone: "UTC", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "24:00", startDate: null, endDate: null, paused: true };
  render(<FixedLocaleProvider locale="fr"><ContentScheduleEditor resource={{ ...media, contentSchedule: rule }} requiresReview={false} onSave={save} /></FixedLocaleProvider>);
  expect(screen.getByRole("button", { name: "Reprendre l’horaire" })).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Répétition"), "always");
  await user.click(screen.getByRole("button", { name: "Enregistrer l’horaire" }));
  expect(save).toHaveBeenCalledWith("m", null, 1);
});
