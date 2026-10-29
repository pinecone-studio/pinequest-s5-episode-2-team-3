-- Accounts, so a person signs in again on a new or reset phone and gets their own data back.
-- Either a password (PBKDF2-SHA-256, its salt beside it) or a Google account (its stable `sub`), or both.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL
);
-- A signed-in phone holds a random token; only its SHA-256 is kept here.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);
-- The phone's whole state (water log, profile, settings) as one JSON snapshot, the newest wins.
CREATE TABLE account_data (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
