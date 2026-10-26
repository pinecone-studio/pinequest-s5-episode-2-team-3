import { afterEach, beforeEach, expect, test } from 'bun:test';
import { LocalD1 } from '../backend/test-db';

// family.ts keeps the membership in localStorage, which bun does not have.
const memory = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};
const { FamilyClient, FamilyError, readMembership, todayReport, writeMembership } = await import('../src/family');

const databases: LocalD1[] = [];
beforeEach(() => memory.clear());
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));
const setup = () => { const db = new LocalD1(); databases.push(db); return new FamilyClient(db.fetch, 'http://localhost'); };

const now = new Date(2026, 9, 26, 15, 0);
const at = (h: number, back = 0) => { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h); return d.toISOString(); };
const state = {
  goal: 2000, mode: 'goal' as const,
  events: [
    { id: 'a', amount: 300, type: 'drink' as const, at: at(9) },
    { id: 'b', amount: 200, type: 'drink' as const, at: at(13) },
    { id: 'c', amount: 100, type: 'spill' as const, at: at(14) },
    { id: 'd', amount: 900, type: 'drink' as const, at: at(10, 1) },
  ],
};

test("today's report counts only today's drinks, on the local day", () => {
  expect(todayReport(state, 'Ээж', 'cat', now)).toEqual({ name: 'Ээж', avatar: 'cat', day: '2026-10-26', drinkMl: 500, goalMl: 2000, mode: 'goal' });
});

test('membership: a long random member ID is made once and kept', () => {
  const first = readMembership();
  expect(first.memberId.length).toBeGreaterThanOrEqual(16);
  expect(first.baseId).toBeNull();
  writeMembership({ ...first, name: 'Аав', baseId: 'bottle-01' });
  expect(readMembership()).toEqual({ memberId: first.memberId, name: 'Аав', baseId: 'bottle-01' });
});

test('two phones on one base see each other; only their own row is "me"', async () => {
  const client = setup();
  const mom = crypto.randomUUID(), kid = crypto.randomUUID();
  await client.report('bottle-01', mom, todayReport(state, 'Ээж', 'bottle', now));
  const board = await client.report('bottle-01', kid, todayReport({ ...state, goal: 1000, events: [] }, 'Хүү', 'cat', now));
  expect(board.members.map(m => [m.name, m.rank, m.pct, m.me])).toEqual([['Ээж', 1, 25, false], ['Хүү', 2, 0, true]]);
  const mine = await client.board('bottle-01', mom, '2026-10-26');
  expect(mine.members.find(m => m.me)?.name).toBe('Ээж');
});

test('leaving removes the row; server errors arrive as readable FamilyErrors', async () => {
  const client = setup();
  const mom = crypto.randomUUID();
  await client.report('bottle-01', mom, todayReport(state, 'Ээж', 'bottle', now));
  await client.leave('bottle-01', mom);
  expect((await client.board('bottle-01', mom, '2026-10-26')).members).toEqual([]);
  const failed = await client.leave('bottle-01', mom).catch(e => e);
  expect(failed).toBeInstanceOf(FamilyError);
  expect(failed.message).toBe('Гишүүн олдсонгүй.');
  const offline = new FamilyClient(() => Promise.reject(new TypeError('offline')), 'http://localhost');
  expect((await offline.board('bottle-01', mom, '2026-10-26').catch(e => e)).message).toContain('Интернэт');
});
