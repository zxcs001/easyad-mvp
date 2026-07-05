import Link from "next/link";
import { Brand } from "../component/shared-ui";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand subtitle="Secure marketplace access" portal />
        <div className="auth-copy">
          <span className="eyebrow">Sign in portal</span>
          <h1>Welcome back</h1>
          <p>Use a role account to manage inventory, buy media, or operate the platform.</p>
        </div>
        {error ? <div className="auth-error">Invalid email or password.</div> : null}
        <form className="auth-form" action="/api/auth/login" method="post">
          <input name="returnTo" type="hidden" value={returnTo && returnTo.startsWith("/") ? returnTo : "/"} />
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" required /></label>
          <button className="primary-button" type="submit">Sign in</button>
        </form>
        <p className="auth-switch">Need an account? <Link href="/signup">Create one</Link></p>
      </section>
    </main>
  );
}
