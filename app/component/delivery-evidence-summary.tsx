"use client";
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
      {reconciliation.length ? <p>{t("Unreported allocation is unknown delivery, not proven missed playback. Download the report for placement details.")}</p> : null}
      <p>{t("Player reports do not measure audience views. Manual declarations and demo records remain separate.")}</p>
    </>;
}
