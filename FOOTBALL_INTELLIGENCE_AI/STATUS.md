# Project status — 2026-11-19

## Confirmed
- Product name: FOOTBALL INTELLIGENCE AI.
- User confirmed provider: APIFootball.com.
- User reports account plan label: Pro.
- Development branch: `football-intelligence-ai`.
- Work is isolated under `FOOTBALL_INTELLIGENCE_AI/`; existing MONEYBALL production app has not been changed.
- APIFootball API v3 docs identify base URL `https://apiv3.apifootball.com/` and query parameter authentication `APIkey`.
- Initial server-side client scaffold, integration notes, environment example and unit tests have been committed.

## Not yet verified
- The provider's public pricing page currently lists European, Worldwide and Premium, not Pro. The user's dashboard may show a legacy/custom plan. Exact league coverage and entitlements must be read from their account.
- No secret has been configured or used. No live API call has been made.
- Odds are a separate add-on on the public pricing page; do not assume access.
- No application has been deployed yet.

## Immediate next steps
1. Confirm the exact API key environment secret can be configured on the chosen server host; never ask for the key in chat.
2. Configure `APIFOOTBALL_API_KEY` as a server-side secret.
3. Run a low-cost smoke test: get_countries, get_leagues, then one date of get_events.
4. Save account coverage and rate-limit/usage metadata.
5. Confirm odds entitlement with a minimal get_odds test before building odds-dependent features.
6. Implement normalized storage and idempotent ingestion; then the first working dashboard.

## Safety and quality
- Never expose the API key to browser code or logs.
- Never treat provider predictions as the app's own model.
- Every prediction must be time-stamped and evaluated against results.
- Missing data must remain explicitly missing, not fabricated.
- No real-money auto-betting.
