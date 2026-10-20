import { expect, test } from 'bun:test';
import { canonical, merge, mutation, sameState, snapshot } from './sync';
import type { AppState } from './contracts';
const e = { id: 'event-1', amount: 200, type: 'drink' as const, at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };
const state: AppState = { goal: 2000, mode: 'goal', events: [e] };

test('three-way merge handles deletion vs edit and independently added records', () => {
  const base = state;
  const local = { ...state, events: [] };
  const remote = { ...state, events: [{ ...e, amount: 250 }, { ...e, id: 'new' }] };
  expect(merge(base, local, remote).conflicts.map(c => c.key)).toEqual([e.id]);
  const chosen = merge(base, local, remote, { [e.id]: 'local' });
  expect(chosen.conflicts).toEqual([]);
  expect(chosen.state.events).toEqual([{ ...e, id: 'new' }]);
});

test('first connection unions records but asks before replacing different settings', () => {
  const local = { goal: 1500, mode: 'limit' as const, events: [{ ...e, id: 'local' }] };
  const remote = { ...state, events: [{ ...e, id: 'remote' }] };
  const result = merge(null, local, remote);
  expect(result.conflicts.map(c => c.key)).toEqual(['settings']);
  expect(merge(null, local, remote, { settings: 'remote' }).state).toEqual({ goal: 2000, mode: 'goal', events: [{ ...e, id: 'local' }, { ...e, id: 'remote' }] });
});

test('one-sided changes win without a conflict, including deletions', () => {
  const edited = { ...state, goal: 1800, events: [{ ...e, type: 'spill' as const }] };
  expect(merge(state, edited, state)).toEqual({ state: edited, conflicts: [] });
  expect(merge(state, state, edited)).toEqual({ state: edited, conflicts: [] });
  expect(merge(state, { ...state, events: [] }, state).state.events).toEqual([]);
});

test('state comparison ignores event order; wire values are validated', () => {
  const other = { ...e, id: 'event-2' };
  expect(sameState({ ...state, events: [e, other] }, { ...state, events: [other, e] })).toBe(true);
  expect(canonical({ ...state, events: [other, e] }).events.map(x => x.id)).toEqual(['event-1', 'event-2']);
  expect(() => snapshot({ revision: -1, state })).toThrow();
  expect(() => mutation({ id: 'bad id', baseRevision: 0, state })).toThrow();
  expect(mutation({ id: 'change-1', baseRevision: 3, state })).toEqual({ id: 'change-1', baseRevision: 3, state });
});
