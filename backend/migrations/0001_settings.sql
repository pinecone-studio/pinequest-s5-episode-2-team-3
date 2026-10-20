CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  goal INTEGER NOT NULL DEFAULT 2000 CHECK (goal BETWEEN 50 AND 10000),
  mode TEXT NOT NULL DEFAULT 'goal' CHECK (mode IN ('goal', 'limit'))
);
INSERT INTO settings (id) VALUES (1);
