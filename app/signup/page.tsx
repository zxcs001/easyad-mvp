import "../component/auth.css";
import Link from "next/link";
import { Brand } from "../component/shared-ui";
import SecretInput from "../component/secret-input";
import { countUsers } from "../lib/db";
import { getServerI18n } from "../i18n/server";

type SignupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { t } = await getServerI18n();
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const firstUser = await countUsers() === 0;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand subtitle="New tenant onboarding" portal />
        <div className="auth-copy">
          <span className="eyebrow">{t("Sign up portal")}</span>
          <h1>{t("Create account")}</h1>
          <p>{t("Public signup creates advertiser accounts. Institution accounts and their operators are provisioned by a Super Admin.")}</p>
        </div>
        {error ? <div className="auth-error">{t(error === "setup" ? "Initial super-admin setup requires the configured bootstrap token." : "Unable to create the account. Use a strong password with at least 10 characters, letters, and numbers.")}</div> : null}
        <form className="auth-form" action="/api/auth/signup" method="post" noValidate>
          <label>{t("Name")}<input name="name" type="text" required /></label>
          <label>{t("Email")}<input name="email" type="email" required /></label>
          <SecretInput autoComplete="new-password" label="Password" minLength={10} name="password" required />
          {firstUser ? <SecretInput autoComplete="off" label="Bootstrap token" name="bootstrapToken" required secretName="bootstrap token" /> : null}
          <button className="primary-button" type="submit">{t("Create account")}</button>
        </form>
        <p className="auth-switch">{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></p>
      </section>
    </main>
  );
}
