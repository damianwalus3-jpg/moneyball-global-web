# Data-source register

| Source | Intended use | Status | Notes |
|---|---|---|---|
| API-Football / API-SPORTS (if this is the user's provider) | Fixtures, events, teams, standings, statistics, lineups, injuries, odds/results where plan permits | Candidate primary; unverified | Confirm exact provider, plan, endpoint access and quotas before implementation |
| Football-data.org | Fixtures, results, standings for covered competitions | Candidate secondary | Verify current coverage, rate limits and terms |
| StatsBomb Open Data | Historical event data for selected competitions | Candidate research dataset | Open-data scope is limited; not a universal live feed |
| Official league/club sources | Confirmed lineups, injuries and suspensions | Candidate verification | Record publication time and link |
| Odds providers / bookmaker feeds | Market prices and movement | Not selected | Must verify licensing, geographic availability and plan limits |
| Reputable match-stat sites | Cross-checking and fallback context | Candidate verification only | No assumption of unrestricted scraping |

## Source quality rules
- Keep a source registry with provider, data category, terms/licensing review, refresh cadence, last success, last failure and confidence.
- Store the original URL or provider endpoint identifier and fetched timestamp.
- Resolve conflicts by field-specific source priority; retain conflicting observations.
- Show source coverage and staleness in the UI.
- Do not claim a market or statistic is available until an endpoint/plan test confirms it.
