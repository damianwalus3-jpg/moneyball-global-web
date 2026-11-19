# Delivery roadmap

## Stage 0 — charter and architecture
- [x] Isolated development branch created.
- [x] Product charter and non-goals documented.
- [x] Architecture and source register documented.
- [ ] Confirm API provider and plan.
- [ ] Create dedicated repository or approve temporary isolated folder.

## Stage 1 — foundation
- [ ] Select and document stack after checking deployment and database constraints.
- [ ] Create schema migrations and seed/reference data.
- [ ] Add provider adapter interface and secure secret configuration.
- [ ] Add CI: lint, typecheck, unit tests, build.
- [ ] Add health/status page and job ledger.

## Stage 2 — reliable data ingestion
- [ ] Competitions and seasons.
- [ ] Fixtures and status lifecycle.
- [ ] Teams and identity mapping.
- [ ] Results and match events.
- [ ] Statistics, lineups and injuries when supported by plan.
- [ ] Odds snapshots only where legally and technically available.
- [ ] Idempotency, retries, freshness and coverage tests.

## Stage 3 — prediction research
- [ ] Establish a time-safe historical dataset.
- [ ] Baseline goal model and 1X2 probabilities.
- [ ] Double chance derived consistently from 1X2.
- [ ] Goals and BTTS distributions.
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
