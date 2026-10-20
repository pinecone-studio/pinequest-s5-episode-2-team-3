-- Separate sensor state from user-editable events; app sync must never reset the weight baseline.
CREATE TABLE device_states (
  device_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision > 0),
  reading TEXT NOT NULL,
  received_at TEXT NOT NULL,
  baseline_ml INTEGER,
  last_stable_at TEXT,
  outcome TEXT NOT NULL
);
CREATE TABLE device_readings (
  device_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  outcome TEXT NOT NULL,
  event_id TEXT,
  processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0, 1)),
  PRIMARY KEY(device_id, id)
);
