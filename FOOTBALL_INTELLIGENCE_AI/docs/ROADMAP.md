# Delivery roadmap

## Stage 0 — charter and architecture
- [x] Isolated development branch created.
- [x] Product charter and non-goals documented.
- [x] Architecture and source register documented.
- [x] Provider identified as APIFootball.com (not API-SPORTS).
- [x] API v3 endpoint/authentication contract researched.
- [ ] Reconcile user's dashboard label "Pro" with public plan names and exact entitlements.
- [ ] Create dedicated repository or approve temporary isolated folder.

## Stage 1 — foundation
- [x] Initial server-only APIFootball API v3 adapter scaffold created.
- [x] Secret variable documented as APIFOOTBALL_API_KEY; no credential committed.
- [ ] Select and document final hosting/database stack.
- [ ] Create schema migrations and seed/reference data.
- [ ] Add CI: lint, typecheck, unit tests, build.
- [ ] Add health/status page and job ledger.
- [ ] Configure secret in deployment environment and run live smoke tests.

## Stage 2 — reliable data ingestion
- [ ] Fetch account countries and leagues to establish real coverage.
- [ ] Fixtures and status lifecycle.
- [ ] Teams and identity mapping.
- [ ] Results and match events.
- [ ] Statistics, lineups and injuries when supported by plan.
- [ ] Odds snapshots only after confirming odds entitlement/add-on.
- [ ] Idempotency, retries, freshness and coverage tests.

## Stage 3 — prediction research
- [ ] Establish a time-safe historical dataset.
- [ ] Baseline goal model and 1X2 probabilities.
- [ ] Double chance derived consistently from 1X2.
- [ ] Goals and BTTS distributions.
- [ ] Compare provider predictions as an independent benchmark, not ground truth.
- [ ] Walk-forward backtesting; no random train/test leakage.
- [ ] Calibration and per-league/market reporting.
- [ ] Shadow predictions before presenting picks as actionable.

## Stage 4 — product UI
- [ ] Today's fixtures in Europe/Brussels.
- [ ] Search/filter by date, country, league and status.
- [ ] Match detail with source-linked facts.
- [ ] Probabilities and clear explanations.
- [ ] Data freshness and missing-data indicators.
- [ ] History, evaluation and audit pages.

## Stage 5 — production hardening
- [ ] Monitoring, alerts, backup/restore and rate-limit budgets.
- [ ] Security review and secret scan.
- [ ] Mobile usability and accessibility.
- [ ] Production deployment and post-deploy smoke tests.
