import { beforeEach, describe, expect, test, spyOn } from 'bun:test';
import { LocalD1 } from './test-db';
import { validateEntry, validateState } from '../shared/contracts';

const event = { id: 'bottle-01-event-1', amount: 200, type: 'drink', at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };
let db: LocalD1;
beforeEach(() => {
  db?.sqlite.close();
  db = new LocalD1();
});
const call = (method: string, path: string, body?: unknown) => db.call(method, path, body);

describe('event API', () => {
  test('identical retries add only one event, including simultaneous requests', async () => {
    const responses = await Promise.all([call('POST', '/api/events', event), call('POST', '/api/events', event)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const state = await (await call('GET', '/api/state')).json();
    expect(state.events).toEqual([event]);
    expect(validateState(state)).toEqual(state);
  });
  test('reusing an ID with different data returns 409 and preserves the original', async () => {
    await call('POST', '/api/events', event);
    expect((await call('POST', '/api/events', { ...event, amount: 300 })).status).toBe(409);
    expect((await call('POST', '/api/events', { ...event, deviceId: 'bottle-02' })).status).toBe(409);
    expect(await (await call('GET', '/api/events')).json()).toEqual([event]);
  });
  test('device retries do not overwrite user corrections or resurrect deleted entries', async () => {
    await call('POST', '/api/events', event);
    const edited = { ...event, type: 'spill', amount: 150 };
    expect(await (await call('PATCH', `/api/events/${event.id}`, { type: 'spill', amount: 150 })).json()).toEqual(edited);
    expect(await (await call('POST', '/api/events', event)).json()).toEqual(edited);
    expect((await call('DELETE', `/api/events/${event.id}`)).status).toBe(204);
    expect((await call('POST', '/api/events', event)).status).toBe(204);
    expect(await (await call('GET', '/api/events')).json()).toEqual([]);
  });
  test('invalid events are rejected without creating a receipt; manual entries keep working', async () => {
    for (const body of [{ ...event, id: undefined }, { ...event, amount: 0 }, { ...event, type: 'refill' }, { ...event, at: 'bad-date' }, null]) {
      expect((await call('POST', '/api/events', body)).status).toBe(400);
    }
    expect(db.sqlite.query('SELECT COUNT(*) AS count FROM event_receipts').get()).toEqual({ count: 0 });
    const response = await call('POST', '/api/events', { amount: 250, type: 'drink', at: event.at });
    expect(response.status).toBe(201);
    expect(validateEntry(await response.json()).deviceId).toBeUndefined();
  });
  test('a failed insert rolls back its receipt too', async () => {
    db.sqlite.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await call('POST', '/api/events', event)).status).toBe(500);
      expect(db.sqlite.query('SELECT COUNT(*) AS count FROM event_receipts').get()).toEqual({ count: 0 });
    } finally { error.mockRestore(); }
  });
  test('settings and health retain their fields', async () => {
    expect((await call('PUT', '/api/settings', { goal: 1500, mode: 'limit' })).status).toBe(200);
    expect(await (await call('GET', '/api/settings')).json()).toEqual({ goal: 1500, mode: 'limit' });
    expect((await call('PUT', '/api/settings', { goal: 0, mode: 'goal' })).status).toBe(400);
    expect(await (await call('GET', '/api/health')).json()).toEqual({ ok: true, ai: false, contractVersion: 1 });
  });
});

test('oversized and missing bodies are rejected without touching data; responses are never cached', async () => {
  expect((await call('POST', '/api/events', 'x'.repeat(5_000_001))).status).toBe(413);
  expect((await call('POST', '/api/events')).status).toBe(400);
  const list = await call('GET', '/api/events');
  expect(list.headers.get('Cache-Control')).toBe('no-store');
  expect(await list.json()).toEqual([]);
});
