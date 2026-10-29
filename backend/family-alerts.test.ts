import { afterEach, describe, expect, test } from 'bun:test';
import { LocalD1 } from './test-db';
import { familyAlerts, type Leaderboard, type LeaderboardRow } from '../shared/family';

const DAY = '2026-10-29';
// Ulaanbaatar, UTC+8: getTimezoneOffset is -480.
const UB = -480;
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+08:00`);
const row = (r: Partial<LeaderboardRow>): LeaderboardRow => ({ rank: null, name: 'Эмээ', avatar: 'bottle', drinkMl: 0, goalMl: 1500, mode: 'limit', pct: 0, me: false, lastDrinkAt: null, ...r });
const board = (...members: LeaderboardRow[]): Leaderboard => ({ baseId: 'base-01', day: DAY, members });

describe('familyAlerts', () => {
  test('past the limit, and close to it', () => {
    const now = at('12:00');
    expect(familyAlerts(board(row({ drinkMl: 1700, lastDrinkAt: at('11:30').toISOString() })), now, 12, UB).map(a => [a.kind, a.title]))
      .toEqual([['over', 'Эмээ хязгаараас хэтэрлээ']]);
    expect(familyAlerts(board(row({ drinkMl: 1250, lastDrinkAt: at('11:30').toISOString() })), now, 12, UB).map(a => a.kind)).toEqual(['near']);
    expect(familyAlerts(board(row({ drinkMl: 1100, lastDrinkAt: at('11:30').toISOString() })), now, 12, UB)).toEqual([]);
  });
  test('no drink logged for three hours while awake, with the time of the last one', () => {
    const [dry] = familyAlerts(board(row({ drinkMl: 400, lastDrinkAt: at('09:10').toISOString() })), at('12:20'), 12, UB);
    expect(dry.kind).toBe('dry');
    expect(dry.title).toBe('Эмээ 3 цаг ус уусан бүртгэлгүй');
    expect(dry.body).toContain('09:10');
  });
  test('nothing logged all morning counts from 08:00', () => {
    expect(familyAlerts(board(row({})), at('10:30'), 10, UB)).toEqual([]);
    expect(familyAlerts(board(row({})), at('11:05'), 11, UB)[0].title).toBe('Эмээ өнөөдөр ус уусан бүртгэлгүй');
  });
  test('quiet at night', () => {
    expect(familyAlerts(board(row({ lastDrinkAt: at('18:00').toISOString() })), at('23:00'), 23, UB)).toEqual([]);
  });
  test('never about yourself or someone with a plain goal', () => {
    expect(familyAlerts(board(row({ me: true, drinkMl: 2000 }), row({ name: 'Аав', mode: 'goal', drinkMl: 3000 })), at('15:00'), 15, UB)).toEqual([]);
  });
  test('a new drink makes a new «no drink» event; the same one keeps its key', () => {
    const a = familyAlerts(board(row({ lastDrinkAt: at('08:00').toISOString() })), at('11:30'), 11, UB)[0].key;
    const b = familyAlerts(board(row({ lastDrinkAt: at('08:00').toISOString() })), at('12:30'), 12, UB)[0].key;
    const c = familyAlerts(board(row({ lastDrinkAt: at('12:00').toISOString() })), at('15:30'), 15, UB)[0].key;
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

const databases: LocalD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test('the alerts endpoint answers for the asking phone from the stored last drink', async () => {
  const db = new LocalD1(); databases.push(db);
  const GRAN = 'member-gran-000000004', KID = 'member-kid-0000000003';
  const lastDrinkAt = new Date(Date.now() - 4 * 3600e3).toISOString();
  await db.call('PUT', `/api/bases/base-01/members/${GRAN}`, { name: 'Эмээ', avatar: 'bottle', day: DAY, drinkMl: 1600, goalMl: 1500, mode: 'limit', lastDrinkAt });
  await db.call('PUT', `/api/bases/base-01/members/${KID}`, { name: 'Хүү', avatar: 'bottle', day: DAY, drinkMl: 500, goalMl: 2000, mode: 'goal' });
  const forKid = await (await db.call('GET', `/api/bases/base-01/alerts?day=${DAY}&hour=14&offset=-480&me=${KID}`)).json() as { alerts: { kind: string }[] };
  expect(forKid.alerts.map(a => a.kind).sort()).toEqual(['dry', 'over']);
  const forGran = await (await db.call('GET', `/api/bases/base-01/alerts?day=${DAY}&hour=14&offset=-480&me=${GRAN}`)).json() as { alerts: unknown[] };
  expect(forGran.alerts).toEqual([]);
  // A report without the time keeps the one already stored.
  await db.call('PUT', `/api/bases/base-01/members/${GRAN}`, { name: 'Эмээ', avatar: 'bottle', day: DAY, drinkMl: 1600, goalMl: 1500, mode: 'limit' });
  const again = await (await db.call('GET', `/api/bases/base-01/alerts?day=${DAY}&hour=14&offset=-480&me=${KID}`)).json() as { alerts: { kind: string }[] };
  expect(again.alerts.map(a => a.kind)).toContain('dry');
  expect((await db.call('GET', `/api/bases/base-01/alerts?day=${DAY}&hour=99&me=${KID}`)).status).toBe(400);
});
