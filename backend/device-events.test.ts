import { afterEach, expect, test } from 'bun:test';
import { LocalD1 } from './test-db';
import worker from './src/index.js';

// Public synthetic fixture, not a real deployed device credential.
const TOKEN = 'synthetic-local-device-test-token-123456789';
const databases: LocalD1[] = [];
const at = new Date(Date.now() - 60_000).toISOString();
const drink = { version: 1, id: 'bottle-01-e-1', deviceId: 'bottle-01', at, amount: 250 };
function setup(tokens: Record<string, string> | null = { 'bottle-01': TOKEN, 'bottle-02': TOKEN + '2' }) {
  const db = new LocalD1(); databases.push(db);
  const env = { DB: db, ...(tokens ? { DEVICE_TOKENS: JSON.stringify(tokens) } : {}) };
  const send = (body: unknown, token = TOKEN, id = 'bottle-01') => worker.fetch(new Request(`http://localhost/api/devices/${id}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env);
  const events = async () => (await db.call('GET', '/api/events')).json();
  return { db, send, events };
}
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test('a drink from the base is stored once as a drink with its device identity', async () => {
  const s = setup();
  const first = await s.send(drink);
  expect(first.status).toBe(201);
  const stored = { id: drink.id, amount: 250, type: 'drink', at, deviceId: 'bottle-01' };
  expect(await first.json()).toEqual(stored);
  const retry = await s.send(drink);
  expect(retry.status).toBe(200);
  expect(await s.events()).toEqual([stored]);
});

test('simultaneous retries still add one entry', async () => {
  const s = setup();
  const statuses = (await Promise.all([s.send(drink), s.send(drink), s.send(drink)])).map(r => r.status).sort();
  expect(statuses).toEqual([200, 200, 201]);
  expect(await s.events()).toHaveLength(1);
});

test('retry keeps the user spill correction and never resurrects a deleted drink', async () => {
  const s = setup();
  await s.send(drink);
  await s.db.call('PATCH', `/api/events/${drink.id}`, { type: 'spill' });
  expect((await (await s.send(drink)).json()).type).toBe('spill');
  await s.db.call('DELETE', `/api/events/${drink.id}`);
  expect((await s.send(drink)).status).toBe(204);
  expect(await s.events()).toEqual([]);
});

test('reusing an ID for a different amount is refused', async () => {
  const s = setup();
  await s.send(drink);
  expect((await s.send({ ...drink, amount: 300 })).status).toBe(409);
  expect((await s.events())[0].amount).toBe(250);
});

test('wrong, missing or another bottle\'s token is refused without storing anything', async () => {
  const s = setup();
  expect((await s.send(drink, 'x'.repeat(40))).status).toBe(401);
  expect((await s.send(drink, TOKEN + '2')).status).toBe(401);
  expect((await s.send({ ...drink, deviceId: 'bottle-02', id: 'bottle-02-e-1' }, TOKEN, 'bottle-02')).status).toBe(401);
  expect((await setup(null).send(drink)).status).toBe(503);
  expect(await s.events()).toEqual([]);
});

test('invalid drinks are rejected: wrong device, type, amount, clock or version', async () => {
  const s = setup();
  for (const body of [
    { ...drink, deviceId: 'bottle-02' },
    { ...drink, type: 'spill' },
    { ...drink, amount: 0 },
    { ...drink, amount: 5001 },
    { ...drink, at: new Date(Date.now() + 10 * 60_000).toISOString() },
    { ...drink, version: 2 },
    { ...drink, id: 'bad id' },
  ]) expect((await s.send(body)).status).toBe(400);
  expect(await s.events()).toEqual([]);
});

test('base drinks reach the app through sync and advance its revision', async () => {
  const s = setup();
  const before = await (await s.db.call('GET', '/api/sync')).json();
  await s.send(drink);
  const after = await (await s.db.call('GET', '/api/sync')).json();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.state.events).toEqual([{ id: drink.id, amount: 250, type: 'drink', at, deviceId: 'bottle-01' }]);
});
