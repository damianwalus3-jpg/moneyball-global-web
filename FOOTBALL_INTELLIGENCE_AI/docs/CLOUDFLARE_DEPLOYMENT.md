# Cloudflare Workers deployment guide

This guide deploys only the isolated FOOTBALL INTELLIGENCE AI Worker. It must not modify or deploy the legacy MONEYBALL application.

## Existing resources

- GitHub repository: `damianwalus3-jpg/moneyball-global-web`
- Git branch: `football-intelligence-ai`
- Cloudflare Workers root directory: `FOOTBALL_INTELLIGENCE_AI`
- Worker name (must match `wrangler.toml`): `football-intelligence-ai-api`
- D1 binding: `DB`
- D1 database name: `football-intelligence-ai`
- D1 database ID: `2619372a-e68f-4220-9b1f-f6fa087c6838`
- D1 region selected in the dashboard: Western Europe

## Create the Worker from the Cloudflare dashboard

1. Open **Workers & Pages** and choose **Create application**.
2. Choose the GitHub repository `moneyball-global-web`.
3. In the project setup, use the Worker name `football-intelligence-ai-api`.
4. In **Advanced settings → Path / Root directory**, enter exactly `FOOTBALL_INTELLIGENCE_AI`.
5. In the connected build settings, select branch `football-intelligence-ai`. Do not select `main` or a MONEYBALL deployment branch.
6. Leave **Build command** empty; this Worker has no separate frontend build step.
7. Set **Deploy command** to `npm run deploy`. The script applies the D1 migration using the `DB` binding and then deploys the Worker.
8. Cloudflare may create a dedicated Workers Builds API token. This is a deployment credential, not the football data API key. A dedicated token is preferred over reusing credentials from another Worker.
9. Do not put `API_FOOTBALL_API_KEY` in build-time variables. Build-time values are not runtime Worker secrets.

If the dashboard form does not expose the branch or root directory at this stage, finish only the non-deploying setup steps and configure **Settings → Builds** before the first production deployment. Confirm the repository, branch, root directory and Worker name first.

## Runtime provider secret

After the Worker exists, open **Settings → Variables and Secrets** for this Worker and add a secret:

- Name: `API_FOOTBALL_API_KEY`
- Value: the private API-SPORTS API-FOOTBALL key from the provider dashboard

Paste the value directly into Cloudflare. Never send it in chat, commit it to Git, put it in a `VITE_` variable, or add it as a build variable. The Worker reads it only on the server.

## First verification

After a successful deployment:

1. Open `https://football-intelligence-ai-api.<your-workers-subdomain>.workers.dev/health`. Expect HTTP 200 and `{"status":"ok","database":true,...}`.
2. Open `/api/provider/status`. If the secret is not configured, expect a safe 503 response. After adding the secret, expect sanitized subscription and quota metadata.
3. Confirm D1 now contains the initial schema tables.
4. Only then begin provider coverage discovery.

## Stop conditions

- If Cloudflare proposes the root directory `/`, do not deploy.
- If the Worker name differs from `football-intelligence-ai-api`, stop and correct it.
- If the selected branch is not `football-intelligence-ai`, stop.
- Do not select or overwrite `moneyball-global`, `moneyball-global-rebuild`, or `moneyball-global-test`.
- Do not run a deployment until the four values (repository, branch, root directory, Worker name) have been checked.

## Current verification status

The repository configuration and D1 ID are recorded. The live Worker, runtime secret, remote migration, tests and health endpoint have not yet been verified. A successful GitHub commit is not proof of a successful Cloudflare deployment.
