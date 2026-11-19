# API-SPORTS API-FOOTBALL integration

## Confirmed provider identity
The user's screenshot shows the API-SPORTS dashboard at `dashboard.api-football.com`, with the API-FOOTBALL product tile showing **9% Used**. This is API-SPORTS API-FOOTBALL, not the separate APIFootball.com service.

Official API documentation: https://www.api-football.com/documentation_v3
Official pricing: https://www.api-football.com/pricing/

## API contract
- Base URL: `https://v3.football.api-sports.io/`
- Authentication: request header `x-apisports-key`.
- REST resources use paths such as `/status`, `/countries`, `/leagues`, `/fixtures`, `/teams`, `/standings`, `/fixtures/statistics`, `/odds`, `/predictions`, `/injuries`, `/players/squads`.
- Calls must be server-side. Store the credential as `API_FOOTBALL_API_KEY`; never expose it in browser bundles, public environment variables, logs, analytics, error traces or source control.
- Use the `/status` endpoint to read the account's actual subscription and request quotas. The screenshot's 9% usage does not reveal the plan name, daily quota or minute rate.

## Plan and coverage
The official pricing page currently lists Free, Pro, Ultra and Mega. Its public Pro tier is described as 7,500 requests/day, and lists fixtures, statistics, predictions, injuries, lineups and pre-match/in-play odds. The screenshot alone does not prove which tier is active; the authenticated `/status` response is authoritative for the account.
Competition coverage varies. Read `coverage` from `/leagues` and persist the actual per-league availability; do not assume every competition has every data type.

## Odds and historical limits
The official docs state that pre-match odds are generally provided 1–14 days before fixtures and that the API retains a 7-day odds history; availability varies by league, season, fixture and bookmaker. Do not treat this as a long-term historical odds archive. Persist snapshots as they are collected.

## Ingestion and quality rules
1. Read `/status` first; the docs state this call does not count against the daily quota. Record subscription, daily limit and current usage, excluding personal account fields.
2. Read response headers `x-ratelimit-requests-limit`, `x-ratelimit-requests-remaining`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`; throttle below both daily and per-minute limits.
3. Fetch `/countries` and `/leagues`; store actual coverage flags.
4. Fetch fixtures with timezone `Europe/Brussels`; persist canonical UTC kickoff plus display timezone.
5. Respect pagination and provider rate limits; cache reference data and avoid duplicate calls.
6. Preserve raw payloads with fetched_at, endpoint, safe parameters, provider version and hash. Never persist the API key or full authenticated request.
7. Upsert fixtures idempotently by provider fixture ID.
8. Store odds as timestamped bookmaker/market snapshots; never overwrite prior snapshots.
9. Store provider predictions separately from the app's independently trained predictions.
10. Missing or unsupported fields remain explicitly missing, never fabricated.
11. Track daily consumption and minute rate continuously; leave a safety reserve for retries and live updates.

## First validation checklist
- [ ] Configure `API_FOOTBALL_API_KEY` as a server-side deployment secret (never paste it in chat).
- [ ] Call `/status` and record actual subscription and quotas.
- [ ] Call `/countries` and `/leagues`; build a coverage inventory.
- [ ] Call `/fixtures` for a small Europe/Brussels date window.
- [ ] Validate fixture IDs, statuses, UTC timestamps, teams and scores.
- [ ] Validate statistics, lineups, injuries and predictions only where league coverage allows.
- [ ] Validate `/odds` and bookmaker/market coverage, then begin scheduled snapshots.
- [ ] Run integration tests and a low-volume live smoke test before enabling scheduled ingestion.
