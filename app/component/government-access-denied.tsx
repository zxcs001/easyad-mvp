import "../government/government.css";
import { LockKeyhole } from "lucide-react";
import type { Role } from "../data";
import { roleLabel } from "../roles";
import { getServerI18n } from "../i18n/server";

export default async function GovernmentAccessDenied({ currentRole }: { currentRole: Role }) {
  const { t } = await getServerI18n();
  return (
    <main className="government-denied-page">
      <section className="government-denied-panel" aria-labelledby="government-denied-title">
        <span className="government-denied-icon"><LockKeyhole aria-hidden="true" /></span>
        <span className="eyebrow">{t("Access restricted")}</span>
        <h1 id="government-denied-title">{t("This workspace requires an Institution account.")}</h1>
        <p>{t("You are signed in as {role}. Civic Screen Operations is available to Institution accounts and Super Admin.", { role: t(roleLabel(currentRole)) })}</p>
        <div className="government-denied-actions">
          <a className="primary-button" href="/">{t("Return to EasyAD Platform")}</a>
          <form action="/api/auth/logout" method="post" noValidate>
            <input name="returnTo" type="hidden" value="/government/login" />
            <button className="ghost-button" type="submit">{t("Use another account")}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
