# Azure continuous deployment

The GitHub workflow `.github/workflows/deploy-azure.yml` verifies pull requests and pushes to `main` with Node 22, PostgreSQL 16, the test suite, a production build, and TypeScript. Successful pushes to `main` build and push a commit-tagged image and update `easyad-web` in `biblia-llm-rg`. Manual runs deploy only when main is selected.

The existing registry is `bibliaprod2acrsnan4juouezei.azurecr.io`. Azure runs the app in Single revision mode, moving traffic when the new revision is ready. The workflow waits for that specific revision and checks `/api/health`; a failed check fails the run. It does not automatically roll back a revision that has already received traffic.

Authentication uses the dedicated `easyad-github-deployer` managed identity, with GitHub OIDC trust restricted to `repo:zxcs001/easyad-mvp:ref:refs/heads/main`. Its roles are AcrPush on the shared registry and Container Apps Contributor on EasyAD only. IDs in the workflow are public identifiers; no GitHub Azure password or client secret is needed. BibleLLM's apps and deployment identity are unaffected.

Container environment variables, secrets, volumes, and registry pull identity remain configured in Azure. This pipeline updates the image only. Schema changes requiring a separate migration must be applied using `scripts/migrate.cjs` against the production database before releasing dependent code; this workflow does not run production migrations.

To roll back, use Azure Container Apps to deploy the previous successful commit's `easyad-web:<commit>` image. GitHub Actions must be enabled and this workflow must be merged into `main` for automatic deployment to start.

Reference: https://learn.microsoft.com/en-us/azure/container-apps/github-actions
