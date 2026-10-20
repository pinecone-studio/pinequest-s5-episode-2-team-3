-- Revision covers ALL writers, including older event/settings routes and device ingestion.
CREATE TABLE sync_clock (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
INSERT INTO sync_clock VALUES (1, 0);
CREATE TABLE sync_batches (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0, 1))
);
CREATE TRIGGER sync_event_insert AFTER INSERT ON events BEGIN
  UPDATE sync_clock SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER sync_event_update AFTER UPDATE ON events
WHEN OLD.amount IS NOT NEW.amount OR OLD.type IS NOT NEW.type OR OLD.at IS NOT NEW.at OR OLD.device_id IS NOT NEW.device_id BEGIN
  UPDATE sync_clock SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER sync_event_delete AFTER DELETE ON events BEGIN
  UPDATE sync_clock SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER sync_settings_update AFTER UPDATE ON settings
WHEN OLD.goal IS NOT NEW.goal OR OLD.mode IS NOT NEW.mode BEGIN
  UPDATE sync_clock SET revision = revision + 1 WHERE id = 1;
END;
