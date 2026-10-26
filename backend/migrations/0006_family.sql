-- Family leaderboard: a family is everyone using the same base (base_id = the base's device ID).
-- A member is one phone; member_days keeps that phone's own total for each local day.
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX members_base ON members(base_id);
CREATE TABLE member_days (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  drink_ml INTEGER NOT NULL CHECK(drink_ml >= 0),
  goal_ml INTEGER NOT NULL CHECK(goal_ml > 0),
  mode TEXT NOT NULL CHECK(mode IN ('goal', 'limit')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(member_id, day)
);
