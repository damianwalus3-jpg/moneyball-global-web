# Project status — 2026-11-19

## Confirmed
- Product: FOOTBALL INTELLIGENCE AI.
- Dashboard confirms API-SPORTS API-FOOTBALL, Pro, 7,500 requests/day; screenshot showed 670 used and 6,830 remaining.
- API v3 base URL: `https://v3.football.api-sports.io/`; authentication header: `x-apisports-key`.
- Development branch: `football-intelligence-ai`; all work is isolated under `FOOTBALL_INTELLIGENCE_AI/`. Existing MONEYBALL production is untouched.

## Completed in this pass
- Replaced the wrong APIFootball.com connector with an API-SPORTS v3 server-only client.
- Added status, countries, active leagues, seasons, fixtures, teams, standings, fixture statistics, odds, predictions, injuries and lineups methods.
- Added daily and per-minute rate-limit header capture and active-league default filter.
- Added unit tests for auth, status, leagues, quota headers and API errors (written, not yet executed).
- Updated README, provider integration, architecture, roadmap and project status.
- Added initial provider-neutral PostgreSQL schema for account quota snapshots, countries, competitions, seasons, teams, fixtures, immutable raw payloads, statistics, odds snapshots and ingestion jobs.
- Added a data-model document.\n- Selected Cloudflare Workers + D1 for the first low-cost deployment, based on current free-tier limits and the user's existing Cloudflare workflow.\n- Added `wrangler.toml`, Worker health and sanitized provider-status endpoints, plus Worker unit tests (written, not run).\n- Converted the initial migration to Cloudflare D1 SQLite and validated its syntax locally with SQLite 3.46.1 in-memory. The migration has not been applied to a live D1 database.

## Not yet verified / blocked
- No API key has been configured or used. No live API request has been made.
- Per-minute quota and actual competition/season coverage still require authenticated calls.
- Tests, lint, typecheck and build have not been executed in a local checkout or CI.
- SQL migration syntax is locally validated, but it has not been applied to a live D1 database. D1 database creation and its ID, Worker secret configuration, scheduler implementation and deployment remain pending.
- The project is not deployed. Do not deploy the containing legacy MONEYBALL app.

## Next sequence
1. Select a separate database and server runtime with server-side secrets and scheduled jobs.
2. Configure `API_FOOTBALL_API_KEY` securely in that runtime; never send it through chat or commit it.
3. Run `/status` (free of daily quota per provider docs), then countries, active leagues and a small fixture request.
4. Execute migrations and persist actual account quota and per-league/season coverage.
5. Build cached, idempotent, quota-aware ingestion and a job ledger.
6. Add/run CI: tests, lint, typecheck and build.
7. Build historical features and baseline predictions only after source coverage and timestamp integrity are verified.

## Safety and quality
- Never expose API keys to browser code or logs.
- Respect daily and per-minute limits; cache and deduplicate requests.
- Keep provider predictions separate from our model.
- Timestamp every prediction and evaluate against final results.
- Missing data stays missing; never fabricate.
- No automatic real-money betting.
