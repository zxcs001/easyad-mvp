"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/client";
import { EmptyState, PanelHeading } from "./shared-ui";
import { WorkspaceTabs, workspaceTabPanel, type WorkspaceTab } from "./workspace-tabs";
import "./fleet-operations.css";

type Screen = { id: string; name: string; building: string; department: string; content_visibility: string; advertising_opt_in: boolean; reserved_seconds: number; restricted_categories: string[]; fleet_version: number };
type Row = Record<string, any>;
type Snapshot = { operators: Row[]; screens: Screen[]; media: Row[]; announcements: Row[]; audit: Row[]; alertDelivery: Row[]; staleMs: number; owner: boolean };
type FleetTab = "policy" | "announcements" | "editors" | "delivery" | "audit";

/**
 * Fleet tools: work on many screens at once. Step 1 chooses the screens; the
 * tabs hold one task each, so a person sees one form at a time instead of the
 * whole run of policy, scheduling, access, delivery and audit sections.
 */
export default function FleetOperations() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [tab, setTab] = useState<FleetTab | null>(null);
  const [policy, setPolicy] = useState({ building: "", department: "", visibility: "public", advertisingOptIn: false, reservedSeconds: 0, restrictedCategories: "" });
  const [mediaId, setMediaId] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [name, setName] = useState("");
  const [operatorId, setOperatorId] = useState("");

  async function load(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/institution/fleet", { signal });
      if (response.status === 404) { setUnavailable(true); return "unavailable"; }
      if (!response.ok) { setError(t("Fleet could not be loaded.")); return; }
      setData(await response.json());
    } catch {
      if (!signal?.aborted) setError(t("Fleet could not be loaded."));
    }
  }

  // A 404 means fleet operations are switched off. Polling on logged a 404 every 15 seconds for as long as the view stayed open.
  useEffect(() => {
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval> | undefined;
    const poll = async () => { if (await load(controller.signal) === "unavailable") clearInterval(interval); };
    void poll();
    interval = setInterval(() => void poll(), 15000);
    return () => { controller.abort(); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(body: Row) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/institution/fleet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) setError(t(payload.error));
      else setResults(payload.results ?? [{ id: payload.id ?? operatorId, ok: true }]);
      await load();
    } catch {
      setError(t("Result uncertain. Refresh before retrying; your input is preserved."));
    } finally {
      setBusy(false);
    }
  }

  function targets() {
    return data?.screens.filter((screen) => selected.includes(screen.id)).map((screen) => ({ id: screen.id, version: screen.fleet_version })) ?? [];
  }

  function schedule() {
    if (!starts || !ends || !Number.isFinite(Date.parse(starts)) || Date.parse(ends) <= Date.parse(starts)) {
      setError(t("Choose a valid content start and end time"));
      return;
    }
    void post({ action: "schedule", targets: targets(), mediaId, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() });
  }

  const tabs = useMemo<WorkspaceTab<FleetTab>[]>(() => {
    if (!data) return [];
    return [
      ...(data.owner ? [{ id: "policy" as const, label: "Screen policy" }] : []),
      { id: "announcements" as const, label: "Announcements" },
      ...(data.operators.length ? [{ id: "editors" as const, label: "Editor access" }] : []),
      { id: "delivery" as const, label: "Alert delivery", badge: data.alertDelivery.length || undefined },
      { id: "audit" as const, label: "Audit history" },
    ];
  }, [data]);
  const activeTab = tab && tabs.some((entry) => entry.id === tab) ? tab : tabs[0]?.id ?? "announcements";

  function changeTab(next: FleetTab) {
    setTab(next);
    setResults([]);
    setError("");
  }

  if (unavailable) {
    return <section className="panel"><EmptyState title="Fleet tools are switched off" copy="Ask your platform administrator to turn on fleet operations for this workspace." /></section>;
  }
  if (!data) return error ? <section className="panel"><p className="form-error" role="alert">{error}</p></section> : null;

  const visible = data.screens.filter((screen) => `${screen.building} ${screen.department} ${screen.name}`.toLowerCase().includes(filter.toLowerCase()));
  const noSelection = !selected.length;
  const selectionHint = noSelection ? <p className="fleet-selection-hint" id="fleet-selection-hint">{t("Choose at least one screen in step 1 first.")}</p> : null;
  const feedback = <>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <ul className="fleet-results" aria-live="polite">{results.map((result, index) => <li key={`${result.id}-${index}`} className={result.ok ? "is-ok" : "is-failed"}>{result.id}: {t(result.ok ? "Succeeded" : "Failed")}{result.error ? ` — ${t(result.error)}` : ""}</li>)}</ul>
  </>;

  return (
    <section className="fleet-operations" aria-label={t("Fleet tools")}>
      <div className="panel fleet-scope">
        <PanelHeading eyebrow="Step 1" title="Choose screens" action={<span className={`status${selected.length ? " good" : ""}`}>{t("{count} selected", { count: selected.length })}</span>} />
        <p>{t("Select explicit screens. Each result is reported separately.")}</p>
        <div className="fleet-scope-toolbar">
          <label>{t("Filter building or department")}<input value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
          <button type="button" onClick={() => setSelected(visible.map((screen) => screen.id))}>{t("Select filtered screens")}</button>
          <button type="button" onClick={() => setSelected([])}>{t("Clear selection")}</button>
          <button type="button" onClick={() => void load()}>{t("Refresh")}</button>
        </div>
        <fieldset>
          <legend>{t("Screen scope")}: {selected.length}</legend>
          <div className="fleet-screen-list">
            {visible.map((screen) => (
              <label key={screen.id}>
                <input type="checkbox" checked={selected.includes(screen.id)} onChange={(event) => {
                  setSelected((current) => event.target.checked ? [...current, screen.id] : current.filter((id) => id !== screen.id));
                  if (event.target.checked) setPolicy({ building: screen.building, department: screen.department, visibility: screen.content_visibility, advertisingOptIn: screen.advertising_opt_in, reservedSeconds: screen.reserved_seconds, restrictedCategories: screen.restricted_categories.join(", ") });
                }} />
                <span><strong>{screen.name}</strong><small>{screen.building || "—"} / {screen.department || "—"} · {t(screen.content_visibility)} · {t(screen.advertising_opt_in ? "Open to advertising" : "Institution use only")}</small></span>
              </label>
            ))}
            {!visible.length ? <p className="fleet-empty">{t("No screens match this filter.")}</p> : null}
          </div>
        </fieldset>
      </div>

      <div className="fleet-task">
        <p className="fleet-step-label">{t("Step 2: choose a task")}</p>
        <WorkspaceTabs label="Fleet tasks" idPrefix="fleet" tabs={tabs} value={activeTab} onChange={changeTab} />
        <div className="panel fleet-task-panel" {...workspaceTabPanel("fleet", activeTab)}>
          {activeTab === "policy" && data.owner ? (
            <form noValidate onSubmit={(event) => { event.preventDefault(); void post({ action: "settings", targets: targets(), ...policy, restrictedCategories: policy.restrictedCategories.split(",").map((entry) => entry.trim()).filter(Boolean) }); }}>
              <h3>{t("Owner screen policy")}</h3>
              <p>{t("Checking a screen in step 1 copies its current policy here.")}</p>
              <div className="fleet-form-grid">
                <label>{t("Building")}<input value={policy.building} onChange={(event) => setPolicy({ ...policy, building: event.target.value })} /></label>
                <label>{t("Department")}<input value={policy.department} onChange={(event) => setPolicy({ ...policy, department: event.target.value })} /></label>
                <label>{t("Content visibility")}<select value={policy.visibility} onChange={(event) => setPolicy({ ...policy, visibility: event.target.value })}><option value="public">{t("Public")}</option><option value="private">{t("Private player only")}</option></select></label>
                <label>{t("Reserved institutional seconds per loop")}<input type="number" min="0" value={policy.reservedSeconds} onChange={(event) => setPolicy({ ...policy, reservedSeconds: Number(event.target.value) })} /></label>
                <label>{t("Restricted categories, comma separated")}<input value={policy.restrictedCategories} onChange={(event) => setPolicy({ ...policy, restrictedCategories: event.target.value })} /></label>
                <label className="fleet-checkbox"><input type="checkbox" checked={policy.advertisingOptIn} onChange={(event) => setPolicy({ ...policy, advertisingOptIn: event.target.checked })} />{t("Open to private-sector advertising")}</label>
              </div>
              <p>{t("Advertising exclusion does not make content private. Private content requires an empty screen and an authenticated player.")}</p>
              {selectionHint}
              <div className="fleet-actions">
                <button className="primary-button" disabled={busy || noSelection} aria-describedby={noSelection ? "fleet-selection-hint" : undefined} type="submit">{t("Save selected screen policy")}</button>
                <button type="button" disabled={busy || noSelection} aria-describedby={noSelection ? "fleet-selection-hint" : undefined} onClick={() => void post({ action: "publish", targets: targets() })}>{t("Publish selected screens")}</button>
                <button type="button" disabled={busy || noSelection} aria-describedby={noSelection ? "fleet-selection-hint" : undefined} onClick={() => void post({ action: "unpublish", targets: targets() })}>{t("Unpublish selected screens")}</button>
              </div>
              {feedback}
            </form>
          ) : null}

          {activeTab === "announcements" ? (
            <form noValidate onSubmit={(event) => { event.preventDefault(); schedule(); }}>
              <h3>{t("Reusable announcements and scheduling")}</h3>
              <div className="fleet-form-grid">
                <label>{t("Source announcement media")}<select value={mediaId} onChange={(event) => setMediaId(event.target.value)}><option value="">{t("Choose media")}</option>{data.media.map((media) => <option key={media.id} value={media.id}>{media.title} · {media.inventory_id} · {t(media.approval_status)}</option>)}</select></label>
                <label>{t("Saved announcement")}<select value="" onChange={(event) => setMediaId(event.target.value)}><option value="">{t("Choose saved announcement")}</option>{data.announcements.map((announcement) => <option key={announcement.id} value={announcement.media_id}>{announcement.name}</option>)}</select></label>
                <label>{t("Content starts")}<input type="datetime-local" value={starts} onChange={(event) => setStarts(event.target.value)} /></label>
                <label>{t("Content ends")}<input type="datetime-local" value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
                <label>{t("Announcement name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
              </div>
              <p>{t("Owner copies publish directly. Operator copies require owner approval.")}</p>
              {selectionHint}
              <div className="fleet-actions">
                <button type="button" disabled={busy || !mediaId || !name.trim()} onClick={() => void post({ action: "save_announcement", mediaId, name })}>{t("Save reusable announcement")}</button>
                <button className="primary-button" disabled={busy || !mediaId || noSelection} aria-describedby={noSelection ? "fleet-selection-hint" : undefined} type="submit">{t("Schedule selected screens")}</button>
              </div>
              {feedback}
            </form>
          ) : null}

          {activeTab === "editors" && data.operators.length ? (
            <form noValidate onSubmit={(event) => { event.preventDefault(); void post({ action: "scope_operator", operatorId, screenIds: selected }); }}>
              <h3>{t("Department editor scope")}</h3>
              <label>{t("Department editor")}<select value={operatorId} onChange={(event) => setOperatorId(event.target.value)}><option value="">{t("Choose an operator")}</option>{data.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label>
              <p>{t("Only selected screens remain accessible. Saving revokes the operator's existing sessions.")}</p>
              <div className="fleet-actions"><button type="submit" disabled={busy || !operatorId}>{t("Save scope and revoke sessions")}</button></div>
              {feedback}
            </form>
          ) : null}

          {activeTab === "delivery" ? (
            <div className="fleet-section">
              <h3>{t("Alert delivery by screen")}</h3>
              <p>{t("Browser render reports do not prove physical panel visibility or official alert delivery.")}</p>
              {data.alertDelivery.length ? (
                <div className="fleet-table-scroll"><table><thead><tr>{["Screen", "Connection", "Received", "Applied", "Browser rendered", "Restored"].map((key) => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{data.alertDelivery.map((row) => <tr key={`${row.alert_id}-${row.inventory_id}`}><td>{row.inventory_id}<small>{row.alert_id}</small></td><td>{t(!row.player_id ? "Not paired" : !row.last_seen_at ? "Unknown" : Date.now() - Date.parse(row.last_seen_at) > data.staleMs ? "Stale / offline" : "Online")}</td>{["received_at", "applied_at", "rendered_at", "restored_at"].map((key) => <td key={key}>{row[key] ? new Date(row[key]).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA") : t("Not reported")}</td>)}</tr>)}</tbody></table></div>
              ) : <p className="fleet-empty">{t("No emergency overrides have been sent to these screens yet.")}</p>}
            </div>
          ) : null}

          {activeTab === "audit" ? (
            <div className="fleet-section">
              <h3>{t("Fleet audit history")}</h3>
              {data.audit.length ? <ul className="fleet-audit">{data.audit.map((entry, index) => <li key={index}>{entry.created_at} · {entry.actor_id} · {entry.target_id} · {entry.action} · {entry.revision ?? "—"} · {entry.priority} · {entry.result}</li>)}</ul> : <p className="fleet-empty">{t("No fleet changes recorded yet.")}</p>}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
