import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { validateEntry } from '../shared/contracts';

const migration = (name: string) => readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
let db: Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(migration('0001_settings.sql'));
  db.exec(migration('0002_events.sql'));
});
afterEach(() => db.close());
const entry = { id: 'legacy-1', amount: 100, type: 'drink', at: '2026-10-20T04:00:00.000Z' };
const insert = () => db.query('INSERT INTO events (id, amount, type, at) VALUES (?, ?, ?, ?)').run(entry.id, entry.amount, entry.type, entry.at);

test('existing entries and settings survive the additive migration', () => {
  insert();
  db.exec(migration('0003_event_identity.sql'));
  const row = db.query('SELECT id, amount, type, at FROM events').get();
  expect(row).toEqual(entry);
  expect(db.query('SELECT goal, mode FROM settings').get()).toEqual({ goal: 2000, mode: 'goal' });
  expect(db.query('SELECT payload, deleted FROM event_receipts').get()).toEqual({ payload: JSON.stringify(validateEntry(entry)), deleted: 0 });
});

test('older inserts/deletes also create receipts and prevent deleted ID reuse', () => {
  db.exec(migration('0003_event_identity.sql'));
  insert();
  expect(db.query('SELECT id FROM event_receipts').get()).toEqual({ id: entry.id });
  db.query('DELETE FROM events WHERE id = ?').run(entry.id);
  expect(db.query('SELECT deleted FROM event_receipts').get()).toEqual({ deleted: 1 });
  expect(insert).toThrow();
});

test('device identity is included in original payloads and user edits leave them unchanged', () => {
  db.exec(migration('0003_event_identity.sql'));
  db.query('INSERT INTO events (id, amount, type, at, device_id) VALUES (?, ?, ?, ?, ?)').run(entry.id, entry.amount, entry.type, entry.at, 'bottle-01');
  db.query('UPDATE events SET type = ? WHERE id = ?').run('spill', entry.id);
  expect(db.query('SELECT payload FROM event_receipts').get()).toEqual({ payload: JSON.stringify({ ...entry, deviceId: 'bottle-01' }) });
});

test('sync migration preserves existing history, identity receipts and settings', () => {
  insert();
  db.query('UPDATE settings SET goal = 1500, mode = ? WHERE id = 1').run('limit');
  db.exec(migration('0003_event_identity.sql'));
  const receipt = db.query('SELECT * FROM event_receipts').all();
  db.exec(migration('0004_app_sync.sql'));
  expect(db.query('SELECT id, amount, type, at FROM events').get()).toEqual(entry);
  expect(db.query('SELECT * FROM event_receipts').all()).toEqual(receipt);
  expect(db.query('SELECT goal, mode FROM settings').get()).toEqual({ goal: 1500, mode: 'limit' });
  expect(db.query('SELECT revision FROM sync_clock').get()).toEqual({ revision: 0 });
});

test('every event or settings write advances the sync revision; no-op updates do not', () => {
  db.exec(migration('0003_event_identity.sql'));
  db.exec(migration('0004_app_sync.sql'));
  const revision = () => (db.query('SELECT revision FROM sync_clock').get() as { revision: number }).revision;
  insert();
  db.query('UPDATE events SET type = ? WHERE id = ?').run('spill', entry.id);
  db.query('UPDATE events SET type = ? WHERE id = ?').run('spill', entry.id);
  db.query('UPDATE settings SET goal = 1500 WHERE id = 1').run();
  db.query('DELETE FROM events').run();
  expect(revision()).toBe(4);
});
