# Project status — 2026-11-19

## Confirmed
- Product: FOOTBALL INTELLIGENCE AI.
- Dashboard confirms API-SPORTS API-FOOTBALL, Pro, 7,500 requests/day; screenshot showed 670 used and 6,830 remaining.
- API v3 base URL: `https://v3.football.api-sports.io/`; authentication header: `x-apisports-key`.
- Cloudflare D1 database created: `football-intelligence-ai`.
- Region: Western Europe; jurisdiction None; read replication Disabled.
- Verified D1 database ID: `2619372a-e68f-4220-9b1f-f6fa087c6838`.
- Development branch: `football-intelligence-ai`; all work is isolated under `FOOTBALL_INTELLIGENCE_AI/`. Existing MONEYBALL production and its `moneyball-global-db` database are untouched.

## Completed
- Replaced wrong APIFootball.com connector with API-SPORTS v3 server-only client.
- Added status, countries, active leagues, seasons, fixtures, teams, standings, fixture statistics, odds, predictions, injuries and lineups methods.
- Added daily and per-minute rate-limit header capture and active-league default filter.
- Added unit tests for auth, status, leagues, quota headers and API errors (written, not yet executed).
- Added provider-neutral D1 schema migration, Worker health endpoint, sanitized provider-status endpoint and Worker unit tests (written, not yet executed).
- Selected Cloudflare Workers + D1 for first deployment.
- Updated `wrangler.toml` with the user's verified D1 database ID.\n- Added isolated `package.json` scripts for tests, typecheck, remote D1 migration list/apply and deployment; added strict TypeScript configuration and ignored local Worker artifacts.
- Updated README, architecture, data model, deployment decision, provider integration, roadmap and status.

## Not yet verified / blocked
- API key has not been configured or used; no live API request has been made.
- D1 database exists, but migration has not yet been applied; no tables have been created.
- Worker has not been deployed or bound to this D1 instance. Git-connected build setup and Cloudflare deployment credentials are still required.
- Tests, lint, typecheck and build have not been executed in CI or local checkout.
- Actual per-minute quota and competition/season coverage still require authenticated calls.

## CI and deployment preparation
- Added a GitHub Actions workflow scoped to the `football-intelligence-ai` branch and `FOOTBALL_INTELLIGENCE_AI/**`; it runs TypeScript typecheck and Vitest unit tests without deploying.
- Fixed a test assertion that incorrectly expected the fixture request to have no query parameters; it now checks that API credentials are absent from the URL.
- CI status for the workflow commit had not yet appeared when checked; tests are therefore still unverified.
- Added `docs/CLOUDFLARE_DEPLOYMENT.md` with the exact isolated Worker setup: repository `moneyball-global-web`, branch `football-intelligence-ai`, root directory `FOOTBALL_INTELLIGENCE_AI`, Worker name `football-intelligence-ai-api`.
- Corrected D1 migration scripts to target the configured `DB` binding, as recommended for Workers Builds.
- User has returned to the Workers & Pages overview; no Worker was created or deployed from the setup wizard.

## Provider discovery ingestion — 2026-11-19
- Implemented a protected `POST /api/discovery/refresh` endpoint.
- The endpoint checks a separate `INGESTION_TOKEN` before making provider calls.
- It checks the provider subscription and daily quota first, persists a sanitized account/usage snapshot, and stops if the subscription is inactive or fewer than 100 daily requests remain.
- It fetches countries and active leagues, stores immutable raw payloads with SHA-256 hashes, and upserts normalized countries, competitions and competition seasons into D1.
- Each run is recorded in `ingestion_jobs`; errors are recorded without returning provider payloads.
- Country normalization uses the provider country code/name because the API-SPORTS countries endpoint does not guarantee a numeric country ID.
- Added Worker route tests for health, D1 failure, missing provider secret and method validation. CI has not yet been observed to complete; no runtime or live-provider test is claimed.
- Added deployment instructions for the separate ingestion secret and protected refresh route.
- Added protected `POST /api/fixtures/refresh?date=YYYY-MM-DD` for one-day fixture ingestion. It checks the same daily quota reserve, stores the raw response, normalizes teams/competitions/seasons and idempotently upserts fixtures and scores/status.
- Added input-validation coverage for fixture date requests. This remains unverified by an executed CI run and has not yet been tested against the live provider or D1.

## Fixture enrichment — 2026-11-19
- Added D1 migration `0002_fixture_enrichment.sql` for lineups and injury snapshots.
- Added protected `POST /api/fixtures/enrich?fixture=<provider-fixture-id>`: preflights the daily quota, fetches statistics, lineups and fixture-linked injury data, stores raw provider payloads and normalized records, and writes an enrichment job ledger entry.
- Added route tests for missing authorization and invalid fixture IDs. No test run or live API/D1 verification is claimed.
- Updated the deployment guide with the safe one-fixture-at-a-time enrichment procedure; this is intentionally not a bulk loop until per-minute quotas and actual coverage are observed.

## Baseline prediction engine — 2026-11-19
- Added D1 migration `0003_model_predictions.sql` for model versions and auditable forecast snapshots.
- Implemented a first independent Poisson score-grid model. It uses each team's latest 10 completed matches with kickoff strictly earlier than the target match, so future results are excluded.
- Derives 1X2, Double Chance (1X/X2/12), Over/Under 2.5 and BTTS probabilities from the same score matrix.
- Stores expected goals (lambda), sample counts, feature cutoff, model version and explanation metadata.
- Prediction generation is protected by `INGESTION_TOKEN`, limited to 50 upcoming fixtures per date, and writes an ingestion ledger entry.
- Extended `GET /api/fixtures?date=YYYY-MM-DD` to return the latest stored probabilities with each fixture.
- Added route validation/auth tests. Model quality is not yet established: no historical backtest, calibration or live D1 execution has been run. Do not interpret these baseline probabilities as verified betting edges.

- Added read-only `GET /api/fixtures?date=YYYY-MM-DD` with a bounded result count and latest stored prediction fields for the dashboard.
- Corrected kickoff persistence to canonical UTC and date filtering to Europe/Brussels local-day boundaries, including daylight-saving transitions; added a boundary test for 19 November 2026.
- Added D1 migration `0003_model_predictions.sql` for versioned model outputs and auditable forecast snapshots.
- Implemented baseline independent-Poisson forecasts for 1X2, derived Double Chance, Over/Under 2.5 and BTTS. The model uses up to the latest 10 completed team matches strictly before kickoff and stores its feature cutoff and sample counts.
- Added protected prediction generation endpoint `POST /api/predictions/generate?date=YYYY-MM-DD`, capped at 50 upcoming fixtures per run.
- Model is experimental only. No backtest, calibration, live D1 execution or CI success is yet verified.

## Forecast evaluation — 2026-11-19
- Added D1 migration `0004_prediction_evaluation.sql` to retain proper scoring-rule results.
- Added protected `POST /api/predictions/evaluate?date=YYYY-MM-DD`: matches completed on the requested Brussels-local date are compared with the latest saved pre-match prediction; stores multiclass 1X2 Brier score, log loss, Over 2.5 Brier and BTTS Brier. Re-evaluation updates the same record rather than duplicating it.
- Added an authorization test and deployment instructions for the evaluation step. No actual settled fixture evaluation has been run because the Worker/D1 deployment is still pending.

## First dashboard shell — 2026-11-19
- Added responsive Polish read-only dashboard at `/`: date selector, match count, finished count, predictions count, local kickoff times, results and model probabilities. It reads only the public daily fixtures endpoint; ingestion credentials are never exposed in browser code.
- Added a Worker test for the dashboard shell and updated deployment verification instructions. UI is ready for first deployment, but no live dashboard URL exists until the Worker is created.

## Odds snapshot ingestion — 2026-11-19
- Added protected `POST /api/fixtures/odds?fixture=<provider-fixture-id>` to fetch one fixture's bookmaker markets/selections and append odds snapshots, retaining the raw source payload. It preflights the subscription/quota and records no-odds responses without fabricating prices.
- Added an authorization test and deployment notes. Actual odds entitlement and market coverage remain unverified until a live provider call can be made.

- Added read-only `GET /api/models/performance` to aggregate evaluated sample counts and mean Brier/log-loss metrics by model version; added route test.
- Hardened dashboard rendering by escaping provider-controlled team/competition text and made malformed kickoff timestamps non-fatal.

## Next steps
1. Create the isolated Worker from the documented repository/branch/root settings; do not select a legacy MONEYBALL Worker.
2. Add `API_FOOTBALL_API_KEY` and a separate random `INGESTION_TOKEN` as runtime Worker secrets.
3. Verify that the existing D1 database is bound as `DB`, then apply the initial migration.
4. Deploy to a preview URL and verify `/health` and `/api/provider/status`.
5. Run protected discovery refresh, inspect actual country/league coverage, then ingest a single date of fixtures.
6. Add scheduled incremental fixture refresh and result reconciliation after live D1 tests pass.
7. Backtest and calibrate the Poisson baseline with historical seasons before relying on forecasts.
8. Expand statistics, injuries, lineups and odds only where provider coverage confirms availability.
9. Run and verify CI before any public production deployment.

## Safety
- Never expose API keys to browser code or logs.
- Do not touch the existing MONEYBALL app or its database.
- Respect provider and D1 quotas; cache and deduplicate calls.
- Missing data remains missing; never fabricate.
- No automatic real-money betting.

## Cloudflare first connected deployment setup — 2026-11-19
- Created the isolated Cloudflare Worker `football-intelligence-ai-api` from repository `damianwalus3-jpg/moneyball-global-web`.
- Saved Workers Builds settings: production branch `football-intelligence-ai`, root directory `FOOTBALL_INTELLIGENCE_AI`, empty build command, deploy command `npm run deploy`.
- Added runtime secrets `API_FOOTBALL_API_KEY` and `INGESTION_TOKEN`; secret values are intentionally not recorded here.
- Added the production D1 binding `DB` to database `football-intelligence-ai` (ID `2619372a-e68f-4220-9b1f-f6fa087c6838`).
- Enabled the production `workers.dev` URL.
- Initial URL check returned the default text `Hello world`, not the application's expected dashboard or `/health` JSON. Therefore the application code is NOT yet confirmed deployed and the health check has NOT passed.
- The Cloudflare Deployments page showed an earlier failed build associated with branch `main`; the later Ready entries were dashboard configuration deployments. A fresh Git-connected build from `football-intelligence-ai` must be observed and verified before claiming the app is live.
- This status-only commit is intended to trigger a new Git-connected Workers Build using the saved branch/root settings. Verify the build source branch/commit, remote D1 migrations, deployment result, `/` dashboard, `/health` and `/api/provider/status` before any data ingestion.

## Cloudflare deployment follow-up — 2026-11-19
- User configured Worker `football-intelligence-ai-api`, production secrets `API_FOOTBALL_API_KEY` and `INGESTION_TOKEN`, production D1 binding `DB`, and workers.dev URL.
- Worker URL still returned the default `Hello world` response during manual verification. This does not verify the application worker code.
- The Cloudflare deployment history shown by the user contained Dashboard configuration deployments and an earlier failed Git build on `main`; no successful Git-connected build from `football-intelligence-ai` has been confirmed.
- Next required action: trigger and verify a Git-connected build from branch `football-intelligence-ai` with root directory `FOOTBALL_INTELLIGENCE_AI`; inspect exact build logs if it fails. Do not change production MONEYBALL resources.

## Build repair and verification — 2026-11-19
- Fixed npm dependency installation for CI/Workers Builds by setting shallow install strategy and legacy peer dependency handling in `.npmrc`, and applying the same flags in the isolated CI job.
- Fixed invalid escaped template-literal delimiters in `src/worker/index.ts` that prevented TypeScript parsing.
- Fixed 14 date-validation regexes that incorrectly matched literal backslash-d characters instead of digits.
- Added a project-local Node Vitest config so the root MONEYBALL web app's Vite/React config is not loaded by this isolated project.
- Updated the daily fixture-list test to assert the intended Brussels-local UTC interval and 250-row cap.
- GitHub Actions run `44587426377` on commit `38ba2e64fba40a5055cc20ea1c1db3f24d8bb7ac`: dependency install PASSED, TypeScript typecheck PASSED, all 24 unit tests PASSED.
- Live Cloudflare verification immediately after the green CI still returned `Hello world` at both `/` and `/health`. This means Cloudflare has not yet been confirmed to deploy the application bundle. No API provider calls or fixture ingestion have been run.
- Next: verify a new Git-connected Cloudflare build from `football-intelligence-ai` with root `FOOTBALL_INTELLIGENCE_AI`; then confirm `/health` returns JSON and `/api/provider/status` reports sanitized Pro subscription/quota. Do not start discovery until those checks pass.
