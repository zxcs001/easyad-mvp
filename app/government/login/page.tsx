import Link from "next/link";
import { Building2, MapPinned, MonitorPlay, ShieldAlert } from "lucide-react";
import "../../component/auth.css";
import "../government.css";
import SecretInput from "../../component/secret-input";
import { safeLocalReturnPath } from "../../lib/auth";
import { getServerI18n } from "../../i18n/server";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return { title: t("Institution sign in — Civic Screen Operations"), description: t("Secure access for institutions, local government, and authorized platform administrators.") };
}

type GovernmentLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GovernmentLoginPage({ searchParams }: GovernmentLoginPageProps) {
  const { t } = await getServerI18n();
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const safeReturnTo = safeLocalReturnPath(returnTo, "/government") ?? "/government";

  return (
    <main className="government-auth-page">
      <section className="government-auth-context" aria-labelledby="government-login-title">
        <div className="government-auth-brand">
          <span className="government-auth-emblem"><Building2 aria-hidden="true" /></span>
          <div><small>{t("EasyAD Platform")}</small><strong>{t("Civic Screen Operations")}</strong></div>
        </div>
        <div className="government-auth-intro">
          <span className="government-auth-kicker"><span /> {t("Secure institution workspace")}</span>
          <h1 id="government-login-title">{t("Your public screen network, in one command centre.")}</h1>
          <p>{t("Coordinate screen publishing, content, fleet status, and authorized emergency overrides from a workspace built for institutions and local government.")}</p>
        </div>
        <div className="government-auth-capabilities" aria-label={t("Government workspace capabilities")}>
          <div><MapPinned aria-hidden="true" /><span><strong>{t("Fleet visibility")}</strong><small>{t("Locate and inspect institution-owned screens.")}</small></span></div>
          <div><MonitorPlay aria-hidden="true" /><span><strong>{t("Content control")}</strong><small>{t("Publish media and review representative output.")}</small></span></div>
          <div><ShieldAlert aria-hidden="true" /><span><strong>{t("Emergency override")}</strong><small>{t("Target authorized messages to selected screens.")}</small></span></div>
        </div>
        <p className="government-auth-boundary">{t("Screen overrides affect managed displays only. They do not issue alerts through Alert Ready or another official public-alert network.")}</p>
      </section>

      <section className="government-auth-form-panel" aria-labelledby="government-signin-heading">
        <div className="government-auth-form-copy">
          <span className="eyebrow">{t("Authorized access")}</span>
          <h2 id="government-signin-heading">{t("Sign in to Civic Screen Operations")}</h2>
          <p>{t("Use your Institution account credentials. Super Admin access is also supported.")}</p>
        </div>
        {error === "access" ? <div className="auth-error" role="alert">{t("This sign-in is reserved for Institution accounts and Super Admin.")}</div> : null}
        {error && error !== "access" ? <div className="auth-error" role="alert">{t("Invalid email or password.")}</div> : null}
        <form className="auth-form government-auth-form" action="/api/auth/login" method="post" noValidate>
          <input name="audience" type="hidden" value="government" />
          <input name="returnTo" type="hidden" value={safeReturnTo} />
          <label htmlFor="government-email">{t("Work email")}</label>
          <input autoComplete="username" id="government-email" name="email" type="email" required />
          <SecretInput autoComplete="current-password" label="Password" name="password" required />
          <button className="primary-button government-signin-button" type="submit">{t("Enter government workspace")}</button>
        </form>
        <div className="government-auth-help">
          <p>{t("Need an Institution account? Contact your EasyAD Platform Super Admin.")}</p>
          <div className="government-auth-help-links"><Link href="/government/about">{t("Review workspace details")}</Link><Link href="/login">{t("Use marketplace sign in instead")}</Link></div>
        </div>
      </section>
    </main>
  );
}
