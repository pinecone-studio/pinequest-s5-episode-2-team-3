import { afterEach, expect, test, spyOn } from 'bun:test';
import { LocalD1 } from './test-db';
import worker from './src/index.js';
import { validateDeviceStatus } from '../shared/device';
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

const remaining = async (s: ReturnType<typeof setup>, i = 0) => (await s.devices())[i].reading.remainingMl;

test('readings update bottle status only; the base, not the server, creates drinks', async () => {
  const s = setup();
  expect((await (await s.send(reading('r1', 750, 0))).json())).toEqual({ id: 'r1', deviceId: 'bottle-01', outcome: 'baseline' });
  expect((await (await s.send(reading('r2', 500, 10))).json()).outcome).toBe('drink');
  expect((await (await s.send(reading('r3', 700, 20))).json()).outcome).toBe('refill');
  expect(await s.events()).toEqual([]);
  expect(validateDeviceStatus((await s.devices())[0]).reading.remainingMl).toBe(700);
});
test('lifting is unknown, never empty', async () => {
  const s = setup();
  await s.send(reading('full', 750, 0));
  await s.send(reading('lifted', null, 10));
  expect(await remaining(s)).toBeNull();
  await s.send(reading('returned', 500, 20));
  expect(await remaining(s)).toBe(500);
  expect(await s.events()).toEqual([]);
});
test('a retry returns the same answer; a reused ID with different data is refused', async () => {
  const s = setup();
  await s.send(reading('a', 750, 0));
  const sample = reading('b', 500, 10);
  const ack = await (await s.send(sample)).json();
  expect(await (await s.send(sample)).json()).toEqual(ack);
  expect((await s.send({ ...sample, remainingMl: 400 })).status).toBe(409);
  expect(await remaining(s)).toBe(500);
});
test('old or equal timestamps cannot roll back the latest reading', async () => {
  const s = setup();
  await s.send(reading('start', 750, 0));
  await s.send(reading('latest', 500, 20));
  for (const sample of [reading('old', 700, 10), reading('same-time', 300, 20)]) expect((await (await s.send(sample)).json()).outcome).toBe('stale');
  expect(await remaining(s)).toBe(500);
});
test('concurrent duplicates and concurrent different readings keep the newest status', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  const sample = reading('same', 600, 10);
  const responses = await Promise.all([s.send(sample), s.send(sample)]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  await Promise.all([s.send(reading('next-2', 400, 30)), s.send(reading('next-1', 500, 20))]);
  expect(await remaining(s)).toBe(400);
});
test('each device has its own status and credentials', async () => {
  const s = setup();
  await s.send(reading('same-id', 750, 0));
  expect((await s.send(reading('same-id', 600, 0, 'bottle-02'), TOKEN, 'bottle-02')).status).toBe(401);
  expect((await s.send(reading('same-id', 600, 0, 'bottle-02'), TOKEN + '2', 'bottle-02')).status).toBe(200);
  expect((await s.devices()).map((d: any) => [d.reading.deviceId, d.reading.remainingMl])).toEqual([['bottle-01', 750], ['bottle-02', 600]]);
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
});
test('a failed status write rolls back its receipt, allowing the same retry', async () => {
  const s = setup();
  await s.send(reading('base', 750, 0));
  const before = await s.devices();
  s.db.sqlite.exec("CREATE TRIGGER fail_device BEFORE UPDATE ON device_states BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await s.send(reading('sip', 500, 10))).status).toBe(500); } finally { log.mockRestore(); }
  expect(await s.devices()).toEqual(before);
  expect(s.db.sqlite.query("SELECT COUNT(*) AS n FROM device_readings WHERE id = 'sip'").get()).toEqual({ n: 0 });
  s.db.sqlite.exec('DROP TRIGGER fail_device');
  expect((await s.send(reading('sip', 500, 10))).status).toBe(200);
  expect(await remaining(s)).toBe(500);
});
test('status readings never touch the synced log or its revision', async () => {
  const s = setup();
  const before = await (await s.db.call('GET', '/api/sync')).json();
  await s.send(reading('base', 750, 0));
  await s.send(reading('sip', 500, 10));
  expect(await (await s.db.call('GET', '/api/sync')).json()).toEqual(before);
});
