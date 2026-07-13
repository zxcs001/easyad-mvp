# AWS Deployment Runbook

This application is designed to run as a stateless Next.js container on ECS Fargate with PostgreSQL in RDS and uploaded media in S3. Use `ca-central-1` unless data residency or latency requirements indicate another region.

## Runtime Architecture

- An internet-facing Application Load Balancer terminates TLS and forwards port 443 to the ECS service on port 3000.
- ECS Fargate tasks run in private application subnets and use the task IAM role to access one private S3 bucket.
- RDS PostgreSQL runs in private database subnets. Its security group accepts port 5432 only from the ECS task security group.
- Secrets Manager supplies `DATABASE_URL` and `BOOTSTRAP_ADMIN_TOKEN` to the task definition.
- CloudWatch receives container logs. The ALB health check path is `/api/health` with success code `200`.

## Required Environment

Set these values in the ECS task definition. Keep secrets in the task's `secrets` section, not plaintext environment values.

```text
NODE_ENV=production
APP_ORIGIN=https://portal.example.com
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/ooh_market
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_BASE64=<base64 AWS RDS CA bundle>
DATABASE_POOL_SIZE=5
DATABASE_CONNECTION_TIMEOUT_MS=10000
DATABASE_IDLE_TIMEOUT_MS=30000
MEDIA_STORAGE_PROVIDER=s3
MEDIA_BUCKET=easyad-production-media
MEDIA_KEY_PREFIX=production
AWS_REGION=ca-central-1
PUBLIC_API_BASE64_MAX_BYTES=20971520
BOOTSTRAP_ADMIN_TOKEN=<random secret>
```

With two application tasks, `DATABASE_POOL_SIZE=5` permits up to ten application connections. Recalculate this before increasing ECS desired count.

## S3 Task Policy

Block all public access on the bucket. Attach only this application policy to the ECS **task role**, replacing the bucket name and prefix:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::easyad-production-media/production/*"
  }]
}
```

The ECS execution role separately needs the standard ECR pull and CloudWatch logging permissions plus `secretsmanager:GetSecretValue` for the named application secrets.

## Build And Publish

```bash
AWS_REGION=ca-central-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPOSITORY=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/easyad-web

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker build -t easyad-web .
docker tag easyad-web:latest $REPOSITORY:$(git rev-parse --short HEAD)
docker push $REPOSITORY:$(git rev-parse --short HEAD)
```

Use the immutable commit tag in the ECS task definition. Do not deploy only `latest`.

## Database Migration

Before updating the service, run a one-off task using the new image, the production task role, networking, and secrets. Override its command with:

```text
node scripts/migrate.cjs
```

The migration is idempotent. Application startup retains a compatibility check, but the deployment pipeline should run the explicit task first.

## ECS Service

Start with `0.5 vCPU`, `1 GB` memory, and one task in staging. Production should use at least two tasks across two Availability Zones. Configure:

- Container port: `3000`
- Health check path: `/api/health`
- Health check grace period: `60` seconds
- Deployment minimum healthy percent: `100`
- Deployment maximum percent: `200`
- CloudWatch log retention: at least `30` days
- ECS deployment circuit breaker with rollback enabled

The application container runs as non-root user `nextjs` and contains a Docker health check.

## Release Sequence

1. Run `npm ci` and `npm run verify` in CI.
2. Build and push an image tagged with the commit SHA.
3. Register a new ECS task definition revision.
4. Run `node scripts/migrate.cjs` as a one-off ECS task and require exit code zero.
5. Update the ECS service and wait for service stability.
6. Request `/api/health`, log in, upload test media, and verify the public device API.
7. Roll back to the prior task definition if the smoke test fails.

Never run `npm run seed:test-data` in production. Create the first administrator with a temporary high-entropy `BOOTSTRAP_ADMIN_TOKEN`, then rotate or remove that secret after bootstrap.

## Operations

- Enable encrypted RDS storage, automated backups, deletion protection, and Multi-AZ for production.
- Alarm on ALB 5xx responses, unhealthy targets, ECS CPU/memory, task restarts, RDS storage, connections, and CPU.
- Enable S3 versioning and lifecycle cleanup for incomplete multipart uploads.
- Put AWS WAF managed rules and a rate-based rule in front of the ALB when the public launch begins.
- Test an RDS point-in-time restore and media recovery before launch.
