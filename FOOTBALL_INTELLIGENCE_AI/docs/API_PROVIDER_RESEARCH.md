# API provider research (2026-11-19)

The phrase "Football API" is ambiguous. Two distinct services exist and must not be conflated:

1. **API-Football / API-SPORTS** — `api-football.com`, v3 base URL `https://v3.football.api-sports.io/`, authentication header `x-apisports-key`. Official docs describe fixtures, events, lineups, statistics, injuries, predictions, pre-match odds and live odds. Official pricing page currently lists daily quotas by plan; confirm the user's actual plan in their dashboard because prices/limits can change.
2. **apifootball.com** — a separate provider with a different API and authentication format. Do not use API-SPORTS endpoints or headers for this provider.

## Verified API-Football / API-SPORTS facts
- Official documentation: https://www.api-football.com/documentation-v3
- Official pricing: https://www.api-football.com/pricing/
- API-SPORTS v3 base URL: https://v3.football.api-sports.io/
- API key header: `x-apisports-key`
- The competition `coverage` metadata must be checked per league/season; an endpoint may exist globally while specific competition data is unavailable.
- Official docs describe fixtures, lineups, statistics, injuries, predictions and odds; pre-match odds have a limited rolling history and availability varies by competition/bookmaker.
- The API's own prediction endpoint is a benchmark/source feature, not our proprietary model. We must store it separately and compare it against our own forecasts.
- Rate limits include both daily quotas and per-minute limits. Implement a shared request budget, caching, batching, exponential backoff and quota telemetry.

## Integration gate
Do not implement a live adapter until the user confirms which of the two providers they have and the subscription plan. Never request or store the secret key in GitHub or chat. Add it only to server-side deployment secrets after the deployment target is selected.
