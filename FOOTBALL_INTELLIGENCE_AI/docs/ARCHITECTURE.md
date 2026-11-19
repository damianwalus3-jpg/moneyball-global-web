# Architecture baseline

## Principles
1. Provider adapters are independent; no provider-specific schema leaks into the domain model.
2. Store raw payloads with provider, endpoint, fetched_at, request parameters and a content hash.
3. Normalize entities using stable provider IDs plus internal IDs.
4. Idempotent ingestion: repeated syncs update source snapshots and do not duplicate matches.
5. Every prediction stores model version, feature cutoff, generated_at, probabilities and explanation metadata.
6. No leakage: features used for a pre-match prediction must be timestamped no later than its prediction cutoff.
7. Missing data is represented explicitly (unknown/unavailable/stale), never silently treated as zero.
8. All times stored in UTC and displayed in Europe/Brussels.
9. Server-side secrets only. Never expose provider keys to client code.
10. Every scheduled job is observable, retryable, rate-limited and safe to rerun.

## Logical components
- Web client: responsive dashboard, fixtures, match detail, predictions, source coverage, history and model performance.
- API layer: authenticated read APIs and admin/health endpoints.
- Ingestion workers: fixtures, teams, competitions, standings, match statistics, injuries, lineups, odds and results.
- Provider adapters: API-Football first after provider/plan confirmation; secondary feeds added only after terms and reliability checks.
- Normalization and quality layer: identity resolution, deduplication, freshness, validation and conflict handling.
- Feature store: time-aware team and match features.
- Prediction engine: baseline Poisson/Dixon-Coles-style goal model, rating/form features, then calibrated ensemble after backtesting.
- Evaluation engine: Brier score, log loss, calibration curves, accuracy by market/league and closing-line comparison where available.
- Persistence: relational normalized records plus immutable raw source snapshots.
- Scheduler/observability: scheduled syncs, retries, job ledger, alertable failures and audit trail.

## Initial deployment direction
Prefer a low-cost serverless deployment with a server-side worker and managed relational persistence. Final provider/hosting choice is pending an actual quota, secret-management and database review. Do not assume free-tier limits without checking them.

## Security
- Store API credentials only in deployment secrets.
- Redact authorization headers and keys from logs.
- Use least-privilege credentials.
- Add request budgets and cache provider responses.
- Respect API plan limits, robots/access rules and provider licensing.
