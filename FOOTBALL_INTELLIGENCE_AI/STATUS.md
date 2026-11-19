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

## Next steps
1. Add `API_FOOTBALL_API_KEY` as a Cloudflare Worker secret; never paste it in chat or commit it.
2. Create/confirm the Worker project and bind D1 using the configured `wrangler.toml`.
3. Apply `db/migrations/0001_initial_schema.sql` to the new D1 database.
4. Deploy to a non-production preview URL and test `/health`.
5. Test `/api/provider/status`; persist sanitized plan/quota snapshot.
6. Fetch countries, current leagues and a small fixture date window; persist actual coverage.
7. Add quota-aware scheduled ingestion and test idempotency.
8. Run full CI before considering any public production deployment.

## Safety
- Never expose API keys to browser code or logs.
- Do not touch the existing MONEYBALL app or its database.
- Respect provider and D1 quotas; cache and deduplicate calls.
- Missing data remains missing; never fabricate.
- No automatic real-money betting.
