// Family leaderboard, shared by the app and the Worker. A family is everyone who uses the same base:
// the base's device ID is the family ID. Each phone is one member with a random ID it keeps to itself;
// the leaderboard never sends member IDs back, so nobody can overwrite another member's numbers.
import { ContractError, validateId } from './contracts';

export interface MemberReport {
  name: string;
  avatar: string;
  day: string; // local calendar day, YYYY-MM-DD
  drinkMl: number;
  goalMl: number;
  mode: 'goal' | 'limit';
  lastDrinkAt?: string | null; // ISO time of the day's latest drink
}

export interface LeaderboardRow {
  rank: number | null; // null under a doctor's limit: drinking more is never a win there
  name: string;
  avatar: string;
  drinkMl: number;
  goalMl: number;
  mode: 'goal' | 'limit';
  pct: number; // drinkMl / goalMl, whole percent
  me: boolean;
  lastDrinkAt: string | null;
}

export interface Leaderboard {
  baseId: string;
  day: string;
  members: LeaderboardRow[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError('Өгөгдлийн бүтэц буруу байна.');
  return value as Record<string, unknown>;
}
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export const validateBaseId = validateId;

// Member IDs are random UUIDs made by the app; they act as the member's key, so keep them long.
export function validateMemberId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(value)) throw new ContractError('Гишүүний ID буруу байна.');
  return value;
}

export function validateDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ContractError('Өдөр YYYY-MM-DD хэлбэртэй байна.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ContractError('Өдөр буруу байна.');
  return value;
}

export function validateReport(value: unknown): MemberReport {
  const body = record(value);
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 24) throw new ContractError('Нэр 1–24 тэмдэгт байна.');
  if (typeof body.avatar !== 'string' || !/^[a-z]{1,20}$/.test(body.avatar)) throw new ContractError('Дүр буруу байна.');
  if (!int(body.drinkMl, 0, 20_000)) throw new ContractError('Уусан хэмжээ 0–20,000 мл бүхэл тоо байна.');
  if (!int(body.goalMl, 50, 10_000)) throw new ContractError('Өдрийн хэмжээ 50–10,000 мл байна.');
  if (body.mode !== 'goal' && body.mode !== 'limit') throw new ContractError('Горим буруу байна.');
  const last = body.lastDrinkAt;
  if (last != null && (typeof last !== 'string' || last.length > 40 || !Number.isFinite(Date.parse(last)))) throw new ContractError('Сүүлд уусан цаг буруу байна.');
  return { name, avatar: body.avatar, day: validateDay(body.day), drinkMl: body.drinkMl as number, goalMl: body.goalMl as number, mode: body.mode, lastDrinkAt: last == null ? null : new Date(last).toISOString() };
}

// Goal days rank by how much of the goal is done (capped at 100%, so a whole bottle extra does not
// beat finishing), then by amount; doctor's-limit days are listed after, unranked.
export function rankMembers(rows: Omit<LeaderboardRow, 'rank' | 'pct'>[]): LeaderboardRow[] {
  const withPct = rows.map(r => ({ ...r, pct: Math.round((r.drinkMl / r.goalMl) * 100) }));
  const goal = withPct.filter(r => r.mode === 'goal')
    .sort((a, b) => Math.min(b.pct, 100) - Math.min(a.pct, 100) || b.drinkMl - a.drinkMl || a.name.localeCompare(b.name));
  const limit = withPct.filter(r => r.mode === 'limit').sort((a, b) => a.name.localeCompare(b.name));
  let rank = 0, previous: typeof goal[number] | null = null;
  const ranked = goal.map((r, i) => {
    // Equal progress shares a place.
    if (!previous || Math.min(previous.pct, 100) !== Math.min(r.pct, 100) || previous.drinkMl !== r.drinkMl) rank = i + 1;
    previous = r;
    return { ...r, rank };
  });
  return [...ranked, ...limit.map(r => ({ ...r, rank: null }))];
}


// What the family hears about someone under a doctor's limit (kidney or heart failure), from the board:
// the limit passed, the limit close (80 %), or no drink logged for DRY_HOURS while awake (08–22, the
// phone's local hour). Never about the phone asking (`me`) or anyone with a plain goal. `key` names the
// event, so a phone says each one once: a new drink makes a new «no drink» event possible again.
export const DRY_HOURS = 3;
export const NEAR_SHARE = 0.8;
export interface FamilyAlert { key: string; kind: 'over' | 'near' | 'dry'; title: string; body: string }
const ml = (n: number) => new Intl.NumberFormat('en-US').format(n);
const hhmm = (iso: string, offsetMin: number) => { const d = new Date(Date.parse(iso) - offsetMin * 60e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

export function familyAlerts(board: Leaderboard, now: Date, localHour: number, offsetMin = now.getTimezoneOffset()): FamilyAlert[] {
  const alerts: FamilyAlert[] = [];
  for (const m of board.members) {
    if (m.me || m.mode !== 'limit') continue;
    const id = `${board.day}|${m.name}`;
    if (m.drinkMl > m.goalMl) {
      alerts.push({ key: `${id}|over`, kind: 'over', title: `${m.name} хязгаараас хэтэрлээ`, body: `Өнөөдөр ${ml(m.drinkMl)} / ${ml(m.goalMl)} мл · ${ml(m.drinkMl - m.goalMl)} мл илүү. Түүнтэй холбогдоорой.` });
    } else if (m.drinkMl >= m.goalMl * NEAR_SHARE) {
      alerts.push({ key: `${id}|near`, kind: 'near', title: `${m.name} хязгаартаа ойртлоо`, body: `Өнөөдөр ${ml(m.drinkMl)} / ${ml(m.goalMl)} мл · ${ml(m.goalMl - m.drinkMl)} мл үлдсэн.` });
    }
    if (localHour < 8 || localHour >= 22) continue;
    const last = m.lastDrinkAt ? Date.parse(m.lastDrinkAt) : null;
    const dry = last === null ? localHour >= 8 + DRY_HOURS : now.getTime() - last >= DRY_HOURS * 3600e3;
    if (dry) {
      const hours = last === null ? null : Math.floor((now.getTime() - last) / 3600e3);
      alerts.push({
        key: `${id}|dry|${m.lastDrinkAt ?? 'none'}`, kind: 'dry',
        title: last === null ? `${m.name} өнөөдөр ус уусан бүртгэлгүй` : `${m.name} ${hours} цаг ус уусан бүртгэлгүй`,
        body: last === null ? 'Өглөөнөөс хойш нэг ч уулт бүртгэгдээгүй байна. Залгаж асуугаарай.' : `Сүүлд ${hhmm(m.lastDrinkAt!, offsetMin)}-д уусан. Хязгаартаа багтаан бага багаар уухыг сануулаарай.`,
      });
    }
  }
  return alerts;
}
