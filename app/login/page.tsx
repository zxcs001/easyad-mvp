import "../component/auth.css";
import Link from "next/link";
import { Brand } from "../component/shared-ui";
import SecretInput from "../component/secret-input";
import { safeLocalReturnPath } from "../lib/auth";
import { getServerI18n } from "../i18n/server";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { t } = await getServerI18n();
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand subtitle="Secure marketplace access" portal />
        <div className="auth-copy">
          <span className="eyebrow">{t("Sign in portal")}</span>
          <h1>{t("Welcome back")}</h1>
          <p>{t("Use a role account to manage inventory, buy media, or operate the platform.")}</p>
        </div>
        {error ? <div className="auth-error">{t("Invalid email or password.")}</div> : null}
        <form className="auth-form" action="/api/auth/login" method="post" noValidate>
          <input name="returnTo" type="hidden" value={safeLocalReturnPath(returnTo) ?? ""} />
          <label>{t("Email")}<input name="email" type="email" required /></label>
          <SecretInput autoComplete="current-password" label="Password" name="password" required />
          <button className="primary-button" type="submit">{t("Sign in")}</button>
        </form>
        <p className="auth-switch">{t("Need an account?")} <Link href="/signup">{t("Create one")}</Link></p>
      </section>
    </main>
  );
}
