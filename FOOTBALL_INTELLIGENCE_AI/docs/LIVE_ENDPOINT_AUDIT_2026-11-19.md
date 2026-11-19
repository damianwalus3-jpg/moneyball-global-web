# Live endpoint audit — 2026-11-19

## Executive result

The URL supplied for inspection is **not** the Worker currently deployed from the isolated `football-intelligence-ai` branch.

Supplied URL:
`https://football-ai-damian-2026.damianwalus3.workers.dev`

Isolated branch deployment:
`https://football-intelligence-ai-api.damianwalus3.workers.dev`

The two hosts expose different application versions and different API contracts. Do not treat them as interchangeable.

## Supplied host: observed behavior

Checked:
- `GET /`: returns a separate dashboard headed "FOOTBALL INTELLIGENCE AI".
- `GET /api/fixtures?date=2026-11-19`: returns `ok: true`, `timezone: Europe/Brussels`, `count: 114`, `paging.current: 1`, `paging.total: 1`, and raw provider-shaped fixture objects.
- `GET /health`: HTTP 404.
- `GET /api/provider/status`: HTTP 404.

The returned fixture payload includes fields such as `fixture.id`, `fixture.date`, `fixture.status.short`, `league.country`, `teams.home`, `teams.away`, and `goals`. It contains fixtures from multiple continents (visible examples include Brazil, Suriname, Venezuela, Zambia, Australia, Japan, Azerbaijan, Bosnia, Slovakia, Egypt, Spain, France and Uruguay). It is therefore a global provider feed, not a Europe-only list.

Some fixtures are completed, live, scheduled, or postponed. The returned data includes a live `2H` item with elapsed time 90 and postponed `PST` items. These values should be preserved as source statuses and surfaced distinctly; they must not be re-labelled as upcoming or finished by guesswork.

## Contract mismatch

The isolated branch implementation in `src/worker/index.ts` intentionally exposes a normalized D1-backed contract:

```json
{
  "date": "YYYY-MM-DD",
  "count": 0,
  "fixtures": []
}
```

Each normalized fixture uses fields such as `provider_fixture_id`, `kickoff_at`, `status_short`, `home_team`, `away_team`, and model probability fields. The branch dashboard consumes this normalized contract.

The supplied host instead returns raw API-SPORTS fixture objects inside a different envelope (`ok`, `timezone`, `paging`). A frontend written for the branch contract cannot safely consume that raw shape without an explicit adapter. The supplied host also does not expose the branch's `/health` or `/api/provider/status` routes.

## Isolated branch deployment verification

Repository: `damianwalus3-jpg/moneyball-global-web`  
Branch: `football-intelligence-ai`  
Root directory: `FOOTBALL_INTELLIGENCE_AI`  
Worker name: `football-intelligence-ai-api`  
Deployed commit: `c25dae5d047c3a43b8ea423672d56eaa9b83471b`

GitHub checks for that commit:
- Cloudflare Workers Builds: **success** (build ID `790411f4-1097-4fe8-8c2a-b24c0c11da8d`, version `6f0ea2f8-9fea-404e-ac70-a8290dd8c58b`).
- Typecheck and unit tests: **success**.

Live checks on `https://football-intelligence-ai-api.damianwalus3.workers.dev`:
- `GET /health`: HTTP 200; `{"status":"ok","database":true,"service":"football-intelligence-ai"}`.
- `GET /`: branch dashboard is served successfully.
- `GET /api/fixtures?date=2026-11-19`: HTTP 200; `{"date":"2026-11-19","count":0,"fixtures":[]}`.
- `GET /api/provider/status`: HTTP 503. Provider connectivity/authentication is not yet verified; the diagnostic response body could not be retrieved through the available read-only fetch interface.

The successful health and fixture query show that the deployed branch Worker is reachable and can query D1. The empty fixture list means the D1 fixture store has not yet been populated for this date (or no rows exist for that date). No successful live provider discovery/fixture ingestion has been verified.

## Corrective actions and safe next steps

1. Keep the isolated branch Worker as the authoritative FOOTBALL INTELLIGENCE AI deployment. Do not silently switch its frontend to the unrelated supplied host.
2. Resolve the 503 from `/api/provider/status` using Cloudflare Worker logs/runtime secret settings; do not expose or request the API key in chat.
3. Once provider status returns sanitized subscription/quota metadata, run the protected discovery refresh, verify country/competition coverage, then ingest one date of fixtures.
4. Confirm the intended competition scope before applying any continent filter. The current product requirements describe competitions covered by the provider; the supplied feed is global. Do not silently discard non-European fixtures.
5. If the older `football-ai-damian-2026` host is intended to remain the public URL, its source repository/build configuration must be identified and its API response adapted to the normalized contract, or the app must be deliberately pointed to the authoritative branch Worker.

## Safety

No production MONEYBALL Worker or database was modified. No provider secrets were read, changed, or exposed. No data-ingestion POST request was sent. The audit is read-only apart from this documentation record.
