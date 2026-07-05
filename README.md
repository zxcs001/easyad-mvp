# OOH Market MVP

Next.js MVP for a multi-tenant out-of-home advertising marketplace.

## Local PostgreSQL Database

The app now uses PostgreSQL through `pg`. It reads `DATABASE_URL` first, then `POSTGRES_URL`, and falls back to:

```text
postgres://postgres:postgres@localhost:5432/ooh_market
```

For local development, install dependencies and run the project initializer:

```bash
npm run init
npm run dev
```

`npm run init` installs dependencies, copies `.env.example` to `.env.local` when needed, starts the bundled PostgreSQL service with Docker Compose, and waits until the configured databases are reachable.

The local compose setup creates:

- `ooh_market` for the app
- `ooh_market_test` for integration tests

Run the PostgreSQL integration test with:

```bash
set TEST_DATABASE_URL=postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test
npm test -- --run tests/db.test.ts
```

Run end-to-end tests against the same PostgreSQL database with:

```bash
set TEST_DATABASE_URL=postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test
npm run test:e2e
```

Playwright starts the app on port `3100` so it does not collide with a normal dev server on port `3000`.

On macOS/Linux, use `export TEST_DATABASE_URL=...` instead of `set`.

## Production Notes

Set these environment variables in your hosting platform:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
DATABASE_SSL=true
DATABASE_POOL_SIZE=10
BOOTSTRAP_ADMIN_TOKEN=<strong-secret>
```

The schema is created lazily on first database access. Use a managed PostgreSQL database such as Amazon RDS for production.
