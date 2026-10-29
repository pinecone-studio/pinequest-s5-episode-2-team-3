import type { WaterEntry } from './data';
import { readProfile, type Condition } from './plan';
import type { Face } from './native-reminders';
import { number } from './format';
import { WEEKDAY_LONG, WEEKDAY_SHORT, readDialysis, type Dialysis } from './progress-data';

// The weekly lock-screen notice before the days off, and the card it opens (weekend-card.ts). Pure:
// everything comes in as arguments, so it is fully tested (tests/weekend-notice.test.ts).
//   dialysis: kidney failure with dialysis days set; the evening the longest gap between sessions
//             starts, 19:00, until the next session.
//   heart:    heart failure; Friday 19:00 until Monday.
//   goal:     everyone else; Friday 19:00 until Monday, with the streak.
// The tip line only says what the person's own drinking history shows (no body weight is kept).
export type WeekendKind = 'dialysis' | 'heart' | 'goal';

export interface WeekendCard {
  heading: string;
  note: string;
  // Each day off with its amount; `word` names it (limit or goal).
  days: { label: string; ml: number }[];
  word: 'хязгаар' | 'зорилт';
  // Dialysis only: from the evening the gap starts to the next session, passed points marked.
  timeline: { label: string; done: boolean }[] | null;
  streak: number;
  tip: string;
}

export interface WeekendNotice {
  kind: WeekendKind;
  // When the notification goes off next, and the window (this one or the coming one) the card covers.
  at: Date;
  from: Date;
  until: Date;
  title: string;
  body: string;
  face: Face;
  card: WeekendCard;
}

export interface WeekendInput {
  condition: Condition;
  mode: 'goal' | 'limit';
  goal: number;
  dialysis: Dialysis;
  events: readonly WaterEntry[];
  streak: number;
  now: Date;
}

const DAY = 86_400_000;
const EVENING = 19;

// The latest `dow` (0 = Sunday) at hh:mm that is not after `now`.
function lastAt(now: Date, dow: number, h: number, m: number): Date {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() - dow + 7) % 7), h, m);
  if (at > now) at.setDate(at.getDate() - 7);
  return at;
}
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

// The window running now, or else the next one; `days` is how long it lasts in whole days from its
// start day to its end day.
function windowFor(now: Date, dow: number, days: number, endH: number, endM: number): { from: Date; until: Date } {
  let from = lastAt(now, dow, EVENING, 0);
  const end = (f: Date) => { const u = plusDays(f, days); u.setHours(endH, endM, 0, 0); return u; };
  if (end(from) <= now) from = plusDays(from, 7);
  return { from, until: end(from) };
}

// The longest stretch between two sessions: its first day, the day of the next session and the
// days in between. Ties go to the one holding more of Saturday and Sunday.
export function longestGap(days: readonly number[]): { start: number; end: number; off: number[] } | null {
  const week = [...new Set(days.map(d => d % 7))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!week.length) return null;
  let best: { start: number; end: number; off: number[] } | null = null;
  const weekendIn = (off: number[]) => off.filter(d => d === 0 || d === 6).length;
  week.forEach((start, i) => {
    const end = week[(i + 1) % week.length];
    const gap = (end - start + 7) % 7 || 7;
    const off = Array.from({ length: gap - 1 }, (_, k) => (start + k + 1) % 7);
    if (!best || off.length > best.off.length || (off.length === best.off.length && weekendIn(off) > weekendIn(best.off))) best = { start, end, off };
  });
  return best;
}

// Saturdays and Sundays against the other days over the last four weeks (today left out), each an
// average of the days with something logged. Too little history or a gap under 100 мл → the general tip.
export function weekendTip(events: readonly WaterEntry[], limit: boolean, now: Date): string {
  const general = limit ? 'Цангавал мөс хөхөх, амаа зайлах тусална.' : 'Гадуур явахдаа саваа авч яваарай.';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = new Date(today.getTime() - 28 * DAY);
  const totals = new Map<number, number>();
  for (const e of events) {
    if (e.type !== 'drink') continue;
    const at = new Date(e.at);
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    if (day < since || day >= today) continue;
    totals.set(day.getTime(), (totals.get(day.getTime()) ?? 0) + e.amount);
  }
  const weekend: number[] = [], weekday: number[] = [];
  totals.forEach((ml, t) => { if (ml > 0) ([0, 6].includes(new Date(t).getDay()) ? weekend : weekday).push(ml); });
  const first = Math.min(...totals.keys());
  if (weekend.length < 2 || weekday.length < 4 || today.getTime() - first < 14 * DAY) return general;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const diff = Math.round((avg(weekend) - avg(weekday)) / 50) * 50;
  if (limit && diff >= 100) return `Таны түүхээс: амралтын өдрүүдэд та дунджаар ${number(diff)} мл илүү уудаг.`;
  if (!limit && diff <= -100) return `Таны түүхээс: амралтын өдрүүдэд та дунджаар ${number(-diff)} мл бага уудаг.`;
  return general;
}

export function weekendNotice(input: WeekendInput): WeekendNotice | null {
  const { condition, goal, dialysis, events, streak, now } = input;
  const ml = number(goal);
  if (condition === 'kidney') {
    const gap = longestGap(dialysis.days);
    if (!gap) return null;
    const [h, m] = dialysis.time.split(':').map(Number);
    const { from, until } = windowFor(now, gap.start, gap.off.length + 1, h, m);
    const next = `${WEEKDAY_LONG[gap.end]} ${dialysis.time}`;
    const title = `Амралтын ${gap.off.length} өдөр эхэлж байна`;
    const body = `Дараагийн диализ ${next}. Өдөрт ${ml} мл-ээ барьж, давстай хоолоо цөөлөөрэй.`;
    const points = [
      { label: `${WEEKDAY_SHORT[gap.start]} орой`, at: from },
      ...gap.off.map((d, k) => ({ label: WEEKDAY_SHORT[d], at: plusDays(new Date(from.getFullYear(), from.getMonth(), from.getDate()), k + 1) })),
      { label: `${WEEKDAY_SHORT[gap.end]} ${dialysis.time}`, at: until },
    ];
    return {
      kind: 'dialysis', at: from > now ? from : plusDays(from, 7), from, until, title, body, face: 'worried',
      card: { heading: title, note: `Дараагийн диализ: ${next}`, days: gap.off.map(d => ({ label: WEEKDAY_LONG[d], ml: goal })), word: 'хязгаар',
        timeline: points.map(p => ({ label: p.label, done: p.at <= now })), streak: 0, tip: weekendTip(events, true, now) },
    };
  }
  const { from, until } = windowFor(now, 5, 3, 0, 0);
  const days = [6, 0].map(d => ({ label: WEEKDAY_LONG[d], ml: goal }));
  const at = from > now ? from : plusDays(from, 7);
  if (condition === 'heart') {
    const title = 'Амралтын өдөр эхэлж байна';
    return {
      kind: 'heart', at, from, until, title, face: 'worried',
      body: `Өдөрт ${ml} мл-ээс хэтрүүлэхгүй. Давс, шингэн ихтэй хоолноос болгоомжлоорой.`,
      card: { heading: title, note: 'Давс, шингэн ихтэй хоолноос болгоомжлоорой.', days, word: 'хязгаар', timeline: null, streak: 0, tip: weekendTip(events, true, now) },
    };
  }
  const title = 'Амралтын өдөр ч усаа мартуузай';
  const word = input.mode === 'limit' ? 'хязгаар' : 'зорилт';
  return {
    kind: 'goal', at, from, until, title, face: 'happy',
    body: streak > 0 ? `Өдөрт ${ml} мл. 🔥 ${streak} өдрийн streak-ээ амралтын өдрүүдэд ч үргэлжлүүлээрэй.` : `Өдөрт ${ml} мл. Амралтын өдрүүдэд ч ${word === 'зорилт' ? 'зорилтоо биелүүлээрэй' : 'хязгаартаа багтаарай'}.`,
    card: { heading: title, note: `Өдөр бүр ${ml} мл`, days, word, timeline: null, streak, tip: weekendTip(events, input.mode === 'limit', now) },
  };
}

// The notice for this phone: the profile's diagnosis and the dialysis days it keeps, and the saved log.
export function weekendFor(state: { goal: number; mode: 'goal' | 'limit'; events: readonly WaterEntry[] }, streak: number, now = new Date()): WeekendNotice | null {
  return weekendNotice({ condition: readProfile().condition, mode: state.mode, goal: state.goal, dialysis: readDialysis(), events: state.events, streak, now });
}
