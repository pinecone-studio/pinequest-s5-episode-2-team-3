import { afterEach, expect, test, spyOn } from 'bun:test';
import { LocalD1 } from './test-db';
import worker from './src/index.js';
import { classify, MAX_STABLE_GAP_MS, validateDeviceStatus } from '../shared/device';
import type { DeviceReading } from '../shared/contracts';

// Public synthetic fixture, not a real deployed device credential.
const TOKEN = 'synthetic-local-device-test-token-123456789';
const databases: LocalD1[] = [];
const origin = Date.now() - 120_000;
function reading(id: string, remainingMl: number | null, seconds: number, deviceId = 'bottle-01'): DeviceReading {
  const base = { version: 1 as const, id, deviceId, at: new Date(origin + seconds * 1000).toISOString(), capacityMl: 750 };
  return remainingMl === null ? { ...base, stable: false, remainingMl: null } : { ...base, stable: true, remainingMl };
}
function setup() {
  const db = new LocalD1(); databases.push(db);
  const env = { DB: db, DEVICE_TOKENS: JSON.stringify({ 'bottle-01': TOKEN, 'bottle-02': TOKEN + '2' }) };
  const send = (body: unknown, token = TOKEN, id = 'bottle-01') => worker.fetch(new Request(`http://localhost/api/devices/${id}/readings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env);
  const events = async () => (await db.call('GET', '/api/events')).json();
  const devices = async () => (await db.call('GET', '/api/devices')).json();
  return { db, env, send, events, devices };
}
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test('first measurement is a baseline; stable decreases create drink, refill never adds intake', async () => {
  const s = setup();
  expect((await (await s.send(reading('r1', 750, 0))).json()).outcome).toBe('baseline');
  expect(await s.events()).toEqual([]);
  const ack = await (await s.send(reading('r2', 500, 10))).json();
  expect(ack.outcome).toBe('drink');
  expect(ack.eventId).toMatch(/^dev-[a-f0-9]{60}$/);
  expect(await s.events()).toEqual([{ id: ack.eventId, amount: 250, type: 'drink', at: reading('r2', 500, 10).at, deviceId: 'bottle-01' }]);
  expect((await (await s.send(reading('r3', 700, 20))).json()).outcome).toBe('refill');
  expect(await s.events()).toHaveLength(1);
  expect(validateDeviceStatus((await s.devices())[0]).reading.remainingMl).toBe(700);
});
test('lifting is unknown, never empty; a stable zero counts the remaining drink', async () => {
  const s = setup();
  await s.send(reading('full', 750, 0));
  await s.send(reading('lifted', null, 10));
  expect(await s.events()).toEqual([]);
  expect((await s.devices())[0].reading.remainingMl).toBeNull();
  await s.send(reading('returned', 500, 20));
  await s.send(reading('empty', 0, 30));
  expect((await s.events()).map((e: any) => e.amount).sort((a: number, b: number) => a - b)).toEqual([250, 500]);
});
test('retry never duplicates or overwrites corrections, and never resurrects deleted intake', async () => {
  const s = setup();
  await s.send(reading('a', 750, 0));
  const sample = reading('b', 500, 10);
  const ack = await (await s.send(sample)).json();
  await s.db.call('PATCH', `/api/events/${ack.eventId}`, { type: 'spill' });
  expect(await (await s.send(sample)).json()).toEqual(ack);
  expect((await s.events())[0].type).toBe('spill');
  await s.db.call('DELETE', `/api/events/${ack.eventId}`);
  expect(await (await s.send(sample)).json()).toEqual(ack);
  expect(await s.events()).toEqual([]);
  expect((await s.send({ ...sample, remainingMl: 400 })).status).toBe(409);
  expect((await s.devices())[0].reading.remainingMl).toBe(500);
});
test('old or equal timestamps cannot roll back the latest reading', async () => {
  const s = setup();
  await s.send(reading('start', 750, 0));
  await s.send(reading('latest', 500, 20));
  for (const sample of [reading('old', 700, 10), reading('same-time', 300, 20)]) expect((await (await s.send(sample)).json()).outcome).toBe('stale');
  expect((await s.devices())[0].reading.remainingMl).toBe(500);
  expect(await s.events()).toHaveLength(1);
});
test('small stable jitter is ignored; small consecutive drinks accumulate against one anchor', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  for (const [id, value, time] of [['n1', 747, 10], ['n2', 750, 20], ['n3', 745, 30]] as const) {
    expect((await (await s.send(reading(id, value, time))).json()).outcome).toBe('noise');
  }
  expect(await s.events()).toEqual([]);
  await s.send(reading('small-sip', 738, 40));
  expect((await s.events())[0].amount).toBe(12);
});
test('long stable gap and capacity change resync without inventing drinks', async () => {
  const s = setup();
  await s.send(reading('start', 750, 0));
  const later = { ...reading('after-gap', 200, 1), at: new Date(origin + MAX_STABLE_GAP_MS + 1).toISOString() };
  expect(classify({ reading: reading('start', 750, 0), baselineMl: 750, lastStableAt: reading('start', 750, 0).at }, later).outcome).toBe('resync');
  // Historical times keep this synthetic long gap outside the future-clock rejection window.
  const first = { ...reading('old-start', 700, 1), at: new Date(origin - MAX_STABLE_GAP_MS).toISOString() };
  const other = setup();
  await other.send(first);
  expect((await (await other.send(reading('after-gap', 200, 10))).json()).outcome).toBe('resync');
  expect((await (await other.send({ ...reading('capacity', 100, 20), capacityMl: 500 })).json()).outcome).toBe('baseline');
  expect(await other.events()).toEqual([]);
});
test('continuous unchanged readings keep the baseline valid beyond five minutes', () => {
  let current = { reading: reading('first', 750, 0), baselineMl: 750, lastStableAt: reading('first', 750, 0).at };
  for (let seconds = 30; seconds <= 600; seconds += 30) current = classify(current, reading(`r-${seconds}`, 750, seconds)).next;
  expect(classify(current, reading('drink', 500, 610)).amount).toBe(250);
});
test('concurrent duplicates and concurrent different readings preserve one serial baseline', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  const sample = reading('same', 600, 10);
  const responses = await Promise.all([s.send(sample), s.send(sample)]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  await Promise.all([s.send(reading('next-1', 500, 20)), s.send(reading('next-2', 400, 30))]);
  expect((await s.devices())[0].reading.remainingMl).toBe(400);
  expect((await s.events()).reduce((sum: number, e: any) => sum + e.amount, 0)).toBe(350);
});
test('each device has its own baseline and credentials', async () => {
  const s = setup();
  await s.send(reading('same-id', 750, 0));
  expect((await s.send(reading('same-id', 600, 0, 'bottle-02'), TOKEN, 'bottle-02')).status).toBe(401);
  await s.send(reading('same-id', 600, 0, 'bottle-02'), TOKEN + '2', 'bottle-02');
  await s.send(reading('sip', 500, 10, 'bottle-02'), TOKEN + '2', 'bottle-02');
  expect((await s.events())[0]).toMatchObject({ deviceId: 'bottle-02', amount: 100 });
  expect(await s.devices()).toHaveLength(2);
  expect(JSON.stringify(await s.devices())).not.toContain(TOKEN);
});
test('authentication and invalid data fail without touching state', async () => {
  const s = setup();
  expect((await s.send(reading('id', 500, 0), 'wrong')).status).toBe(401);
  for (const bad of [null, { ...reading('bad', 500, 0), stable: false }, reading('wrong-device', 500, 0, 'bottle-02'), { ...reading('future', 500, 0), at: new Date(Date.now() + 10 * 60_000).toISOString() }]) {
    expect((await s.send(bad)).status).toBe(400);
  }
  const large = new Request('http://localhost/api/devices/bottle-01/readings', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: ' '.repeat(4097) });
  expect((await worker.fetch(large, s.env)).status).toBe(413);
  expect((await worker.fetch(new Request('http://localhost/api/devices/bottle-01/readings', { method: 'POST' }), { DB: s.db })).status).toBe(503);
  expect(await s.devices()).toEqual([]);
  expect(await s.events()).toEqual([]);
});
test('failed event insertion rolls back receipt and weight baseline, allowing a correct retry', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  const before = await s.devices();
  s.db.sqlite.exec("CREATE TRIGGER fail_device BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await s.send(reading('sip', 500, 10))).status).toBe(500); } finally { log.mockRestore(); }
  expect(await s.devices()).toEqual(before);
  expect(s.db.sqlite.query("SELECT COUNT(*) AS n FROM device_readings WHERE id = 'sip'").get()).toEqual({ n: 0 });
  s.db.sqlite.exec('DROP TRIGGER fail_device');
  expect((await s.send(reading('sip', 500, 10))).status).toBe(200);
  expect((await s.events())[0].amount).toBe(250);
});
test('app snapshot cannot reset hardware baseline; device drink changes the shared sync revision', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  const before = await (await s.db.call('GET', '/api/sync')).json();
  await s.send(reading('sip', 500, 10));
  const after = await (await s.db.call('GET', '/api/sync')).json();
  expect(after.revision).toBeGreaterThan(before.revision);
  expect((await s.db.call('POST', '/api/sync', { id: 'stale-app', baseRevision: before.revision, state: before.state })).status).toBe(409);
  await s.db.call('POST', '/api/sync', { id: 'intentional-delete', baseRevision: after.revision, state: before.state });
  await s.send(reading('next-sip', 450, 20));
  expect((await s.events()).map((e: any) => e.amount)).toEqual([50]);
});
