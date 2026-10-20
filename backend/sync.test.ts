import { afterEach, expect, test, spyOn } from 'bun:test';
import { LocalD1 } from './test-db';
const databases: LocalD1[] = [];
const database = () => { const db = new LocalD1(); databases.push(db); return db; };
afterEach(() => { databases.splice(0).forEach(db => db.sqlite.close()); });
const e = { id: 'event-1', amount: 200, type: 'drink', at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };
const state = { goal: 1800, mode: 'goal', events: [e] };
const read = async (db: LocalD1) => (await db.call('GET', '/api/sync')).json();

test('snapshot migration preserves legacy data and revision follows every writer', async () => {
  const db = database();
  expect(await read(db)).toEqual({ revision: 0, state: { goal: 2000, mode: 'goal', events: [] } });
  await db.call('POST', '/api/events', e);
  const first = await read(db);
  expect(first.revision).toBe(1);
  expect(first.state.events).toEqual([e]);
  await db.call('PATCH', `/api/events/${e.id}`, { type: 'spill' });
  await db.call('PUT', '/api/settings', { goal: 1500, mode: 'limit' });
  await db.call('DELETE', `/api/events/${e.id}`);
  expect((await read(db)).revision).toBe(4);
});
test('atomic sync accepts one retry, preserves device identity, and rejects stale snapshots', async () => {
  const db = database();
  const input = { id: 'change-1', baseRevision: 0, state };
  const response = await db.call('POST', '/api/sync', input);
  expect(response.status).toBe(200);
  const ack = await response.json();
  expect(await (await db.call('POST', '/api/sync', input)).json()).toEqual(ack);
  expect((await read(db)).state).toEqual(state);
  expect((await read(db)).revision).toBe(ack.revision);
  expect((await db.call('POST', '/api/sync', { ...input, state: { ...state, goal: 2000 } })).status).toBe(409);
  expect((await db.call('POST', '/api/sync', { ...input, id: 'stale' })).status).toBe(409);
  expect((await read(db)).state).toEqual(state);
});
test('deletion plus explicit undo works; raw device retries still never resurrect it', async () => {
  const db = database();
  await db.call('POST', '/api/events', e);
  let current = await read(db);
  const deleted = { ...current.state, events: [] };
  await db.call('POST', '/api/sync', { id: 'delete', baseRevision: current.revision, state: deleted });
  expect((await db.call('POST', '/api/events', e)).status).toBe(204);
  current = await read(db);
  expect((await db.call('POST', '/api/sync', { id: 'undo', baseRevision: current.revision, state })).status).toBe(200);
  expect((await read(db)).state.events).toEqual([e]);
  await db.call('PATCH', `/api/events/${e.id}`, { type: 'spill' });
  expect((await (await db.call('POST', '/api/events', e)).json()).type).toBe('spill');
});
test('failed sync rolls back settings, deleted events, revision and receipt together', async () => {
  const db = database();
  await db.call('POST', '/api/events', e);
  const before = await read(db);
  db.sqlite.exec("CREATE TRIGGER sync_failure BEFORE INSERT ON events WHEN NEW.id = 'fail' BEGIN SELECT RAISE(ABORT, 'failure'); END;");
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await db.call('POST', '/api/sync', { id: 'batch', baseRevision: before.revision, state: { ...state, events: [{ ...e, id: 'fail' }] } })).status).toBe(500);
    expect(await read(db)).toEqual(before);
    expect(db.sqlite.query('SELECT COUNT(*) AS count FROM sync_batches').get()).toEqual({ count: 0 });
  } finally { log.mockRestore(); }
});
test('invalid snapshots and excessive bodies do not mutate data', async () => {
  const db = database();
  for (const input of [null, {}, { id: 'bad', baseRevision: -1, state }, { id: 'bad', baseRevision: 0, state: { ...state, events: [e, e] } }]) {
    expect((await db.call('POST', '/api/sync', input)).status).toBe(400);
  }
  expect((await db.fetch('http://localhost/api/sync', { method: 'POST', body: ' '.repeat(5_000_001) })).status).toBe(413);
  expect((await read(db)).revision).toBe(0);
});
