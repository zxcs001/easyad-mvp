# Azure deployment

EasyAD runs as a Linux container in Azure Container Apps, with PostgreSQL and a persistent Azure Files share mounted at `/app/.data/uploads`. Each Azure account needs its own environment, registry, database, storage, and deployment identity.

## Account configuration

The GitHub workflow `.github/workflows/deploy-azure.yml` reads these repository settings under **Settings → Secrets and variables → Actions**. Account identifiers are stored as secrets so GitHub masks them in job logs:

| Setting | Storage | Value |
| --- | --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Secret | Target subscription ID |
| `AZURE_TENANT_ID` | Secret | Target Microsoft Entra tenant ID |
| `AZURE_CLIENT_ID` | Secret | Client ID of the GitHub deployment managed identity |
| `AZURE_RESOURCE_GROUP` | Variable | Resource group containing the EasyAD app |
| `AZURE_APP_NAME` | Variable | Container App and container name, normally `easyad-web` |
| `AZURE_REGISTRY` | Variable | Container registry name, without `.azurecr.io` |

All six settings are required. Missing configuration fails before Azure login. The workflow does not fall back to the previous account. Keep credentials and account details in ignored local files; do not add them to the workflow or this runbook.

Configure the deployment identity's GitHub OIDC trust with issuer `https://token.actions.githubusercontent.com`, subject `repo:<owner>/<repository>:ref:refs/heads/main`, and audience `api://AzureADTokenExchange`. Grant AcrPush on the target registry and Container Apps Contributor on the target EasyAD app. Configure a separate app pull identity with AcrPull on that registry. No Azure password or client secret is needed in GitHub.

For a new account, sign in using `az login --tenant <tenant-id> --subscription <subscription-id> --skip-subscription-discovery`, then confirm the email and subscription with `az account show`. If using an isolated CLI session, keep the same `AZURE_CONFIG_DIR` for subsequent commands.

## Fresh deployment

Provision an empty PostgreSQL database and a dedicated Azure Files share. Supply `DATABASE_URL` and `BOOTSTRAP_ADMIN_TOKEN` through Container Apps secrets. Enable verified PostgreSQL TLS with `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. Set `MEDIA_STORAGE_PROVIDER=local`, mount the file share at `/app/.data/uploads`, and ensure the container user (UID/GID 1001) can write to it. Set `APP_ORIGIN` to the new public HTTPS URL.

Use external HTTPS ingress on container port 3000, Single revision mode, and `/api/health` for readiness. Payment collection remains disabled. Configure other feature flags deliberately for the new environment. A fresh deployment creates no demo accounts, inventory, or media unless separately requested.

Run `node scripts/migrate.cjs` from the deployment image against the new database before releasing the app. The image includes the migration script and schema. Create the first administrator through the signup flow using the bootstrap token; keep that token private.

## Continuous deployment and rollback

The workflow verifies pull requests and pushes to `main` with Node 22, PostgreSQL 16, the test suite, a production build, and TypeScript. Successful pushes to `main` build and push a commit-tagged `easyad-web` image and update the configured app. Manual runs deploy only when main is selected.

Azure runs the app in Single revision mode, moving traffic when the new revision is ready. The workflow waits for that specific revision and checks `/api/health`; a failed check fails the run. It does not automatically roll back a revision that has already received traffic.

Container environment variables, secrets, volumes, and registry pull identity remain configured in Azure. This pipeline updates the image only. Apply schema changes requiring a separate migration with `scripts/migrate.cjs` against the production database before releasing dependent code; the workflow does not run production migrations.

The rollout uses the Azure Resource Manager API through `az rest`, preserving the current container template while changing the named container's image and revision suffix. This avoids the Container Apps CLI's global provider-registration wait when the target region is already registered. It checks the exact revision's health and readiness before the public health check.

To roll back, deploy the previous successful commit's `easyad-web:<commit>` image. GitHub Actions must be enabled and the workflow changes must be published to `main` for the new account configuration to take effect.

References: [GitHub Actions deployment](https://learn.microsoft.com/en-us/azure/container-apps/github-actions), [managed identity image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull), [persistent Azure Files storage](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts-azure-files).
