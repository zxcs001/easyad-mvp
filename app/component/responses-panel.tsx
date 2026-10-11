"use client";

import "./responses-panel.css";
import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Link2, QrCode } from "lucide-react";
import type { Booking, InventoryItem } from "../data";
import type { ResponseSummary } from "../lib/responses";
import { useI18n } from "../i18n/client";
import { money } from "../utils";
import { EmptyState, PanelHeading } from "./shared-ui";

/** Responses an ad produced: QR scans and link visits counted by EasyAD, and promo-code use the advertiser reports. */
export function costPerResponse(spend: number, summary: Pick<ResponseSummary, "responses" | "promoRedemptions"> | undefined) {
  const total = (summary?.responses ?? 0) + (summary?.promoRedemptions ?? 0);
  return total > 0 ? spend / total : null;
}

const VISIBLE_CAMPAIGNS = 6;
const statusRank: Record<Booking["status"], number> = { live: 0, scheduled: 1, approved: 1, "creative review": 2, "pending approval": 2, completed: 3, rejected: 9, cancelled: 9 };

/** Campaigns with a link first, then running and upcoming ones, newest first. Cancelled and rejected ones are left out. */
export function campaignOrder(bookings: Booking[], linked: Map<string, unknown>) {
  return bookings
    .filter((booking) => !["cancelled", "rejected"].includes(booking.status))
    .sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id)) || statusRank[a.status] - statusRank[b.status] || b.start.localeCompare(a.start));
}

/**
 * What the ads made people do. Each booking gets one QR code and short link;
 * scans are counted by EasyAD, promo-code use is what the advertiser reports.
 * The screen owner sees the same figures read-only.
 */
export default function ResponsesPanel({ bookings, inventory, canEdit }: { bookings: Booking[]; inventory: InventoryItem[]; canEdit: boolean }) {
  const { formatDate, formatNumber, locale, t } = useI18n();
  const [responses, setResponses] = useState<ResponseSummary[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/responses", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResponses(((await response.json()) as { responses: ResponseSummary[] }).responses);
    } catch {
      setResponses([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(bookingId: string, body: Record<string, unknown>) {
    setError("");
    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/responses`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { response?: ResponseSummary; error?: string };
    if (!response.ok || !result.response) { setError(result.error ?? "Could not save. Try again."); return false; }
    setResponses((current) => [...(current ?? []).filter((entry) => entry.bookingId !== bookingId), result.response!]);
    return true;
  }

  const byBooking = new Map((responses ?? []).map((entry) => [entry.bookingId, entry]));
  const rows = campaignOrder(bookings, byBooking);
  const visible = showAll ? rows : rows.slice(0, VISIBLE_CAMPAIGNS);
  const totalResponses = (responses ?? []).reduce((sum, entry) => sum + entry.responses + entry.promoRedemptions, 0);

  return (
    <div className="panel span-2 responses-panel">
      <PanelHeading eyebrow={canEdit ? "Results" : "Responses"} title={canEdit ? "What your ads made people do" : "Responses to ads on your screens"} action={<span className="status">{t("{count} responses", { count: formatNumber(totalResponses) })}</span>} />
      <p className="responses-intro">{t("A QR code or short link on an ad counts every scan. EasyAD stores only the time of each scan, never who scanned. Promo-code use is the number you report.")}</p>
      {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
      {!rows.length ? <EmptyState title="No campaigns yet" copy="Book a screen first. Each campaign then gets its own QR code and link." action={canEdit ? <a className="primary-button" href="/?role=advertiser&view=discover">{t("Find screens near you")}</a> : undefined} /> : (
        <ul className="responses-list">
          {visible.map((booking) => {
            const summary = byBooking.get(booking.id);
            const screen = inventory.find((item) => item.id === booking.inventoryId);
            const cost = costPerResponse(booking.spend, summary);
            const peak = Math.max(1, ...(summary?.daily ?? []).map((day) => day.count));
            return (
              <li key={booking.id}>
                <div className="responses-row">
                  <span className="responses-campaign"><strong>{booking.campaign}</strong><small>{screen?.name ?? booking.inventoryId} · {booking.start} – {booking.end}</small></span>
                  {summary ? <>
                    <span className="responses-figure"><strong>{formatNumber(summary.responses)}</strong><small>{t("QR scans and link visits")}</small></span>
                    <span className="responses-figure"><strong>{summary.promoCode ? formatNumber(summary.promoRedemptions) : "—"}</strong><small>{summary.promoCode ? t("Uses of {code} (you report)", { code: summary.promoCode }) : t("No promo code")}</small></span>
                    <span className="responses-figure"><strong>{cost === null ? "—" : money(cost, locale, true)}</strong><small>{t("Cost per response")}</small></span>
                    <span className="responses-spark" role="img" aria-label={t("Responses in the last 14 days: {counts}", { counts: summary.daily.map((day) => day.count).join(", ") })}>
                      {summary.daily.map((day) => <i key={day.date} title={`${formatDate(`${day.date}T12:00:00`, { month: "short", day: "numeric" })}: ${day.count}`} style={{ height: `${Math.max(6, (day.count / peak) * 100)}%` }} className={day.count ? "" : "is-zero"} />)}
                    </span>
                  </> : <span className="responses-none">{t("No QR code or link yet.")}</span>}
                  <span className="responses-actions">
                    {canEdit ? <button type="button" className="secondary-button" onClick={() => setEditing(editing === booking.id ? null : booking.id)}><Link2 aria-hidden="true" />{t(summary ? "Edit link" : "Add a QR code or link")}</button> : null}
                    {summary ? <a className="ghost-button" href={`/api/bookings/${encodeURIComponent(booking.id)}/responses/qr`} download><Download aria-hidden="true" />{t("QR code")}</a> : null}
                    <a className="ghost-button" href={`/report/${encodeURIComponent(booking.id)}`} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{t("Report (PDF)")}</a>
                  </span>
                </div>
                {summary ? <p className="responses-link"><QrCode aria-hidden="true" />{t("{short} opens {destination}", { short: summary.shortUrl, destination: summary.destinationUrl })}{summary.onAd ? ` · ${t("on the ad")}` : ""}</p> : null}
                {editing === booking.id && canEdit ? <ResponseForm summary={summary} onSave={async (body) => { if (await save(booking.id, body)) setEditing(null); }} onCancel={() => setEditing(null)} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > VISIBLE_CAMPAIGNS ? <button type="button" className="ghost-button responses-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? t("Show fewer campaigns") : t("Show all {count} campaigns", { count: formatNumber(rows.length) })}</button> : null}
    </div>
  );
}

function ResponseForm({ summary, onSave, onCancel }: { summary?: ResponseSummary; onSave: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const [destination, setDestination] = useState(summary?.destinationUrl ?? "");
  const [promo, setPromo] = useState(summary?.promoCode ?? "");
  const [redemptions, setRedemptions] = useState(String(summary?.promoRedemptions ?? 0));
  const [busy, setBusy] = useState(false);
  return (
    <form className="responses-form" onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      await onSave({ destinationUrl: destination, promoCode: promo, ...(promo.trim() && summary?.promoCode === promo.trim() ? { promoRedemptions: Number(redemptions) } : {}) });
      setBusy(false);
    }}>
      <label>{t("Page people should open")}<input required inputMode="url" placeholder="yourbusiness.ca/offer" maxLength={500} value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
      <label>{t("Promo code on the ad (optional)")}<input maxLength={24} value={promo} onChange={(event) => setPromo(event.target.value)} /></label>
      {summary?.promoCode && promo.trim() === summary.promoCode ? <label>{t("Times customers used it")}<input type="number" min={0} step={1} value={redemptions} onChange={(event) => setRedemptions(event.target.value)} /></label> : null}
      <small>{t("The short link never changes, so a QR code you already printed keeps working.")}</small>
      <div className="responses-form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>{t("Cancel")}</button>
        <button type="submit" className="primary-button" disabled={busy || !destination.trim()}>{t(busy ? "Saving…" : "Save")}</button>
      </div>
    </form>
  );
}
