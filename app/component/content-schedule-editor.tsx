"use client";

import { useState } from "react";
import type { MediaResource } from "../data";
import { parseContentSchedule, type ContentSchedule } from "../lib/content-schedule";
import { useI18n } from "../i18n/client";
import AsyncButton from "./async-button";
import "./content-schedule-editor.css";

export type SaveContentSchedule = (id: string, schedule: ContentSchedule | null, revision: number) => Promise<boolean>;
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const zones = ["America/St_Johns", "America/Halifax", "America/Toronto", "America/Winnipeg", "America/Regina", "America/Edmonton", "America/Vancouver", "America/Whitehorse", "UTC"];

export default function ContentScheduleEditor({ resource, requiresReview, onSave }: { resource: MediaResource; requiresReview: boolean; onSave: SaveContentSchedule }) {
  const { t } = useI18n();
  let saved: ContentSchedule | null = null;
  let invalidSaved = false;
  try { saved = parseContentSchedule(resource.contentSchedule ?? null); } catch { invalidSaved = true; }
  const [repeat, setRepeat] = useState(saved ? saved.daysOfWeek.length === 7 ? "daily" : "weekly" : "always");
  const [days, setDays] = useState(saved?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [allDay, setAllDay] = useState(!saved || (saved.startTime === "00:00" && saved.endTime === "24:00"));
  const [startTime, setStartTime] = useState(saved?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(saved?.endTime === "24:00" ? "00:00" : saved?.endTime ?? "17:00");
  const [timezone, setTimezone] = useState(saved?.timezone ?? "America/Toronto");
  const [startDate, setStartDate] = useState(saved?.startDate ?? "");
  const [endDate, setEndDate] = useState(saved?.endDate ?? "");
  const [error, setError] = useState("");
  const candidate: ContentSchedule | null = repeat === "always" ? null : { version: 1, timezone, daysOfWeek: repeat === "daily" ? [0, 1, 2, 3, 4, 5, 6] : [...days].sort((a, b) => a - b), startTime: allDay ? "00:00" : startTime, endTime: allDay || endTime === "00:00" && saved?.endTime === "24:00" ? "24:00" : endTime, startDate: startDate || null, endDate: endDate || null, paused: saved?.paused ?? false };
  const dirty = invalidSaved || JSON.stringify(candidate) !== JSON.stringify(saved);
  async function save(value: ContentSchedule | null) {
    setError("");
    try { return await onSave(resource.id, parseContentSchedule(value), resource.revision ?? 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this schedule."); return false; }
  }

  return <section className="content-schedule-editor" aria-label={t("Recurring content schedule")}>
    <h4>{t("Recurring content schedule")}</h4>
    <label>{t("Repeat")}<select aria-label={t("Repeat")} value={repeat} onChange={event => { setRepeat(event.target.value); setError(""); }}><option value="always">{t("Always available")}</option><option value="daily">{t("Every day")}</option><option value="weekly">{t("Selected weekdays")}</option></select></label>
    {repeat !== "always" ? <>
      {repeat === "weekly" ? <fieldset className="content-schedule-days"><legend>{t("Weekdays")}</legend>{weekdays.map((day, index) => <label key={day}><input type="checkbox" checked={days.includes(index)} onChange={event => setDays(event.target.checked ? [...days, index] : days.filter(value => value !== index))} />{t(day)}</label>)}</fieldset> : null}
      <label className="content-schedule-check"><input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)} />{t("All day")}</label>
      {!allDay ? <div className="content-schedule-pair"><label>{t("From")}<input type="time" aria-label={t("Start time")} value={startTime} onChange={event => setStartTime(event.target.value)} /></label><label>{t("Until")}<input type="time" aria-label={t("End time")} value={endTime} onChange={event => setEndTime(event.target.value)} /></label></div> : null}
      {!allDay && endTime < startTime ? <p>{t("Ends the following day. Weekdays and dates refer to when the window starts.")}</p> : null}
      <label>{t("Timezone")}<input aria-label={t("Timezone")} list={`content-timezones-${resource.id}`} value={timezone} onChange={event => setTimezone(event.target.value)} /><datalist id={`content-timezones-${resource.id}`}>{zones.map(zone => <option value={zone} key={zone} />)}</datalist></label>
      <div className="content-schedule-pair"><label>{t("First date (optional)")}<input type="date" aria-label={t("First date (optional)")} value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label>{t("Last date (optional)")}<input type="date" aria-label={t("Last date (optional)")} min={startDate || undefined} value={endDate} onChange={event => setEndDate(event.target.value)} /></label></div>
      <p>{t("Hours follow this timezone, including daylight saving changes.")}</p>
    </> : null}
    {resource.startsAt || resource.endsAt ? <p>{t("The existing one-time start and end dates also apply.")}</p> : null}
    {requiresReview ? <p>{t("Schedule changes require institution approval before playback.")}</p> : null}
    <div className="content-schedule-actions">
      <AsyncButton className="primary-button" aria-label={t("Save schedule")} disabled={!dirty} onClick={() => save(candidate)} successMessage="Content schedule saved." errorMessage="Could not save this schedule.">{t("Save schedule")}</AsyncButton>
      {saved ? <AsyncButton className="secondary-button" aria-label={t(saved.paused ? "Resume schedule" : "Pause schedule")} disabled={dirty} onClick={() => save({ ...saved, paused: !saved.paused })} successMessage={saved.paused ? "Content schedule resumed." : "Content schedule paused."} errorMessage="Could not save this schedule.">{t(saved.paused ? "Resume schedule" : "Pause schedule")}</AsyncButton> : null}
    </div>
    {dirty ? <small>{t("Unsaved changes")}</small> : null}
    {error ? <p className="content-schedule-error" role="alert">{t(error)}</p> : null}
  </section>;
}

export function ContentScheduleSummary({ resource }: { resource: MediaResource }) {
  const { t } = useI18n();
  let rule;
  try { rule = parseContentSchedule(resource.contentSchedule ?? null); } catch { return <small>{t("Invalid schedule")}</small>; }
  return <>
    <small>{rule ? `${rule.paused ? `${t("Schedule paused")} · ` : ""}${rule.daysOfWeek.length === 7 ? t("Every day") : rule.daysOfWeek.map(day => t(weekdays[day])).join(", ")} · ${rule.startTime === "00:00" && rule.endTime === "24:00" ? t("All day") : `${rule.startTime}–${rule.endTime}`} · ${rule.timezone}` : t("Always available")}</small>
    {rule?.startDate || rule?.endDate ? <small>{rule.startDate ?? "…"} {t("to")} {rule.endDate ?? "…"}</small> : null}
    {resource.startsAt || resource.endsAt ? <small>{t("The existing one-time start and end dates also apply.")} {resource.startsAt ?? "…"} — {resource.endsAt ?? "…"}</small> : null}
  </>;
}
