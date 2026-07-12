import "../component/auth.css";
import Link from "next/link";
import { Brand } from "../component/shared-ui";
import { countUsers } from "../lib/db";

type SignupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const firstUser = await countUsers() === 0;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand subtitle="New tenant onboarding" portal />
        <div className="auth-copy">
          <span className="eyebrow">Sign up portal</span>
          <h1>Create account</h1>
          <p>Public signup creates advertiser accounts. Institutional operators are provisioned by their institution.</p>
        </div>
        {error ? <div className="auth-error">{error === "setup" ? "Initial super-admin setup requires the configured bootstrap token." : "Unable to create the account. Use a strong password with at least 10 characters, letters, and numbers."}</div> : null}
        <form className="auth-form" action="/api/auth/signup" method="post">
          <label>Name<input name="name" type="text" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" minLength={10} required /></label>
          {firstUser ? <label>Bootstrap token<input name="bootstrapToken" type="password" required /></label> : null}
          <button className="primary-button" type="submit">Create account</button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
