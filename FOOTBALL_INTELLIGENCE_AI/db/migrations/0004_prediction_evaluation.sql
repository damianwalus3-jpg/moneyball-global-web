-- Persist proper scoring-rule evaluation for forecasts after final results arrive.
CREATE TABLE IF NOT EXISTS prediction_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL REFERENCES match_predictions(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  evaluated_at TEXT NOT NULL,
  actual_outcome TEXT NOT NULL CHECK (actual_outcome IN ('1', 'X', '2')),
  actual_over_25 INTEGER NOT NULL CHECK (actual_over_25 IN (0, 1)),
  actual_btts_yes INTEGER NOT NULL CHECK (actual_btts_yes IN (0, 1)),
  brier_1x2 REAL NOT NULL,
  log_loss_1x2 REAL NOT NULL,
  brier_over_25 REAL NOT NULL,
  brier_btts REAL NOT NULL,
  UNIQUE (prediction_id)
);
CREATE INDEX IF NOT EXISTS prediction_evaluations_fixture_idx
  ON prediction_evaluations(fixture_id, evaluated_at DESC);
