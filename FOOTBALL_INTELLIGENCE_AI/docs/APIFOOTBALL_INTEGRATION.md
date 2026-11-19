# APIFootball.com provider integration

## Confirmed API identity
The user confirmed **apifootball.com**, not API-SPORTS/API-Football. Use API v3:
- Base URL: `https://apiv3.apifootball.com/`
- Authentication: `APIkey` query parameter (provider's documented scheme).
- All calls must run server-side. The key must never enter browser bundles, public environment variables, logs, analytics, error traces or source control. Redact query strings in observability.

Official documentation: https://apifootball.com/documentation/

## Documented actions
- `get_countries`: countries included in the current subscription.
- `get_leagues`: competitions included in the current subscription.
- `get_teams`: team roster and player data, scoped by league_id or team_id.
- `get_events`: fixtures/results; accepts from, to, timezone, country_id, league_id, match_id, team_id, match_live and withPlayerStats.
- `get_standings`: league standings.
- `get_statistics`: match statistics.
- `get_odds`: pre-match odds; date range and optional match_id; response includes bookmaker and market values.
- `get_H2H`: head-to-head and recent team results.
- `get_predictions`: provider predictions.
- Lineups, news, live odds/comments and WebSockets are documented separately; verify entitlement before enabling.

## Important plan ambiguity
The public pricing page currently lists Free, European, Worldwide and Premium; it does not show a plan named “Pro”. Odds are presented as a separate $15 add-on on that page. The user's dashboard may show a legacy, custom or differently named Pro plan. Do not infer that odds, global leagues, predictions or news are enabled from the word “Pro”. Verify live account entitlement with a server-side smoke test and compare returned countries/leagues with expected coverage.

## Integration safety and data quality
1. Keep the API key in server-side secret `APIFOOTBALL_API_KEY`.
2. API key is a query parameter, so never log the full URL.
3. Request only the date window needed; use Europe/Brussels for fixture display and persist UTC timestamps after parsing.
4. Treat empty arrays, provider errors and unavailable fields as distinct states.
5. Preserve raw payloads with fetched_at, action, safe parameters (never APIkey), source version and hash.
6. Idempotently upsert by provider match_id.
7. Store odds as timestamped bookmaker snapshots; do not overwrite historical odds.
8. Store predictions with generated_at and model version. Do not treat provider predictions as our model's output.
9. API v3 documentation last updated 2023-07-22 according to the provider page; verify current behaviour against the account before production use.

## First validation checklist
- [ ] User confirms dashboard's exact plan label and whether odds add-on is active.
- [ ] Configure `APIFOOTBALL_API_KEY` as a deployment secret (never paste it in chat).
- [ ] Call get_countries and get_leagues; store actual account coverage.
- [ ] Call get_events for a small date window in Europe/Brussels.
- [ ] Check quota headers/usage if exposed by provider; do not assume public plan limits apply to custom plans.
- [ ] Validate event IDs, statuses, team IDs, timezone and final score fields.
- [ ] Test get_odds and get_statistics only after entitlement confirmed.
