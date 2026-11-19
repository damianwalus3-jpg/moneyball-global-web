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
