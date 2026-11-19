-- Reproducible pre-match model outputs. Feature cutoff is stored to audit leakage.
CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_key TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (model_key, version)
);
CREATE TABLE IF NOT EXISTS match_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  model_version_id INTEGER NOT NULL REFERENCES model_versions(id),
  generated_at TEXT NOT NULL,
  feature_cutoff_at TEXT NOT NULL,
  lambda_home REAL NOT NULL,
  lambda_away REAL NOT NULL,
  probability_home REAL NOT NULL,
  probability_draw REAL NOT NULL,
  probability_away REAL NOT NULL,
  probability_1x REAL NOT NULL,
  probability_x2 REAL NOT NULL,
  probability_12 REAL NOT NULL,
  probability_over_25 REAL NOT NULL,
  probability_under_25 REAL NOT NULL,
  probability_btts_yes REAL NOT NULL,
  probability_btts_no REAL NOT NULL,
  sample_home INTEGER NOT NULL,
  sample_away INTEGER NOT NULL,
  explanation_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (fixture_id, model_version_id, feature_cutoff_at)
);
CREATE INDEX IF NOT EXISTS match_predictions_fixture_idx
  ON match_predictions(fixture_id, generated_at DESC);
