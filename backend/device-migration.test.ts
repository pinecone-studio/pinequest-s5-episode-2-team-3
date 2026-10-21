import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';

const migration = (name: string) => readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
let db: Database;
beforeEach(() => {
  db = new Database(':memory:');
  for (const name of ['0001_settings.sql', '0002_events.sql', '0003_event_identity.sql']) db.exec(migration(name));
});
afterEach(() => db.close());

test('device ingestion migration leaves existing log, settings and receipts intact', () => {
  db.query('INSERT INTO events (id, amount, type, at) VALUES (?, ?, ?, ?)').run('legacy-1', 100, 'drink', '2026-10-20T04:00:00.000Z');
  db.query('UPDATE settings SET goal = 1600, mode = ? WHERE id = 1').run('limit');
  const before = {
    events: db.query('SELECT * FROM events').all(),
    settings: db.query('SELECT * FROM settings').all(),
    receipts: db.query('SELECT * FROM event_receipts').all(),
  };
  db.exec(migration('0005_device_readings.sql'));
  expect(db.query('SELECT * FROM events').all()).toEqual(before.events);
  expect(db.query('SELECT * FROM settings').all()).toEqual(before.settings);
  expect(db.query('SELECT * FROM event_receipts').all()).toEqual(before.receipts);
  expect(db.query('SELECT * FROM device_states').all()).toEqual([]);
  expect(db.query('SELECT * FROM device_readings').all()).toEqual([]);
});

test('a reading ID is stored once per device, and baselines need a positive revision', () => {
  db.exec(migration('0005_device_readings.sql'));
  const add = (device: string, id: string) => db.query("INSERT INTO device_readings (device_id, id, payload, outcome) VALUES (?, ?, '{}', 'baseline')").run(device, id);
  add('bottle-01', 'r1');
  add('bottle-02', 'r1');
  expect(() => add('bottle-01', 'r1')).toThrow();
  expect(() => db.query("INSERT INTO device_states (device_id, revision, reading, received_at, outcome) VALUES ('b', 0, '{}', 'now', 'baseline')").run()).toThrow();
});
