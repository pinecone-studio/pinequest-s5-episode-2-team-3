import { familyAlerts, rankMembers, validateBaseId, validateDay, validateMemberId, validateReport } from '../../shared/family.ts';
import { ContractError } from '../../shared/contracts.ts';
import { readJson } from './body.js';

// A member who has not reported for this long drops off the family's board (a phone that was
// reset or given away should not sit there forever).
const STALE_DAYS = 30;
const daysBefore = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

// The family board for one day. Someone who has not drunk yet that day shows 0 against the goal
// they reported last; member IDs never leave the server, only whether a row is the caller's.
export async function readLeaderboard(db, baseId, day, me = null) {
  const { results } = await db.prepare(`
    SELECT m.id, m.name, m.avatar,
      COALESCE(d.drink_ml, 0) AS drink_ml,
      COALESCE(d.goal_ml, (SELECT goal_ml FROM member_days WHERE member_id = m.id ORDER BY day DESC LIMIT 1)) AS goal_ml,
      COALESCE(d.mode, (SELECT mode FROM member_days WHERE member_id = m.id ORDER BY day DESC LIMIT 1)) AS mode,
      d.last_drink_at
    FROM members m LEFT JOIN member_days d ON d.member_id = m.id AND d.day = ?2
    WHERE m.base_id = ?1 AND m.updated_at >= ?3`)
    .bind(baseId, day, daysBefore(day, STALE_DAYS))
    .all();
  const members = rankMembers(results.filter(r => r.goal_ml).map(r => ({
    name: r.name, avatar: r.avatar, drinkMl: r.drink_ml, goalMl: r.goal_ml, mode: r.mode, me: r.id === me, lastDrinkAt: r.last_drink_at ?? null,
  })));
  return { baseId, day, members };
}

export async function getLeaderboard(db, baseIdRaw, searchParams) {
  const baseId = validateBaseId(baseIdRaw);
  const day = validateDay(searchParams.get('day') ?? new Date().toISOString().slice(0, 10));
  const me = searchParams.get('me');
  return readLeaderboard(db, baseId, day, me ? validateMemberId(me) : null);
}

// Join (or move to) a family and report today's own total in one call; answers with the board.
export async function putMember(request, db, baseIdRaw, memberIdRaw) {
  const baseId = validateBaseId(baseIdRaw);
  const memberId = validateMemberId(memberIdRaw);
  const report = validateReport(await readJson(request, 2048));
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO members (id, base_id, name, avatar, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(id) DO UPDATE SET base_id = excluded.base_id, name = excluded.name, avatar = excluded.avatar, updated_at = excluded.updated_at`)
      .bind(memberId, baseId, report.name, report.avatar, now),
    db.prepare(`INSERT INTO member_days (member_id, day, drink_ml, goal_ml, mode, updated_at, last_drink_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(member_id, day) DO UPDATE SET drink_ml = excluded.drink_ml, goal_ml = excluded.goal_ml, mode = excluded.mode, updated_at = excluded.updated_at,
        last_drink_at = COALESCE(excluded.last_drink_at, member_days.last_drink_at)`)
      .bind(memberId, report.day, report.drinkMl, report.goalMl, report.mode, now, report.lastDrinkAt ?? null),
  ]);
  return readLeaderboard(db, baseId, report.day, memberId);
}

// Leave the family. Only the member itself knows its ID, so only it can do this.
export async function deleteMember(db, baseIdRaw, memberIdRaw) {
  const baseId = validateBaseId(baseIdRaw);
  const memberId = validateMemberId(memberIdRaw);
  const [, { meta }] = await db.batch([
    db.prepare('DELETE FROM member_days WHERE member_id = ?1 AND EXISTS (SELECT 1 FROM members WHERE id = ?1 AND base_id = ?2)').bind(memberId, baseId),
    db.prepare('DELETE FROM members WHERE id = ?1 AND base_id = ?2').bind(memberId, baseId),
  ]);
  return meta.changes > 0;
}

// What this phone should tell its owner about the rest of the family now (shared/family.ts familyAlerts),
// for the Android background check that has no board of its own: the phone's local day, hour and UTC
// offset (minutes, as getTimezoneOffset) come with the call.
export async function getAlerts(db, baseIdRaw, searchParams, now = new Date()) {
  const baseId = validateBaseId(baseIdRaw);
  const day = validateDay(searchParams.get('day') ?? now.toISOString().slice(0, 10));
  const me = searchParams.get('me');
  const hour = Number(searchParams.get('hour'));
  const offset = Number(searchParams.get('offset') ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ContractError('Цаг 0–23 байна.');
  if (!Number.isInteger(offset) || Math.abs(offset) > 840) throw new ContractError('Цагийн бүс буруу байна.');
  const board = await readLeaderboard(db, baseId, day, me ? validateMemberId(me) : null);
  return { alerts: familyAlerts(board, now, hour, offset) };
}
