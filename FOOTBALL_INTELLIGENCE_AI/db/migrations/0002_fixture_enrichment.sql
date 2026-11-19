-- Match enrichment: normalized fixture statistics, lineups and injury availability.
CREATE TABLE IF NOT EXISTS fixture_lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  formation TEXT,
  coach_json TEXT NOT NULL DEFAULT '{}',
  start_xi_json TEXT NOT NULL DEFAULT '[]',
  substitutes_json TEXT NOT NULL DEFAULT '[]',
  source_payload_id INTEGER REFERENCES raw_provider_payloads(id),
  observed_at TEXT NOT NULL,
  UNIQUE (fixture_id, team_id, observed_at)
);
CREATE INDEX IF NOT EXISTS fixture_lineups_fixture_idx ON fixture_lineups(fixture_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS fixture_injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id),
  player_provider_id TEXT,
  player_name TEXT NOT NULL,
  injury_type TEXT,
  reason TEXT,
  source_payload_id INTEGER REFERENCES raw_provider_payloads(id),
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fixture_injuries_fixture_idx ON fixture_injuries(fixture_id, observed_at DESC);
