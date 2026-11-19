-- Public dashboard sync is intentionally rate-limited globally.
-- This lets the dashboard trigger a server-side refresh without exposing INGESTION_TOKEN.
CREATE TABLE IF NOT EXISTS public_sync_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_requested_at TEXT NOT NULL
);
