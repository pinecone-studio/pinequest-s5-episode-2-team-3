import { afterEach, expect, test } from 'bun:test';
import { LocalD1 } from './test-db';
import { rankMembers, validateReport } from '../shared/family';

const databases: LocalD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

const DAY = '2026-10-26';
const MOM = 'member-mom-0000000001', DAD = 'member-dad-0000000002', KID = 'member-kid-0000000003', GRAN = 'member-gran-000000004';
const report = (name: string, drinkMl: number, goalMl = 2000, mode: 'goal' | 'limit' = 'goal', day = DAY) => ({ name, avatar: 'bottle', day, drinkMl, goalMl, mode });
function setup() {
  const db = new LocalD1(); databases.push(db);
  const put = (base: string, member: string, body: unknown) => db.call('PUT', `/api/bases/${base}/members/${member}`, body);
  const board = async (base: string, query = `day=${DAY}`) => (await db.call('GET', `/api/bases/${base}/leaderboard?${query}`)).json();
  return { db, put, board };
}

test('joining reports the day and answers with the board, marking only the caller', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500));
  const res = await s.put('bottle-01', DAD, report('Аав', 800));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.baseId).toBe('bottle-01');
  expect(body.members.map((m: { name: string; me: boolean }) => [m.name, m.me])).toEqual([['Ээж', false], ['Аав', true]]);
});

test('member IDs never leave the server', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500));
  const text = JSON.stringify(await s.board('bottle-01', `day=${DAY}&me=${MOM}`));
  expect(text).not.toContain(MOM);
  expect(text).toContain('"me":true');
});

test('ranks by share of the goal capped at 100%, ties share a place', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 2600, 2000)); // 130%, counts as 100%
  await s.put('bottle-01', DAD, report('Аав', 2000, 2000)); // 100%
  await s.put('bottle-01', KID, report('Хүү', 900, 1000)); // 90%
  const { members } = await s.board('bottle-01');
  expect(members.map((m: { name: string; rank: number; pct: number }) => [m.name, m.rank, m.pct])).toEqual([['Ээж', 1, 130], ['Аав', 2, 100], ['Хүү', 3, 90]]);
  expect(rankMembers([
    { name: 'A', avatar: 'cat', drinkMl: 1000, goalMl: 2000, mode: 'goal', me: false },
    { name: 'B', avatar: 'cat', drinkMl: 1000, goalMl: 2000, mode: 'goal', me: false },
  ]).map(r => r.rank)).toEqual([1, 1]);
});

test("a doctor's limit is never ranked: listed after everyone, however much was drunk", async () => {
  const s = setup();
  await s.put('bottle-01', GRAN, report('Эмээ', 1400, 1500, 'limit'));
  await s.put('bottle-01', KID, report('Хүү', 100, 1000));
  const { members } = await s.board('bottle-01');
  expect(members.map((m: { name: string; rank: number | null }) => [m.name, m.rank])).toEqual([['Хүү', 1], ['Эмээ', null]]);
});

test('families are separate, and moving to another base moves the member', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500));
  await s.put('bottle-02', DAD, report('Аав', 800));
  expect((await s.board('bottle-01')).members.map((m: { name: string }) => m.name)).toEqual(['Ээж']);
  await s.put('bottle-02', MOM, report('Ээж', 1500));
  expect((await s.board('bottle-01')).members).toEqual([]);
  expect((await s.board('bottle-02')).members).toHaveLength(2);
});

test('a new day starts at 0 against the last goal; reporting again replaces, never adds', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500, 2200, 'goal', '2026-10-25'));
  expect((await s.board('bottle-01')).members[0]).toMatchObject({ drinkMl: 0, goalMl: 2200, pct: 0 });
  await s.put('bottle-01', MOM, report('Ээж', 300));
  await s.put('bottle-01', MOM, report('Ээж', 500));
  expect((await s.board('bottle-01')).members[0]).toMatchObject({ drinkMl: 500, goalMl: 2000 });
});

test('someone silent for over 30 days drops off the board', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500));
  s.db.sqlite.query('UPDATE members SET updated_at = ?1').run('2026-09-01T00:00:00.000Z');
  expect((await s.board('bottle-01')).members).toEqual([]);
});

test('leaving: only with your own member ID and base', async () => {
  const s = setup();
  await s.put('bottle-01', MOM, report('Ээж', 1500));
  expect((await s.db.call('DELETE', `/api/bases/bottle-02/members/${MOM}`)).status).toBe(404);
  expect((await s.db.call('DELETE', `/api/bases/bottle-01/members/${MOM}`)).status).toBe(204);
  expect((await s.board('bottle-01')).members).toEqual([]);
  expect(s.db.sqlite.query('SELECT COUNT(*) AS n FROM member_days').get()).toEqual({ n: 0 });
});

test('bad input is a 400 with a reason', async () => {
  const s = setup();
  expect((await s.put('bottle-01', 'short', report('Ээж', 100))).status).toBe(400);
  expect((await s.put('bad base!', MOM, report('Ээж', 100))).status).toBe(400);
  expect((await s.put('bottle-01', MOM, report('', 100))).status).toBe(400);
  expect((await s.put('bottle-01', MOM, { ...report('Ээж', 100), day: '2026-02-30' })).status).toBe(400);
  expect((await s.put('bottle-01', MOM, { ...report('Ээж', 100), mode: 'more' })).status).toBe(400);
  expect((await s.db.call('GET', '/api/bases/bottle-01/leaderboard?day=26-10-2026')).status).toBe(400);
  expect(validateReport({ ...report('  Их   Ээж  ', 1) }).name).toBe('Их Ээж');
});
