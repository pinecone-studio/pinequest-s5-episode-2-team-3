CREATE TABLE events (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 5000),
  type TEXT NOT NULL CHECK (type IN ('drink', 'spill', 'pending')),
  at TEXT NOT NULL
);
CREATE INDEX events_at ON events (at);
