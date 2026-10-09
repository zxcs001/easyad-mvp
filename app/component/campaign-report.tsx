"use client";

import "./campaign-report.css";
import { Printer } from "lucide-react";
import type { Booking, InventoryItem } from "../data";
import type { ResponseSummary } from "../lib/responses";
import { useI18n } from "../i18n/client";
import { daysBetween, deliveredImpressions, expectedImpressions, money } from "../utils";
import { costPerResponse } from "./responses-panel";

/**
 * The printable campaign report. Every figure says where it comes from:
 * playback confirmed by the screen owner, views estimated from the screen's
 * audience figure, responses counted by EasyAD, promo-code use reported by the
 * advertiser. Nothing is presented as an audited audience measurement.
 */
export default function CampaignReport({ booking, screen, response, generatedAt }: { booking: Booking; screen: InventoryItem; response: ResponseSummary | null; generatedAt: string }) {
  const { formatDate, formatNumber, locale, t } = useI18n();
  const days = daysBetween(booking.start, booking.end);
  const plannedViews = expectedImpressions(screen, booking.start, booking.end, booking.adSlots);
  const views = deliveredImpressions(screen, booking);
  const cost = costPerResponse(booking.spend, response ?? undefined);
  const cpm = views > 0 ? (booking.spend / views) * 1000 : null;
  const date = (value: string) => formatDate(value.length === 10 ? `${value}T12:00:00` : value, { year: "numeric", month: "long", day: "numeric" });
  const source = screen.measurementSource?.trim() || t("the screen owner");
  const peak = Math.max(1, ...(response?.daily ?? []).map((day) => day.count));

  return (
    <main className="campaign-report">
      <div className="campaign-report-toolbar">
        <button className="primary-button" type="button" onClick={() => window.print()}><Printer aria-hidden="true" />{t("Print or save as PDF")}</button>
      </div>
      <header>
        <p className="eyebrow">{t("EasyAD campaign report")}</p>
        <h1>{booking.campaign}</h1>
        <p>{booking.advertiser} · {screen.name}, {screen.address}</p>
        <p>{t("{start} to {end} ({count} days) · {status}", { start: date(booking.start), end: date(booking.end), count: days, status: t(booking.status) })}</p>
      </header>

      <section aria-labelledby="report-summary">
        <h2 id="report-summary">{t("Summary")}</h2>
        <dl className="campaign-report-figures">
          <div><dt>{t("Spend")}</dt><dd>{money(booking.spend, locale)}</dd></div>
          <div><dt>{t("Confirmed playback")}</dt><dd>{booking.pop}%</dd></div>
          <div><dt>{t("Estimated views")}</dt><dd>{formatNumber(views)}</dd></div>
          <div><dt>{t("Cost per 1,000 views")}</dt><dd>{cpm === null ? "—" : money(cpm, locale, true)}</dd></div>
          <div><dt>{t("Responses")}</dt><dd>{response ? formatNumber(response.responses + response.promoRedemptions) : "—"}</dd></div>
          <div><dt>{t("Cost per response")}</dt><dd>{cost === null ? "—" : money(cost, locale, true)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="report-delivery">
        <h2 id="report-delivery">{t("Delivery")}</h2>
        <p>{t("Playback is the share of planned plays that the screen owner confirmed. It is not a camera check of the physical screen.")}</p>
        <p>{t("Views are an estimate: the screen's daily audience figure, times your share of the screen's loop, times the days, times confirmed playback. Planned before playback: {planned}.", { planned: formatNumber(plannedViews) })}</p>
        <p className="campaign-report-source">{t("Audience figure from {source}", { source })}{screen.measurementUpdatedAt ? ` · ${t("updated {date}", { date: date(screen.measurementUpdatedAt) })}` : ""} · {t("not an audited measurement (COMMB)")}</p>
      </section>

      <section aria-labelledby="report-responses">
        <h2 id="report-responses">{t("Responses")}</h2>
        {response ? <>
          <p>{t("{count} QR scans and link visits, counted by EasyAD through {short}. Only the time of each scan is stored.", { count: formatNumber(response.responses), short: response.shortUrl })}</p>
          {response.promoCode ? <p>{t("Promo code {code}: used {count} times, as reported by the advertiser.", { code: response.promoCode, count: formatNumber(response.promoRedemptions) })}</p> : null}
          <table className="campaign-report-daily">
            <caption>{t("Scans and visits, last 14 days")}</caption>
            <thead><tr><th scope="col">{t("Day")}</th><th scope="col">{t("Responses")}</th><th scope="col"><span className="sr-only">{t("Bar")}</span></th></tr></thead>
            <tbody>{response.daily.map((day) => <tr key={day.date}><td>{formatDate(`${day.date}T12:00:00`, { weekday: "short", month: "short", day: "numeric" })}</td><td>{formatNumber(day.count)}</td><td aria-hidden="true"><i style={{ width: `${(day.count / peak) * 100}%` }} /></td></tr>)}</tbody>
          </table>
        </> : <p>{t("This campaign had no QR code or short link, so responses were not counted.")}</p>}
      </section>

      <footer>{t("Generated {date}", { date: formatDate(generatedAt, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) })} · {booking.id}</footer>
    </main>
  );
}
