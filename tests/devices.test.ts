import { afterEach, expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { LocalStore } from '../src/local-store';
import { DeviceClient } from '../src/device-client';
import { SyncClient } from '../src/sync-client';
import { LocalD1 } from '../backend/test-db';
import worker from '../backend/src/index.js';
import { isFresh, validateDeviceStatus, validateDeviceCache, type DeviceStatus } from '../shared/device';

const databases: LocalD1[] = [];
const TOKEN = 'synthetic-device-client-test-credential-123456789';
function status(deviceId = 'bottle-01', remainingMl: number | null = 500, age = 0): DeviceStatus {
  const at = new Date(Date.now() - age).toISOString();
  return validateDeviceStatus({ reading: { version: 1, deviceId, id: `${deviceId}-r1`, capacityMl: 750, at, stable: remainingMl !== null, remainingMl }, receivedAt: at, outcome: remainingMl === null ? 'unstable' : 'baseline' });
}
function localStore() { return new LocalStore(crypto.randomUUID(), new IDBFactory(), () => null); }
function transport(devices: unknown) {
  return (async function(this: unknown) {
    expect(this).toBeUndefined();
    return new Response(JSON.stringify(devices), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}
async function connected(local: LocalStore) { await local.update(record => { record.sync = { url: 'http://localhost', base: null }; }); }
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test('device polling waits for connection consent and stops when sync is paused', async () => {
  const local = localStore();
  let calls = 0;
  const client = new DeviceClient(local, (async () => { calls++; return new Response('[]'); }) as typeof fetch);
  await client.refresh();
  expect(client.phase).toBe('local');
  expect(calls).toBe(0);
  await connected(local);
  await local.update(record => { record.sync!.paused = true; });
  await client.refresh();
  expect(client.phase).toBe('paused');
  expect(calls).toBe(0);
});
test('fetch caches validated device status without changing the app snapshot version', async () => {
  const local = localStore();
  await connected(local);
  const before = await local.read();
  const sample = status();
  const client = new DeviceClient(local, transport([sample]));
  await client.refresh();
  await client.select('bottle-01');
  expect(client.selected).toEqual(sample);
  expect(client.online).toBe(true);
  expect((await local.read()).sequence).toBe(before.sequence);
  expect((await local.read()).state).toEqual(before.state);
  const restarted = new DeviceClient(local, transport([]));
  await restarted.readCache();
  expect(restarted.selected).toEqual(sample);
  // A cached reading alone cannot claim that a real bottle is connected.
  expect(restarted.online).toBe(false);
});
test('offline or invalid server status preserves the previous cached measurement', async () => {
  const local = localStore();
  await connected(local);
  const cached = status();
  const first = new DeviceClient(local, transport([cached]));
  await first.refresh(); await first.select('bottle-01');
  const offline = new DeviceClient(local, (async () => { throw new TypeError('Offline'); }) as typeof fetch);
  await offline.refresh();
  expect(offline.phase).toBe('error');
  expect(offline.selected).toEqual(cached);
  expect(offline.online).toBe(false);
  const invalid = new DeviceClient(local, transport([{ ...cached, reading: { ...cached.reading, remainingMl: -1 } }]));
  await invalid.refresh();
  expect(invalid.phase).toBe('error');
  expect(invalid.selected).toEqual(cached);
});
test('freshness checks both measurement time and receive time, including offline backlog', () => {
  expect(isFresh(status())).toBe(true);
  const old = status('bottle-01', 500, 61_000);
  expect(isFresh(old)).toBe(false);
  expect(isFresh({ ...old, receivedAt: new Date().toISOString() })).toBe(false);
  expect(isFresh({ ...status(), receivedAt: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
  expect(() => validateDeviceCache({ selectedId: null, devices: [status(), status()] })).toThrow();
});
test('unstable status is explicitly null rather than a claimed empty bottle', async () => {
  const local = localStore(); await connected(local);
  const client = new DeviceClient(local, transport([status('bottle-01', null)]));
  await client.refresh(); await client.select('bottle-01');
  expect(client.online).toBe(true);
  expect(client.selected!.reading.remainingMl).toBeNull();
  expect(client.selected!.reading.stable).toBe(false);
});
test('refresh in flight preserves a newer selection and pausing discards its response', async () => {
  const local = localStore(); await connected(local);
  const all = [status(), status('bottle-02')];
  const first = new DeviceClient(local, transport(all));
  await first.refresh(); await first.select('bottle-01');
  let release!: (response: Response) => void;
  let requested!: () => void;
  const pending = new Promise<void>(resolve => { requested = resolve; });
  const delayed = new DeviceClient(local, (() => { requested(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch);
  const refresh = delayed.refresh();
  await pending;
  await delayed.select('bottle-02');
  release(new Response(JSON.stringify(all)));
  await refresh;
  expect(delayed.cache.selectedId).toBe('bottle-02');
  const pausedClient = new DeviceClient(local, (async () => {
    await local.update(record => { record.sync!.paused = true; });
    return new Response(JSON.stringify([]));
  }) as typeof fetch);
  await pausedClient.refresh();
  expect(pausedClient.phase).toBe('paused');
  expect(pausedClient.cache.devices).toHaveLength(2);
});
test('base status + base drink → sync → cached bottle status; spill correction survives a retry', async () => {
  const db = new LocalD1(); databases.push(db);
  const local = localStore();
  const sync = new SyncClient(local, 'http://localhost', db.fetch);
  await sync.connect();
  const env = { DB: db, DEVICE_TOKENS: JSON.stringify({ 'bottle-01': TOKEN }) };
  const post = async (path: 'readings' | 'events', body: unknown) => {
    const response = await worker.fetch(new Request(`http://localhost/api/devices/bottle-01/${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body),
    }), env);
    expect(response.status).toBeLessThan(300);
  };
  const at = (time: number) => new Date(Date.now() - 10_000 + time).toISOString();
  const reading = (id: string, remainingMl: number, time: number) => post('readings', { ...status().reading, id, at: at(time), remainingMl, stable: true });
  const drink = { version: 1, id: 'bottle-01-e-1', deviceId: 'bottle-01', at: at(1000), amount: 250 };
  const client = new DeviceClient(local, db.fetch, () => {}, () => sync.run());
  await reading('baseline', 750, 0);
  await reading('sip', 500, 1000);
  await post('events', drink);
  await client.refresh(); await client.select('bottle-01');
  expect(client.selected!.reading.remainingMl).toBe(500);
  const entry = { id: drink.id, amount: 250, type: 'drink', at: drink.at, deviceId: 'bottle-01' };
  expect((await local.read()).state.events).toEqual([entry]);
  await local.update(record => { record.state.events[0].type = 'spill'; });
  await sync.run();
  await post('events', drink);
  await reading('refill', 750, 2000);
  await client.refresh();
  expect(client.selected!.reading.remainingMl).toBe(750);
  expect((await local.read()).state.events).toEqual([{ ...entry, type: 'spill' }]);
});
