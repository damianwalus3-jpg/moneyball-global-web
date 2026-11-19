# Initial data model

The first Cloudflare D1 (SQLite) migration is `db/migrations/0001_initial_schema.sql`.

## Storage layers
1. **Provider account snapshot** — plan and quota observations, without storing the user's email or API key.
2. **Reference data** — countries, competitions, seasons and teams keyed by stable provider identifiers.
3. **Fixtures** — one normalized row per provider fixture; kickoff timestamps are UTC.
4. **Immutable source evidence** — raw JSON payloads with endpoint, safe parameters, SHA-256, HTTP status and fetch time.
5. **Match facts** — statistics and timestamped odds snapshots. Odds are append-only; do not overwrite earlier prices.
6. **Operations ledger** — ingestion job status, request counts, row counts and sanitized errors.

## Important constraints
- Every provider entity has a provider namespace plus provider ID to avoid collisions when secondary sources are added.
- Competition coverage is stored per competition/season as JSON text because feature availability differs by season.
- Fixture IDs are unique and stable within a provider. Repeated syncs must upsert, not duplicate.
- Raw payloads are immutable. Normalized data may be rebuilt from them.
- Odds snapshots include observation time and bookmaker/market identity.
- Store event timestamps in UTC; only convert to Europe/Brussels at presentation boundaries.
- Never store API keys in raw request parameters, metadata, logs or database rows.
- The initial migration is a baseline, not yet executed against a database. The D1 database ID, Cloudflare secret and migrations runner still need account-side setup.
