-- Additive migration: existing IDs, amounts, settings and dates stay unchanged.
ALTER TABLE events ADD COLUMN device_id TEXT;

-- Original accepted payloads survive user edits and deletion, so retries cannot undo them.
CREATE TABLE event_receipts (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
INSERT INTO event_receipts (id, payload)
SELECT id, json_object('id', id, 'amount', amount, 'type', type, 'at', at) FROM events;

-- Keep receipts consistent even if an older Worker briefly handles a write during rollout.
CREATE TRIGGER events_receipt_insert AFTER INSERT ON events BEGIN
  INSERT INTO event_receipts (id, payload)
  VALUES (NEW.id, CASE WHEN NEW.device_id IS NULL
    THEN json_object('id', NEW.id, 'amount', NEW.amount, 'type', NEW.type, 'at', NEW.at)
    ELSE json_object('id', NEW.id, 'amount', NEW.amount, 'type', NEW.type, 'at', NEW.at, 'deviceId', NEW.device_id)
  END) ON CONFLICT(id) DO NOTHING;
END;
CREATE TRIGGER events_receipt_delete AFTER DELETE ON events BEGIN
  UPDATE event_receipts SET deleted = 1 WHERE id = OLD.id;
END;
CREATE TRIGGER events_prevent_replay BEFORE INSERT ON events
WHEN EXISTS (SELECT 1 FROM event_receipts WHERE id = NEW.id AND deleted = 1)
BEGIN
  SELECT RAISE(ABORT, 'Deleted event IDs cannot be reused');
END;
