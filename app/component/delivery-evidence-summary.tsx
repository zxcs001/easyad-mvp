"use client";
import "./booking-delivery-summary.css";
import { useI18n } from "../i18n/client";
type Row = Record<string, unknown>;
export default function DeliveryEvidenceSummary({ events, reconciliation = [] }: { events: Row[]; reconciliation?: Row[] }) {
    const { t, locale } = useI18n();
    const sum = (filter: (row: Row) => boolean) => events.filter(filter).reduce((total, row) => total + Number(row.count ?? 0), 0).toLocaleString(locale);
    return <>
      <dl>
        <div><dt>{t("Player-reported completed plays")}</dt><dd>{sum(row => row.provenance === "authenticated_player" && row.event_type === "delivered")}</dd></div>
        <div><dt>{t("Interrupted plays")}</dt><dd>{sum(row => row.provenance === "authenticated_player" && row.event_type === "partial")}</dd></div>
        <div><dt>{t("Unverifiable reports")}</dt><dd>{sum(row => row.provenance === "authenticated_player" && row.event_type === "unverifiable")}</dd></div>
        <div><dt>{t("Late reports")}</dt><dd>{sum(row => row.provenance === "authenticated_player" && row.late === true)}</dd></div>
        <div><dt>{t("Legacy event reports")}</dt><dd>{sum(row => row.provenance !== "authenticated_player")}</dd></div>
      </dl>
      {reconciliation.length ? <div className="delivery-table-scroll"><table>
        <thead><tr><th scope="col">{t("Placement")}</th><th scope="col">{t("Planned plays (full flight)")}</th><th scope="col">{t("Scheduled plays to date")}</th><th scope="col">{t("Completed")}</th><th scope="col">{t("Plays without a completed report")}</th></tr></thead>
        <tbody>{reconciliation.map(row => <tr key={String(row.placementId)}><th scope="row">{String(row.placementId)}</th>{[row.plannedPlays, row.nominalScheduledPlays, row.playerReportedPlays, row.unreported].map((value, i) => <td key={i}>{value === null || value === undefined ? "—" : Number(value).toLocaleString(locale)}</td>)}</tr>)}</tbody>
      </table><p>{t("Scheduled counts use reserved dates, dayparts and timezone. They do not account for creative readiness, overrides or downtime. Missing reports do not prove missed playback; a player report does not prove physical screen visibility.")}</p></div> : null}
      <p>{t("Player reports do not measure audience views. Manual declarations and demo records remain separate.")}</p>
    </>;
}
