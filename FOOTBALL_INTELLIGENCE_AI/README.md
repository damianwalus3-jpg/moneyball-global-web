# FOOTBALL INTELLIGENCE AI

A cleanly isolated, new-generation football analytics application. This project is being developed in the `football-intelligence-ai` branch and kept separate from the existing production MONEYBALL application.

## Product goals
- Discover fixtures across supported competitions and regions.
- Ingest data from multiple providers, with API-Football as the first candidate primary feed (provider/plan to be confirmed).
- Preserve raw source payloads and provenance; normalize fixtures, teams, competitions, statistics, odds, lineups and results.
- Generate transparent, reproducible probability estimates for 1X2, double chance, goals and BTTS.
- Track forecasts before kickoff and evaluate them against final results.
- Display source freshness, coverage gaps and confidence; never silently invent missing data.
- Build coupons only as an optional research workflow; no automatic real-money betting.

## Non-goals
- No promise of guaranteed wins or certain picks.
- No scraping that bypasses access controls or violates provider terms.
- No API secrets in source code, commits, browser bundles, logs or chat.

## Current status
Stage 0 — project charter and architecture baseline created. No API credential has been entered or tested yet. No application is deployed yet.

## First setup needed
1. Confirm the exact football API provider and plan (do not send the secret key in chat).
2. Create a dedicated GitHub repository for this project, or approve keeping this isolated project folder in the current repository for now.
3. Add the API key as a server-side secret in the deployment environment.
4. Verify provider endpoints and plan limits before enabling scheduled ingestion.
