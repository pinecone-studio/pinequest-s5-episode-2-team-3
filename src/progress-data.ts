import { dayKey, type WaterEntry } from './data';

// Shared by «Явц» (achievements.ts) and the nurse's weekly report (nurse.ts): which days kept the
// doctor's limit (or met the goal), the streak, the dialysis weekdays and the weight log. All of it
// is read from the entries or kept on this phone only; nothing here changes the goal or the limit.
type Mode = 'goal' | 'limit';

export function dayTotals(events: readonly WaterEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); totals.set(k, (totals.get(k) ?? 0) + e.amount); }
  return totals;
}

// Under a limit a day counts when something was drunk and the total stayed within it; with a goal,
// when the goal was reached. A day with no entries counts for neither.
export const dayKept = (total: number, goal: number, mode: Mode) => (mode === 'limit' ? total > 0 && total <= goal : total >= goal);

export const shiftDay = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days, 12));
};

// Days in a row ending yesterday (today is still in progress), and the longest run up to yesterday.
export function streaks(events: readonly WaterEntry[], goal: number, mode: Mode, today = dayKey()): { current: number; best: number } {
  const totals = dayTotals(events);
  const kept = (k: string) => dayKept(totals.get(k) ?? 0, goal, mode);
  let current = 0;
  for (let k = shiftDay(today, -1); kept(k); k = shiftDay(k, -1)) current++;
  let best = 0, run = 0;
  const days = [...totals.keys()].filter(k => k < today).sort();
  for (let i = 0; i < days.length; i++) {
    run = kept(days[i]) ? (i > 0 && run > 0 && shiftDay(days[i - 1], 1) === days[i] ? run + 1 : 1) : 0;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

// Weekdays as Date.getDay() numbers (0 = Sunday); Monday first wherever they are listed.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SHORT = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
export const WEEKDAY_LONG = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
export const weekday = (key: string) => new Date(`${key}T12:00`).getDay();

// Dialysis weekdays and the usual start time, set on «Эмчийн зөвлөмж» (account.ts). Stored as
// 1 = Monday … 7 = Sunday; read here as getDay() numbers. The first version kept only getDay() days.
const DIALYSIS_KEY = 'dusal-dialysis-v1';
const OLD_DAYS_KEY = 'dusal-dialysis-days-v1';
export interface Dialysis { days: number[]; time: string }
export function readDialysis(): Dialysis {
  try {
    const v = JSON.parse(localStorage.getItem(DIALYSIS_KEY) ?? 'null') as Partial<Dialysis> | null;
    if (v && Array.isArray(v.days)) {
      return { days: [1, 2, 3, 4, 5, 6, 7].filter(d => v.days!.includes(d)), time: typeof v.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? v.time : '08:00' };
    }
    const old = JSON.parse(localStorage.getItem(OLD_DAYS_KEY) ?? '[]') as unknown;
    if (Array.isArray(old)) return { days: WEEK_ORDER.filter(d => old.includes(d)).map(d => d || 7), time: '08:00' };
  } catch { /* none set */ }
  return { days: [], time: '08:00' };
}
export function writeDialysis(next: Dialysis): void {
  try { localStorage.setItem(DIALYSIS_KEY, JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 7].filter(d => next.days.includes(d)), time: next.time })); } catch { /* this visit only */ }
}
// The dialysis weekdays as getDay() numbers, Monday first.
export const readDialysisDays = (): number[] => readDialysis().days.map(d => d % 7);
export const dialysisLabel = (days: readonly number[]) => days.map(d => WEEKDAY_SHORT[d]).join(', ');

// The weight the patient enters before and after each dialysis session, one of each per day.
export type WeightTag = 'before' | 'after';
export interface Weight { date: string; kg: number; tag: WeightTag }
const WEIGHT_KEY = 'dusal-dialysis-weights-v1';
const isWeight = (w: unknown): w is Weight => {
  const v = w as Partial<Weight> | null;
  return !!v && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.kg === 'number' && v.kg >= 10 && v.kg <= 250 && (v.tag === 'before' || v.tag === 'after');
};
export function readWeights(): Weight[] {
  try {
    const v = JSON.parse(localStorage.getItem(WEIGHT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(isWeight).sort((a, b) => a.date.localeCompare(b.date)) : [];
  } catch { return []; }
}
// A second entry with the same day and tag replaces the first.
export function addWeight(w: Weight): boolean {
  if (!isWeight(w)) return false;
  const list = readWeights().filter(x => !(x.date === w.date && x.tag === w.tag)).concat({ ...w, kg: Math.round(w.kg * 10) / 10 });
  try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// Interdialytic weight gain: a session's "before" weight minus the previous session's "after".
export interface Gain { from: string; to: string; kg: number }
export function gains(list: readonly Weight[]): Gain[] {
  const out: Gain[] = [];
  for (const b of list) {
    if (b.tag !== 'before') continue;
    let prev: Weight | undefined;
    for (const a of list) if (a.tag === 'after' && a.date < b.date && (!prev || a.date > prev.date)) prev = a;
    if (prev) out.push({ from: prev.date, to: b.date, kg: Math.round((b.kg - prev.kg) * 10) / 10 });
  }
  return out;
}

// How much less weight came on between sessions whose days all kept the limit, against the others.
// Null until both kinds of interval exist.
export function keptGainDiff(list: readonly Gain[], events: readonly WaterEntry[], goal: number): number | null {
  const totals = dayTotals(events);
  const kept: number[] = [], other: number[] = [];
  for (const g of list) {
    let ok = true;
    for (let k = g.from; k < g.to; k = shiftDay(k, 1)) if (!dayKept(totals.get(k) ?? 0, goal, 'limit')) ok = false;
    (ok ? kept : other).push(g.kg);
  }
  if (!kept.length || !other.length) return null;
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const diff = Math.round((avg(other) - avg(kept)) * 10) / 10;
  return diff > 0 ? diff : null;
}

export const kg = (n: number) => n.toFixed(1);
export const md = (key: string) => { const [, m, d] = key.split('-').map(Number); return `${m}/${d}`; };

// «Цангаж байна» opened: one row per time, for the nurse's report. Kept apart from the water log,
// so it never counts toward the day's total.
export interface Thirst { type: 'thirst'; at: string }
const THIRST_KEY = 'dusal-thirst-v1';
export function readThirst(): Thirst[] {
  try {
    const v = JSON.parse(localStorage.getItem(THIRST_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((t): t is Thirst => t?.type === 'thirst' && typeof t.at === 'string' && Number.isFinite(Date.parse(t.at))) : [];
  } catch { return []; }
}
export function logThirst(at = new Date()): void {
  try { localStorage.setItem(THIRST_KEY, JSON.stringify(readThirst().concat({ type: 'thirst', at: at.toISOString() }).slice(-500))); } catch { /* not counted */ }
}
