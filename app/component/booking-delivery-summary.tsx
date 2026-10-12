"use client";

import "./booking-delivery-summary.css";
import type { BookingDelivery } from "../lib/delivery-report";
import { useI18n } from "../i18n/client";
import { money } from "../utils";

export default function BookingDeliverySummary({ delivery }: { delivery: BookingDelivery }) {
  const { t, formatNumber, locale } = useI18n();
  const n = (value: number | null) => value === null ? "—" : formatNumber(value);
  if (!delivery.digital) return <p>{t("Static placement: playback counts do not apply. Check proof of posting separately.")}</p>;
  const unknown = delivery.scheduledPlaysToDate === null ? null : Math.max(0, delivery.scheduledPlaysToDate - delivery.player.completed);
  return <div className="booking-delivery-summary">
    <dl>
      <div><dt>{t("Planned plays (full flight)")}</dt><dd>{n(delivery.plannedPlays)}</dd></div>
      <div><dt>{t("Scheduled plays to date")}</dt><dd>{n(delivery.scheduledPlaysToDate)}</dd></div>
      <div><dt>{t("Player-reported completed plays")}</dt><dd>{n(delivery.player.completed)}</dd></div>
      <div><dt>{t("Interrupted plays")}</dt><dd>{n(delivery.player.interrupted)}</dd></div>
      <div><dt>{t("Failed playback reports")}</dt><dd>{n(delivery.player.failed)}</dd></div>
      <div><dt>{t("Late reports (included above)")}</dt><dd>{n(delivery.player.late)}</dd></div>
      <div><dt>{t("Plays without a completed report")}</dt><dd>{n(unknown)}</dd></div>
      <div><dt>{t("Operator-declared completed plays")}</dt><dd>{n(delivery.operator.completed)}</dd></div>
      <div><dt>{t("Operator-declared missed plays")}</dt><dd>{n(delivery.operator.missed)}</dd></div>
      <div><dt>{t("Demo plays (excluded)")}</dt><dd>{n(delivery.demo.completed + delivery.demo.missed)}</dd></div>
      <div><dt>{t("Estimated views")}</dt><dd>{delivery.estimatedViews === null ? "—" : delivery.estimatedViews > 0 && delivery.estimatedViews < 1 ? "<1" : formatNumber(delivery.estimatedViews, { maximumFractionDigits: 0 })}</dd></div>
      <div><dt>{t("Estimated CPM")}</dt><dd>{delivery.estimatedCpm === null ? "—" : money(delivery.estimatedCpm, locale, true)}</dd></div>
    </dl>
    <p>{t(delivery.source === "authenticated_player" ? "Estimate based on authenticated player reports." : delivery.source === "operator_declaration" ? "Estimate based on operator declarations; no authenticated player reports." : "Delivery unknown: no authenticated player reports or operator declarations.")}</p>
    {delivery.plannedPlays === null ? <p>{t("Schedule unavailable: no valid reserved schedule snapshot.")}</p> : null}
    <p>{t("Scheduled counts use reserved dates, dayparts and timezone. They do not account for creative readiness, overrides or downtime. Missing reports do not prove missed playback; a player report does not prove physical screen visibility.")}</p>
    {delivery.creatives.length ? <details>
      <summary>{t("Playback by creative")}</summary>
      <div className="delivery-table-scroll"><table>
        <thead><tr><th scope="col">{t("Creative")}</th><th scope="col">{t("Completed")}</th><th scope="col">{t("Interrupted")}</th><th scope="col">{t("Failed")}</th><th scope="col">{t("Late")}</th></tr></thead>
        <tbody>{delivery.creatives.map(c => <tr key={c.creativeId}><th scope="row">{c.creativeId}</th><td>{n(c.completed)}</td><td>{n(c.interrupted)}</td><td>{n(c.failed)}</td><td>{n(c.late)}</td></tr>)}</tbody>
      </table></div>
    </details> : null}
  </div>;
}
