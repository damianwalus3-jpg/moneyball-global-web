# Project status — 2026-11-19

## Confirmed
- Product name: FOOTBALL INTELLIGENCE AI.
- User-provided dashboard screenshot identifies **API-SPORTS API-FOOTBALL** at `dashboard.api-football.com`.
- The API-FOOTBALL product tile displays **9% Used**. This is usage percentage only; it does not identify the exact plan or quota.
- Official API contract is API-SPORTS v3: `https://v3.football.api-sports.io/`, authentication header `x-apisports-key`.
- Development branch: `football-intelligence-ai`.
- Work remains isolated under `FOOTBALL_INTELLIGENCE_AI/`; existing MONEYBALL production app has not been changed.

## Corrected provider decision
- Replace the previously scaffolded APIFootball.com connector. It targeted the wrong provider and must not be used for this project.
- New server-side secret name: `API_FOOTBALL_API_KEY`.
- First live call must be `GET /status` to discover the actual subscription and quotas.
- Official public pricing lists Free, Pro, Ultra and Mega; public Pro is described as 7,500 requests/day. The screenshot alone does not confirm the user's plan.
- Actual competition coverage must be read from `/leagues` coverage fields. Odds and other data must be checked per competition.

## Not yet verified
- No API key has been configured or used. No live API request has been made.
- Exact subscription, daily quota, per-minute limit and live data coverage are not yet known.
- No application has been deployed.
- Tests/build have not yet been run.

## Immediate next steps
1. Implement API-SPORTS v3 client using `x-apisports-key` and the correct REST paths.
2. Configure `API_FOOTBALL_API_KEY` as a server-side secret.
3. Run `/status`, then countries/leagues and a small fixture smoke test.
4. Persist actual coverage and quota metadata.
5. Validate odds and other endpoints, then implement normalized storage and idempotent ingestion.

## Safety and quality
- Never expose the API key to browser code or logs.
- Respect daily and per-minute limits; cache and deduplicate calls.
- Never treat provider predictions as the app's own model.
- Every prediction must be time-stamped and evaluated against results.
- Missing data must remain explicitly missing, not fabricated.
- No real-money auto-betting.
