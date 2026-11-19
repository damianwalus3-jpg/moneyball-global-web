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
- [ ] Select and document final hosting/database stack.
- [ ] Create schema migrations and seed/reference data.
- [ ] Add CI: lint, typecheck, unit tests, build.
- [ ] Add health/status page and ingestion job ledger.
- [ ] Run authenticated `/status` and low-volume live smoke tests.

## Stage 2 — reliable data ingestion
- [x] Confirm account plan and daily quota from dashboard screenshot: Pro, 7,500 requests/day; 670 used at screenshot time.
- [ ] Read account subscription and per-minute quota from `/status` (documented endpoint does not consume daily quota).
- [ ] Fetch countries and leagues; persist actual competition coverage flags.
- [ ] Fixtures and status lifecycle, with Europe/Brussels display timezone and UTC storage.
- [ ] Teams and identity mapping.
- [ ] Results and match events.
- [ ] Statistics, lineups and injuries where coverage permits.
- [ ] Pre-match/in-play odds snapshots where coverage permits.
- [ ] Idempotency, pagination, retries, freshness and rate-limit tests.

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
- [ ] Monitoring, alerts, backup/restore and quota budgets.
- [ ] Security review and secret scan.
- [ ] Mobile usability and accessibility.
- [ ] Production deployment and post-deploy smoke tests.
