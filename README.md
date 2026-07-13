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

Seed the temporary role accounts and operator-owned Thunder Bay devices for local testing:

```bash
npm run seed:test-data
```

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

## Public Device Media API

Published devices expose a read-only, CORS-enabled API for third-party integrations. Only operator media on an approved device and approved advertiser creative whose campaign is currently active are returned.

List the currently visible media and totals for a device:

```text
GET /api/public/devices/INV-101/media
```

Access the first currently visible item or use the stable media ID returned by the list endpoint:

```text
GET /api/public/devices/INV-101/media/1
GET /api/public/devices/INV-101/media/CRV-123
```

Image detail responses contain Base64 data. Video detail responses contain a public streaming URL. Append `?encoding=url` to an image detail request when a URL is preferred. Base64 responses default to a 20 MB limit, configurable with `PUBLIC_API_BASE64_MAX_BYTES` up to the platform's 50 MB upload limit.

## Production Notes

The production target is a stateless Next.js container on ECS Fargate, RDS PostgreSQL, and private S3 media storage. See [the AWS deployment runbook](docs/AWS_DEPLOYMENT.md) for the complete build, IAM, migration, health-check, and release procedure.

Run the idempotent schema migration before each ECS service deployment:

```bash
npm run db:migrate
```

Set these environment variables in your hosting platform:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
DATABASE_SSL=true
DATABASE_POOL_SIZE=10
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_BASE64=<base64-rds-ca-bundle>
BOOTSTRAP_ADMIN_TOKEN=<strong-secret>
APP_ORIGIN=https://your-public-domain.example
PUBLIC_API_BASE64_MAX_BYTES=20971520
MEDIA_STORAGE_PROVIDER=s3
MEDIA_BUCKET=<private-s3-bucket>
MEDIA_KEY_PREFIX=production
AWS_REGION=ca-central-1
```

The application retains a startup schema check, but production releases should run the explicit migration first. Local development uses `.data/uploads`; S3 is required for durable media across multiple Fargate tasks.
