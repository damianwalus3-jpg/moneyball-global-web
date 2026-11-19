# FOOTBALL INTELLIGENCE AI

A cleanly isolated football analytics application, developed on the `football-intelligence-ai` branch. The existing MONEYBALL production application is not modified.

## Product goals
- Discover fixtures across competitions actually covered by the provider subscription.
- Ingest API-SPORTS API-FOOTBALL data through a server-only adapter.
- Preserve raw source payloads and provenance; normalize fixtures, teams, competitions, statistics, odds, lineups and results.
- Generate transparent, reproducible probability estimates for 1X2, double chance, goals and BTTS.
- Track forecasts before kickoff and evaluate them against final results.
- Display source freshness, coverage gaps and confidence; never silently invent missing data.
- Build coupons only as an optional research workflow; no automatic real-money betting.

## Confirmed provider
The user's dashboard confirms API-SPORTS API-FOOTBALL, Pro plan, 7,500 requests/day. The API key is server-side only. Direct mode uses the Worker secret `API_FOOTBALL_API_KEY`; dedicated-egress mode stores the API key on the proxy and configures `API_FOOTBALL_PROXY_URL` plus `API_FOOTBALL_PROXY_TOKEN` on the Worker. Never send secrets in chat or commit them.

API base URL: `https://v3.football.api-sports.io/`  
Authentication: `x-apisports-key` request header.  
Official documentation: https://www.api-football.com/documentation-v3

## Engineering rules
- Cache and deduplicate requests; respect both daily and per-minute limits.
- Read account subscription and usage through `/status` (provider says this call does not count against the daily quota).
- Discover active leagues with `/leagues?current=true`; inspect coverage per league and season before requesting optional data.
- Store all timestamps in UTC and display fixture times in Europe/Brussels.
- Preserve missing data as missing; never fabricate.
- Keep provider predictions separate from the app's own models.
- No guaranteed-win claims and no real-money auto-betting.
- All meaningful decisions and milestones are recorded in this folder.

## Current status
The isolated Worker is deployed at https://football-intelligence-ai-api.damianwalus3.workers.dev and is connected to the dedicated D1 database. GitHub CI, typecheck, unit tests and Cloudflare Workers Builds are passing. Live health and D1 connectivity return OK. However, fixture ingestion is currently blocked: the provider's live diagnostic returns `API-SPORTS provider error (rateLimit)` while the Pro account still has daily quota remaining. D1 currently contains 0 fixtures and 0 predictions; the Poisson model remains experimental and unvalidated. A dedicated-egress proxy implementation is ready in `infra/api-sports-proxy/`, but a VPS/static outbound IP has not yet been provisioned or connected.

## Cloudflare deployment
The live Worker uses the `football-intelligence-ai` branch and `FOOTBALL_INTELLIGENCE_AI` root directory. See [`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md) for its deployment settings. The current ingestion blocker and dedicated-egress plan are documented in [`infra/api-sports-proxy/README.md`](infra/api-sports-proxy/README.md) and `STATUS.md`.

## Implemented API surface
- `GET /`: read-only Polish dashboard shell.
- `GET /health`: D1 connectivity health.
- `GET /api/provider/status`: sanitized provider subscription/quota status.
- `GET /api/provider/status?diagnostic=1`: safe diagnostic mode; returns HTTP 200 with `available:false` and allowlisted error categories when the provider is unavailable.
- `GET /api/sync/status`: read-only D1 counts, latest ingestion jobs and cached provider quota snapshot.
- `GET /api/fixtures?date=YYYY-MM-DD`: daily fixtures and latest model probabilities, using Europe/Brussels calendar dates.
- `GET /api/models/performance`: aggregate Brier/log-loss evaluation metrics by model version.
- Protected `POST /api/discovery/refresh`: countries, current competitions and seasons.
- Protected `POST /api/fixtures/refresh?date=YYYY-MM-DD`: daily fixtures and results.
- Protected `POST /api/fixtures/enrich?fixture=<id>`: statistics, lineups and fixture-linked injuries.
- Protected `POST /api/fixtures/odds?fixture=<id>`: bookmaker odds snapshots where plan coverage permits.
- Protected `POST /api/predictions/generate?date=YYYY-MM-DD`: time-safe Poisson baseline forecasts.
- Protected `POST /api/predictions/evaluate?date=YYYY-MM-DD`: Brier and log-loss evaluation after results settle.
- `POST /api/fixtures/sync?date=YYYY-MM-DD`: same-origin dashboard sync with a shared two-minute cooldown; it runs fixture ingestion followed by prediction generation.

Protected ingestion/admin routes require a server-side `INGESTION_TOKEN`. The browser never receives provider credentials.

## Development
Work is isolated under `FOOTBALL_INTELLIGENCE_AI/` on branch `football-intelligence-ai`. Do not deploy or modify the legacy MONEYBALL production Worker or database. The app is deployed, but it must not be considered operational until a fixture sync succeeds and D1 contains verified fixture and prediction rows.
