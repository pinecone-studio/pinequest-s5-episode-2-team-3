import { afterEach, expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { LocalStore } from '../src/local-store';
import { SyncClient } from '../src/sync-client';
import { LocalD1 } from '../backend/test-db';
import { defaults } from '../src/data';
import { merge, sameState } from '../shared/sync';
import type { AppState } from '../shared/contracts';
const e = { id: 'event-1', amount: 200, type: 'drink' as const, at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };
const state: AppState = { goal: 2000, mode: 'goal', events: [e] };
const databases: LocalD1[] = [];
function setup(initial: AppState = defaults()) {
  const db = new LocalD1(); databases.push(db);
  const factory = new IDBFactory();
  const name = crypto.randomUUID();
  const local = new LocalStore(name, factory, () => JSON.stringify(initial));
  const client = new SyncClient(local, 'http://localhost', db.fetch);
  const read = async () => (await db.call('GET', '/api/sync')).json();
  return { db, local, client, read, factory, name };
}
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test('legacy data imports once; malformed legacy remains untouched until confirmed recovery', async () => {
  const s = setup(state);
  expect((await s.local.read()).state).toEqual(state);
  expect((await new LocalStore(s.name, s.factory, () => 'corrupted old snapshot').read()).state).toEqual(state);
  let raw = '{broken';
  const corrupt = new LocalStore('bad', new IDBFactory(), () => raw);
  await expect(corrupt.read()).rejects.toThrow();
  expect(raw).toBe('{broken');
  await corrupt.update(record => { record.state = state; }, state);
  expect((await corrupt.read()).state).toEqual(state);
  expect(raw).toBe('{broken');
});
test('no connection means local only: never silently upload records', async () => {
  const s = setup(state);
  await s.client.run();
  expect(s.client.info.phase).toBe('local');
  expect((await s.read()).state.events).toEqual([]);
  expect((await s.local.read()).state.events).toEqual([e]);
});
test('initial merge preserves remote and local entries without overwriting different settings', async () => {
  const s = setup(state);
  const other = { ...e, id: 'server-entry' };
  await s.db.call('POST', '/api/events', other);
  await s.db.call('PUT', '/api/settings', { goal: 1500, mode: 'limit' });
  await s.client.connect();
  expect(s.client.info.phase).toBe('conflict');
  expect(s.client.info.conflicts.map(c => c.key)).toEqual(['settings']);
  expect((await s.read()).state.events).toEqual([other]);
  await s.client.choose({ settings: 'local' });
  expect(s.client.info.phase).toBe('synced');
  expect((await s.read()).state.goal).toBe(2000);
  expect((await s.read()).state.events).toHaveLength(2);
  expect(sameState((await s.local.read()).state, (await s.read()).state)).toBe(true);
});
test('offline add/edit/delete and settings survive restart, then sync once', async () => {
  const s = setup(state);
  await s.client.connect();
  await s.local.update(record => { record.state = { goal: 1600, mode: 'limit', events: [{ ...e, id: 'new', type: 'spill' }] }; });
  const offline = new SyncClient(s.local, 'http://localhost', (async () => { throw new TypeError('Offline'); }) as typeof fetch);
  await offline.run();
  expect(offline.info.phase).toBe('error');
  const reopened = new LocalStore(s.name, s.factory, () => null);
  expect((await reopened.read()).state.events[0].id).toBe('new');
  const restarted = new SyncClient(reopened, 'http://localhost', s.db.fetch);
  await restarted.run();
  expect(restarted.info.phase).toBe('synced');
  expect((await s.read()).state).toEqual((await reopened.read()).state);
  expect((await s.read()).state.events).toEqual([{ ...e, id: 'new', type: 'spill' }]);
});
test('lost acknowledgement replays durable request; newer local edits are not lost', async () => {
  const s = setup(state);
  let lose = true;
  const sender = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await s.db.fetch(input, init);
    if (init?.method === 'POST' && lose) { lose = false; throw new TypeError('Connection lost after commit'); }
    return response;
  }) as typeof fetch;
  const first = new SyncClient(s.local, 'http://localhost', sender);
  await first.connect();
  expect(first.info.phase).toBe('error');
  const attempt = (await s.local.read()).sync!.attempt!;
  expect(attempt).toBeDefined();
  await s.local.update(record => { record.state.events[0].amount = 350; });
  const second = new SyncClient(new LocalStore(s.name, s.factory, () => null), 'http://localhost', s.db.fetch);
  await second.run();
  expect(second.info.phase).toBe('synced');
  expect((await s.read()).state.events).toEqual([{ ...e, amount: 350 }]);
  expect((await s.local.read()).sync!.attempt).toBeUndefined();
});
test('user can keep editing during an in-flight request', async () => {
  const s = setup(state);
  const sender = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') await s.local.update(record => { if (record.state.events.length === 1) record.state.events.push({ ...e, id: 'during-request' }); });
    return s.db.fetch(input, init);
  }) as typeof fetch;
  const client = new SyncClient(s.local, 'http://localhost', sender);
  await client.connect();
  expect(client.info.phase).toBe('synced');
  expect((await s.read()).state.events).toHaveLength(2);
});
test('a remote write just before upload causes a merge, never silent deletion', async () => {
  const s = setup(state);
  let inject = true;
  const sender = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && inject) { inject = false; await s.db.call('POST', '/api/events', { ...e, id: 'simultaneous-device' }); }
    return s.db.fetch(input, init);
  }) as typeof fetch;
  const client = new SyncClient(s.local, 'http://localhost', sender);
  await client.connect();
  expect(client.info.phase).toBe('synced');
  expect((await s.read()).state.events).toHaveLength(2);
});
test('two clients changing the same entry require a reviewed choice', async () => {
  const s = setup(state);
  await s.client.connect();
  await s.local.update(record => { record.state.events[0].amount = 300; });
  await s.db.call('PATCH', `/api/events/${e.id}`, { type: 'spill' });
  await s.client.run();
  expect(s.client.info.phase).toBe('conflict');
  expect((await s.read()).state.events[0].amount).toBe(200);
  // Timer/background runs cannot discard an in-progress conflict review.
  await s.client.run();
  expect(s.client.info.phase).toBe('conflict');
  await s.client.choose({ [e.id]: 'remote' });
  expect(s.client.info.phase).toBe('synced');
  expect((await s.local.read()).state.events[0]).toEqual({ ...e, type: 'spill' });
});
test('a choice reviewed against old data must be reviewed again after either side changes', async () => {
  const s = setup(state);
  await s.client.connect();
  await s.local.update(record => { record.state.events[0].amount = 300; });
  await s.db.call('PATCH', `/api/events/${e.id}`, { type: 'spill' });
  await s.client.run();
  await s.db.call('PATCH', `/api/events/${e.id}`, { amount: 400 });
  await s.client.choose({ [e.id]: 'local' });
  expect(s.client.info.phase).toBe('conflict');
  expect((await s.read()).state.events[0].amount).toBe(400);
});
test('undo after a synced deletion deliberately restores the entry and device identity', async () => {
  const s = setup(state);
  await s.client.connect();
  await s.local.update(record => { record.state.events = []; });
  await s.client.run();
  expect((await s.read()).state.events).toEqual([]);
  await s.local.update(record => { record.state.events = [e]; });
  await s.client.run();
  expect((await s.read()).state.events).toEqual([e]);
});
test('two browser contexts serialize sync; storage transactions do not lose local edits', async () => {
  const s = setup(state);
  const other = new LocalStore(s.name, s.factory, () => null);
  const client2 = new SyncClient(other, 'http://localhost', s.db.fetch);
  await Promise.all([s.client.connect(), client2.connect()]);
  await client2.run();
  expect((await s.read()).state.events).toEqual([e]);
  await Promise.all([
    s.local.update(record => { record.state.events.push({ ...e, id: 'a' }); }),
    other.update(record => { record.state.events.push({ ...e, id: 'b' }); }),
  ]);
  expect((await s.local.read()).state.events).toHaveLength(3);
});
test('failed local validation aborts the entire update and preserves its pending request', async () => {
  const s = setup(state);
  await s.local.update(record => { record.sync = { url: 'http://localhost', base: null, attempt: { id: 'pending', baseRevision: 0, state } }; });
  const before = await s.local.read();
  await expect(s.local.update(record => { record.state.goal = -1; delete record.sync!.attempt; })).rejects.toThrow();
  expect(await s.local.read()).toEqual(before);
});
test('stale page version is rejected inside a serial transaction', async () => {
  const s = setup(state);
  const first = await s.local.read();
  await s.local.update(record => { record.state.goal = 1500; });
  const result = await s.local.update(record => {
    if (record.sequence !== first.sequence) return 'conflict';
    record.state.events = [];
    return 'saved';
  });
  expect(result).toBe('conflict');
  expect((await s.local.read()).state.events).toEqual([e]);
});
test('pause keeps unsent edits and resumes later', async () => {
  const s = setup(state);
  await s.client.connect();
  await s.client.pause();
  await s.local.update(record => { record.state.goal = 1700; });
  await s.client.run();
  expect(s.client.info.phase).toBe('paused');
  expect((await s.read()).state.goal).toBe(2000);
  await s.client.connect();
  expect((await s.read()).state.goal).toBe(1700);
});
test('three-way merge handles deletion vs edit and independently added records', () => {
  const base = state;
  const local = { ...state, events: [] };
  const remote = { ...state, events: [{ ...e, amount: 250 }, { ...e, id: 'new' }] };
  expect(merge(base, local, remote).conflicts.map(c => c.key)).toEqual([e.id]);
  const chosen = merge(base, local, remote, { [e.id]: 'local' });
  expect(chosen.conflicts).toEqual([]);
  expect(chosen.state.events).toEqual([{ ...e, id: 'new' }]);
});

test('fetch transport is called without binding the client as browser fetch receiver', async () => {
  const s = setup(state);
  const transport = (function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    expect(this).toBeUndefined();
    return s.db.fetch(input, init);
  }) as typeof fetch;
  const client = new SyncClient(s.local, 'http://localhost', transport);
  await client.connect();
  expect(client.info.phase).toBe('synced');
});
