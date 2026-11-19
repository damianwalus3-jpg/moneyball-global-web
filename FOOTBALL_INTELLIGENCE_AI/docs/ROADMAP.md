# Delivery roadmap

## Stage 0 — charter and architecture
- [x] Isolated development branch created.
- [x] Product charter and architecture documented.
- [x] Provider identity corrected from APIFootball.com to API-SPORTS API-FOOTBALL using the user's dashboard screenshot.
- [x] API-SPORTS v3 base URL and header authentication researched.
- [ ] Create dedicated repository or approve temporary isolated folder.

## Stage 1 — foundation
- [x] Initial connector scaffold exists (legacy APIFootball.com scaffold must be replaced before use).
- [x] Correct provider integration contract documented.
- [x] Implement API-SPORTS v3 server-only client scaffold.
- [ ] Configure `API_FOOTBALL_API_KEY` as a server-side secret.
- [x] Select and document Cloudflare Workers + D1 first deployment stack.
- [x] Create initial provider-neutral PostgreSQL schema migration (execution against a database remains pending).
- [x] Add branch-scoped GitHub Actions CI for typecheck and unit tests (execution result still pending verification).
- [x] Add Worker health/provider status endpoints and ingestion job ledger.
- [ ] Run authenticated `/status` and low-volume live smoke tests.

## Stage 2 — reliable data ingestion
- [x] Confirm account plan and daily quota from dashboard screenshot: Pro, 7,500 requests/day; 670 used at screenshot time.
- [ ] Read account subscription and per-minute quota from `/status` (documented endpoint does not consume daily quota).
- [x] Implement protected country/current-league discovery and coverage persistence (live run pending).
- [x] Implement date-scoped fixture/result ingestion with UTC storage and Europe/Brussels day boundaries (live run pending).
- [x] Implement provider team identity upserts during fixture ingestion (live run pending).
- [ ] Results refresh implemented through fixture ingestion; event timeline remains pending.
- [x] Implement per-fixture statistics, lineups and injuries ingestion (coverage/live run pending).
- [x] Implement per-fixture odds snapshot capture (plan entitlement/coverage pending).
- [ ] Idempotency, pagination, retries, freshness and rate-limit tests.

## Stage 3 — prediction research
- [ ] Build and validate a time-safe historical dataset (only last-10-team-match features are currently used by the baseline).
- [x] Implement experimental independent-Poisson baseline with 1X2 score-grid probabilities.
- [x] Derive 1X/X2/12 directly from the same 1X2 distribution.
- [x] Derive Over/Under 2.5 and BTTS from the same Poisson score grid.
- [ ] Compare provider predictions as an independent benchmark, not ground truth.
- [x] Persist completed-match Brier/log-loss evaluations; full walk-forward backtest and reporting remain pending.
- [ ] Calibration and per-league/market reporting.
- [ ] Shadow predictions before presenting picks as actionable.

## Stage 4 — product UI
- [x] Add first read-only dashboard with date selector and Brussels-local kickoff times.
- [ ] Search/filter by date, country, league and status.
- [ ] Match detail with source-linked facts.
- [ ] Probabilities and clear explanations.
- [ ] Data freshness and missing-data indicators.
- [ ] History, evaluation and audit pages.

## Stage 5 — production hardening
- [ ] Monitoring, alerts, backup/restore and quota budgets.
- [ ] Security review and secret scan.
- [ ] Mobile usability and accessibility.
- [ ] Production deployment and post-deploy smoke tests.
