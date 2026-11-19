# Deployment decision — Cloudflare-first prototype

## Decision
Use **Cloudflare Workers + D1** for the first deployable version of FOOTBALL INTELLIGENCE AI.

Why:
- The user's existing project workflows already use Cloudflare.
- Workers can keep API-SPORTS credentials server-side and expose only normalized application endpoints.
- D1 is a managed SQLite database with native Worker bindings and migration support.
- The initial product can be prototyped on the Cloudflare Free plan without introducing Supabase or a separate paid API/database vendor.

## Verified current free-tier constraints
Checked against official Cloudflare documentation on 2026-11-19:
- Workers Free: 100,000 requests/day, 10 ms CPU time per invocation, 50 subrequests per invocation, and up to 5 Cron Triggers per account.
- D1 Free: up to 10 databases, 500 MB per database, 5 GB total account storage, 7-day Time Travel recovery, and 50 read subqueries per Worker invocation.
- D1 free-tier daily row-read and row-write quotas are enforced; exceeding them causes queries to fail until the daily reset. Queries must be indexed and batched.

These limits are suitable for a carefully cached first release, not a promise of unlimited global historical ingestion. Monitor actual D1 read/write usage and API-SPORTS quota independently.

## Runtime boundaries
- Worker owns all provider API calls, scheduled jobs and secret access.
- Browser calls only the app's Worker endpoints; it never calls API-SPORTS directly.
- D1 stores normalized entities, raw payload evidence, odds snapshots and job/quota ledgers.
- Use a single scheduled coordinator with bounded work per invocation; chain work through persisted job state rather than trying to scan every competition in one Cron execution.
- Keep public read endpoints cacheable; protect admin/sync endpoints with a separate secret and never expose them to anonymous users.

## Initial Worker scaffold

- Added `wrangler.toml` with D1 binding and migration directory.
- Added Worker endpoints: `GET /health` (D1 connectivity) and `GET /api/provider/status` (sanitized provider subscription/quota status).
- Added Worker unit tests for health, unavailable database, missing secret and method rejection. Tests are written but not executed.
- Added the Cloudflare D1-compatible SQLite migration; syntax was validated locally against SQLite 3.46.1 in an in-memory database. This does not mean it has been applied to a Cloudflare D1 instance.

## Secrets and setup still required
- `API_FOOTBALL_API_KEY`: Cloudflare Worker secret.
- D1 database creation and generated database ID.
- Worker deployment permissions and domain/subdomain selection.
- A separate repository boundary is preferred before production deployment; the current work remains isolated in a subfolder/branch and must not be deployed as the legacy MONEYBALL app.

## Upgrade triggers
Reassess storage/runtime only if actual measurements show that D1 free-tier row quotas, 500 MB database size, Worker CPU limits, or scheduling constraints prevent reliable ingestion. Do not upgrade based on hypothetical scale alone.
