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
The user's dashboard confirms API-SPORTS API-FOOTBALL, Pro plan, 7,500 requests/day, with 670 requests used at the time of the screenshot. The API key is configured only as the server-side secret `API_FOOTBALL_API_KEY`; it must never be sent in chat or committed.

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
Provider identity, subscription tier and daily quota confirmed from the user's dashboard. The API-SPORTS v3 client scaffold is implemented. Live authentication, account coverage, runtime tests, persistence and deployment remain pending because the API secret has not yet been configured in a server environment.

## Cloudflare deployment
See [`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md) for the exact Workers Builds configuration. The Worker must use the `football-intelligence-ai` branch and `FOOTBALL_INTELLIGENCE_AI` root directory; never deploy the repository root or a MONEYBALL branch for this product.

## Development
Work is isolated under `FOOTBALL_INTELLIGENCE_AI/` on branch `football-intelligence-ai`. Do not deploy the containing legacy application as this new product. A dedicated repository/deployment boundary is still required before production.
