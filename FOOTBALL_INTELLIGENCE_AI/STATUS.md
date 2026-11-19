# Project status — 2026-11-19

## Confirmed
- Product name: FOOTBALL INTELLIGENCE AI.
- User-provided dashboard identifies API-SPORTS API-FOOTBALL at `dashboard.api-football.com`.
- Profile > My Access confirms **FOOTBALL / Pro / 670 requests used / 7,500 requests per day**. Remaining at screenshot time: **6,830 requests** (about 91.1% remaining). The dashboard tile's 9% used is consistent with rounding.
- API-SPORTS v3 base URL: `https://v3.football.api-sports.io/`; authentication header: `x-apisports-key`.
- Development branch: `football-intelligence-ai`; work is isolated under `FOOTBALL_INTELLIGENCE_AI/`. Existing MONEYBALL production app has not been changed.

## Completed in this development pass
- Replaced the wrong APIFootball.com connector contract with API-SPORTS API-FOOTBALL v3.
- Implemented server-only client methods for status, countries, active leagues, seasons, fixtures, teams, standings, fixture statistics, odds, predictions, injuries and lineups.
- Added daily and per-minute rate-limit header parsing with an injectable callback.
- Added default active league discovery filter `current=true`, because the provider requires at least one `/leagues` filter.
- Added unit tests for authentication header, no key in URL, timezone, status, active league default, rate-limit headers and API errors.
- Updated README, architecture, provider integration guide and roadmap.
- Official docs confirm `/status` does not count toward daily quota; `/leagues` exposes per-season coverage flags; provider recommends caching and documents endpoint-specific update frequencies.

## Not yet verified / blocked
- No API key has been configured or used. No live API request has been made.
- Per-minute quota and real competition-by-competition coverage still need authenticated `/status` and `/leagues` calls.
- Unit tests, lint and build have not been run in a local checkout; GitHub file commits are not proof of passing CI.
- No persistent database, scheduled ingestion, UI or deployment has been implemented.
- A dedicated repository/deployment boundary is still needed before production; do not deploy the containing legacy MONEYBALL app.

## Next execution sequence
1. Add a secure server-side secret `API_FOOTBALL_API_KEY` in the eventual hosting environment; never paste the key in chat or commit it.
2. Run authenticated `/status`, then countries, active leagues and one small date-window fixture request.
3. Persist actual plan, quota metadata and per-league/season coverage.
4. Design migrations for raw provider snapshots, competitions, seasons, teams, fixtures, odds and job runs.
5. Build idempotent, cached, quota-aware ingestion with a daily request budget and per-minute throttle.
6. Add CI and execute tests, lint, typecheck and build.
7. Implement baseline models only after historical data quality and timestamp cutoffs are validated.

## Safety and quality
- Never expose the API key to browser code or logs.
- Respect daily and per-minute limits; cache and deduplicate calls.
- Never treat provider predictions as the app's own model.
- Every prediction must be time-stamped and evaluated against results.
- Missing data must remain explicitly missing, not fabricated.
- No real-money auto-betting.
