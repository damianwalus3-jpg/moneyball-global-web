-- FOOTBALL INTELLIGENCE AI — provider-neutral PostgreSQL schema.
-- All timestamps are stored as timestamptz (UTC); render in Europe/Brussels.
-- Raw payloads are immutable evidence; normalized tables are rebuildable projections.

CREATE TABLE IF NOT EXISTS provider_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  product TEXT NOT NULL,
  plan_name TEXT,
  subscription_active BOOLEAN,
  daily_request_limit INTEGER,
  daily_requests_used INTEGER,
  daily_requests_remaining INTEGER,
  minute_request_limit INTEGER,
  minute_requests_remaining INTEGER,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, product)
);

CREATE TABLE IF NOT EXISTS countries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_country_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  flag_url TEXT,
  source_updated_at TIMESTAMPTZ,
  UNIQUE (provider, provider_country_id),
  UNIQUE (provider, code)
);

CREATE TABLE IF NOT EXISTS competitions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_competition_id TEXT NOT NULL,
  country_id BIGINT REFERENCES countries(id),
  name TEXT NOT NULL,
  type TEXT,
  logo_url TEXT,
  coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_competition_id)
);

CREATE TABLE IF NOT EXISTS competition_seasons (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id BIGINT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  UNIQUE (competition_id, season_year)
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  code TEXT,
  logo_url TEXT,
  founded_year INTEGER,
  national BOOLEAN,
  venue JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  UNIQUE (provider, provider_team_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_fixture_id TEXT NOT NULL,
  competition_season_id BIGINT REFERENCES competition_seasons(id),
  home_team_id BIGINT NOT NULL REFERENCES teams(id),
  away_team_id BIGINT NOT NULL REFERENCES teams(id),
  kickoff_at TIMESTAMPTZ,
  status_short TEXT,
  status_long TEXT,
  elapsed_minutes INTEGER,
  home_goals INTEGER,
  away_goals INTEGER,
  round_name TEXT,
  venue JSONB NOT NULL DEFAULT '{}'::jsonb,
  referee TEXT,
  source_updated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_fixture_id),
  CHECK (home_team_id <> away_team_id)
);

CREATE INDEX IF NOT EXISTS fixtures_kickoff_idx ON fixtures(kickoff_at);
CREATE INDEX IF NOT EXISTS fixtures_status_kickoff_idx ON fixtures(status_short, kickoff_at);
CREATE INDEX IF NOT EXISTS fixtures_season_kickoff_idx ON fixtures(competition_season_id, kickoff_at);

CREATE TABLE IF NOT EXISTS raw_provider_payloads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_status INTEGER,
  provider_results INTEGER,
  UNIQUE (provider, endpoint, payload_sha256)
);

CREATE INDEX IF NOT EXISTS raw_payloads_fetched_idx ON raw_provider_payloads(fetched_at DESC);
CREATE INDEX IF NOT EXISTS raw_payloads_endpoint_idx ON raw_provider_payloads(provider, endpoint, fetched_at DESC);

CREATE TABLE IF NOT EXISTS fixture_statistics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  statistic_type TEXT NOT NULL,
  statistic_value JSONB,
  source_payload_id BIGINT REFERENCES raw_provider_payloads(id),
  observed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (fixture_id, team_id, statistic_type, observed_at)
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_provider_id TEXT,
  bookmaker_name TEXT NOT NULL,
  market_provider_id TEXT,
  market_name TEXT NOT NULL,
  selection_name TEXT NOT NULL,
  odds_value NUMERIC(12,5) NOT NULL CHECK (odds_value > 1),
  observed_at TIMESTAMPTZ NOT NULL,
  source_payload_id BIGINT REFERENCES raw_provider_payloads(id)
);

CREATE INDEX IF NOT EXISTS odds_fixture_market_time_idx
  ON odds_snapshots(fixture_id, market_name, observed_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  requests_made INTEGER NOT NULL DEFAULT 0,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_created_idx ON ingestion_jobs(created_at DESC);
