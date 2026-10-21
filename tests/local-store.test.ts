import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { LocalStore } from '../src/local-store';
import type { AppState } from '../shared/contracts';
const e = { id: 'event-1', amount: 200, type: 'drink' as const, at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };
const state: AppState = { goal: 2000, mode: 'goal', events: [e] };
function setup(initial: AppState = state) {
  const factory = new IDBFactory();
  const name = crypto.randomUUID();
  return { factory, name, local: new LocalStore(name, factory, () => JSON.stringify(initial)) };
}

test('legacy data imports once; malformed legacy remains untouched until confirmed recovery', async () => {
  const s = setup();
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
test('two browser contexts writing at once do not lose either edit', async () => {
  const s = setup();
  const other = new LocalStore(s.name, s.factory, () => null);
  await Promise.all([
    s.local.update(record => { record.state.events.push({ ...e, id: 'a' }); }),
    other.update(record => { record.state.events.push({ ...e, id: 'b' }); }),
  ]);
  expect((await s.local.read()).state.events).toHaveLength(3);
});
test('failed local validation aborts the entire update and preserves its pending request', async () => {
  const s = setup();
  await s.local.update(record => { record.sync = { url: 'http://localhost', base: null, attempt: { id: 'pending', baseRevision: 0, state } }; });
  const before = await s.local.read();
  await expect(s.local.update(record => { record.state.goal = -1; delete record.sync!.attempt; })).rejects.toThrow();
  expect(await s.local.read()).toEqual(before);
});
test('stale page version is rejected inside a serial transaction', async () => {
  const s = setup();
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
test('sequence only advances when the state really changes', async () => {
  const s = setup();
  const first = (await s.local.read()).sequence;
  await s.local.update(record => { record.state.events = [...record.state.events].reverse(); });
  expect((await s.local.read()).sequence).toBe(first);
  await s.local.update(record => { record.state.goal = 1900; });
  expect((await s.local.read()).sequence).toBe(first + 1);
});
