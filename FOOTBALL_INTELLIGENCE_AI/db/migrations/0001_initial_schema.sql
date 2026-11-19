-- FOOTBALL INTELLIGENCE AI — Cloudflare D1 (SQLite) schema.
-- Store ISO-8601 UTC timestamps as TEXT. JSON payloads/metadata are JSON text.
-- Raw payloads are immutable evidence; normalized tables are rebuildable projections.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  product TEXT NOT NULL,
  plan_name TEXT,
  subscription_active INTEGER CHECK (subscription_active IN (0, 1)),
  daily_request_limit INTEGER,
  daily_requests_used INTEGER,
  daily_requests_remaining INTEGER,
  minute_request_limit INTEGER,
  minute_requests_remaining INTEGER,
  observed_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (provider, product)
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_country_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  flag_url TEXT,
  source_updated_at TEXT,
  UNIQUE (provider, provider_country_id),
  UNIQUE (provider, code)
);

CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_competition_id TEXT NOT NULL,
  country_id INTEGER REFERENCES countries(id),
  name TEXT NOT NULL,
  type TEXT,
  logo_url TEXT,
  coverage_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_competition_id)
);

CREATE TABLE IF NOT EXISTS competition_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  coverage_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT,
  UNIQUE (competition_id, season_year)
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  code TEXT,
  logo_url TEXT,
  founded_year INTEGER,
  national INTEGER CHECK (national IN (0, 1)),
  venue_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT,
  UNIQUE (provider, provider_team_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_fixture_id TEXT NOT NULL,
  competition_season_id INTEGER REFERENCES competition_seasons(id),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff_at TEXT,
  status_short TEXT,
  status_long TEXT,
  elapsed_minutes INTEGER,
  home_goals INTEGER,
  away_goals INTEGER,
  round_name TEXT,
  venue_json TEXT NOT NULL DEFAULT '{}',
  referee TEXT,
  source_updated_at TEXT,
  last_seen_at TEXT NOT NULL,
  raw_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_fixture_id),
  CHECK (home_team_id <> away_team_id)
);

CREATE INDEX IF NOT EXISTS fixtures_kickoff_idx ON fixtures(kickoff_at);
CREATE INDEX IF NOT EXISTS fixtures_status_kickoff_idx ON fixtures(status_short, kickoff_at);
CREATE INDEX IF NOT EXISTS fixtures_season_kickoff_idx ON fixtures(competition_season_id, kickoff_at);

CREATE TABLE IF NOT EXISTS raw_provider_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_params_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  http_status INTEGER,
  provider_results INTEGER,
  UNIQUE (provider, endpoint, payload_sha256)
);

CREATE INDEX IF NOT EXISTS raw_payloads_fetched_idx ON raw_provider_payloads(fetched_at DESC);
CREATE INDEX IF NOT EXISTS raw_payloads_endpoint_idx ON raw_provider_payloads(provider, endpoint, fetched_at DESC);

CREATE TABLE IF NOT EXISTS fixture_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  statistic_type TEXT NOT NULL,
  statistic_value_json TEXT,
  source_payload_id INTEGER REFERENCES raw_provider_payloads(id),
  observed_at TEXT NOT NULL,
  UNIQUE (fixture_id, team_id, statistic_type, observed_at)
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_provider_id TEXT,
  bookmaker_name TEXT NOT NULL,
  market_provider_id TEXT,
  market_name TEXT NOT NULL,
  selection_name TEXT NOT NULL,
  odds_value REAL NOT NULL CHECK (odds_value > 1),
  observed_at TEXT NOT NULL,
  source_payload_id INTEGER REFERENCES raw_provider_payloads(id)
);

CREATE INDEX IF NOT EXISTS odds_fixture_market_time_idx
  ON odds_snapshots(fixture_id, market_name, observed_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at TEXT,
  finished_at TEXT,
  requests_made INTEGER NOT NULL DEFAULT 0,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_created_idx ON ingestion_jobs(created_at DESC);
