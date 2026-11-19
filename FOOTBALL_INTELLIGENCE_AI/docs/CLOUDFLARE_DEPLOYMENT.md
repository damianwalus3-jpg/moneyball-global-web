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
- Name: `INGESTION_TOKEN`
- Value: generate a separate long random secret used only to authorize manual data refreshes

Paste both values directly into Cloudflare. Never send them in chat, commit them to Git, put them in a `VITE_` variable, or add them as build variables. The Worker reads them only on the server.

## First verification

After a successful deployment:

1. Open `https://football-intelligence-ai-api.<your-workers-subdomain>.workers.dev/` for the read-only Polish dashboard.
2. Open `https://football-intelligence-ai-api.<your-workers-subdomain>.workers.dev/health`. Expect HTTP 200 and `{"status":"ok","database":true,...}`.
3. Open `/api/provider/status`. If the secret is not configured, expect a safe 503 response. After adding the secret, expect sanitized subscription and quota metadata.
4. Confirm D1 now contains the initial schema tables.
5. Call `POST /api/discovery/refresh` with `Authorization: Bearer <INGESTION_TOKEN>` to fetch and persist the provider's countries, active leagues and season coverage. This endpoint is intentionally protected because each refresh consumes provider quota.
6. Confirm the discovery response reports counts and the quota reserve.
7. Refresh a single match date with `POST /api/fixtures/refresh?date=YYYY-MM-DD` and the same bearer token. The endpoint stores raw fixture payloads and upserts teams, competitions, seasons and fixtures.
8. Enrich one saved fixture with `POST /api/fixtures/enrich?fixture=<API-SPORTS-fixture-id>` and the same bearer token. This uses three provider requests (statistics, lineups and fixture-linked injuries), stores raw snapshots and normalized records, and should be run one fixture at a time until observed quota/latency are confirmed.
9. Capture odds for one fixture with `POST /api/fixtures/odds?fixture=<API-SPORTS-fixture-id>`. This stores bookmaker/market/selection price snapshots if the subscription returns odds. An empty response is recorded as no odds; it is not treated as a zero price.
10. Only after validating enrichment and odds entitlement should these calls be placed into a paced scheduled queue. Odds availability, market breadth and retention differ by league.
11. Generate baseline forecasts with `POST /api/predictions/generate?date=YYYY-MM-DD` and the same bearer token. It uses only completed matches whose kickoff is earlier than each target fixture, limits each team to its latest 10 completed matches, stores the feature cutoff and model version, and caps each run at 50 fixtures.
12. Read daily fixtures and their latest forecast probabilities from `GET /api/fixtures?date=YYYY-MM-DD`. Probabilities are a transparent baseline, not betting advice or guaranteed outcomes.
13. After the results refresh updates final scores/statuses, run `POST /api/predictions/evaluate?date=YYYY-MM-DD` with the bearer token. This records Brier scores and log loss for forecasts with completed results, enabling later calibration and model comparison.

## Stop conditions

- If Cloudflare proposes the root directory `/`, do not deploy.
- If the Worker name differs from `football-intelligence-ai-api`, stop and correct it.
- If the selected branch is not `football-intelligence-ai`, stop.
- Do not select or overwrite `moneyball-global`, `moneyball-global-rebuild`, or `moneyball-global-test`.
- Do not run a deployment until the four values (repository, branch, root directory, Worker name) have been checked.

## Current verification status

The repository configuration and D1 ID are recorded. The live Worker, runtime secret, remote migration, tests and health endpoint have not yet been verified. A successful GitHub commit is not proof of a successful Cloudflare deployment.
