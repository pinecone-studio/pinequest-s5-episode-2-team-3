import { number } from './format';
import type { WaterEntry } from './data';

// How today is going against the clock. The goal is spread evenly over a waking day of 08:00–22:00,
// so by any moment some share of it should already be drunk. Under a doctor's limit nothing here
// ever pushes for more: it only says how close the limit is.
export const DAY_START = 8;
export const DAY_END = 22;
// Being this little short still counts as on pace, so a sip or two never flips the mood.
export const SLACK_ML = 100;
// Since the last drink: amber after this many minutes, red after the second.
export const WARN_MIN = 90;
export const ALERT_MIN = 180;

export type Pace =
  | { kind: 'night'; early: boolean }
  | { kind: 'done' }
  | { kind: 'ahead'; expected: number }
  | { kind: 'behind'; expected: number; face: 'sad' | 'worried' }
  | { kind: 'limit-ok' }
  | { kind: 'limit-near' }
  | { kind: 'limit-over' };

// Share of the waking day gone by at `now`, 0 before 08:00 and 1 from 22:00.
export function dayShare(now: Date): number {
  const hours = now.getHours() + now.getMinutes() / 60;
  return Math.min(1, Math.max(0, (hours - DAY_START) / (DAY_END - DAY_START)));
}

// What should be drunk by now, rounded to 10 ml.
export const expectedBy = (goal: number, now: Date) => Math.round((goal * dayShare(now)) / 10) * 10;

export function pace(drink: number, goal: number, mode: 'goal' | 'limit', now: Date): Pace {
  if (mode === 'limit') return drink > goal ? { kind: 'limit-over' } : drink >= goal * 0.8 ? { kind: 'limit-near' } : { kind: 'limit-ok' };
  if (drink >= goal) return { kind: 'done' };
  const hour = now.getHours();
  if (hour < DAY_START || hour >= DAY_END) return { kind: 'night', early: hour < DAY_START };
  const expected = expectedBy(goal, now);
  if (expected - drink <= SLACK_ML) return { kind: 'ahead', expected };
  // Well under half of where the day should be is sad; a smaller gap is only worried.
  return { kind: 'behind', expected, face: drink < expected / 2 ? 'sad' : 'worried' };
}

// One line for the home under the bottle (HTML: numbers in <b>).
export function paceText(p: Pace, drink: number): string {
  switch (p.kind) {
    case 'behind': return `Одоогоор <b>${number(p.expected)} мл</b> байх ёстой · та <b>${number(drink)} мл</b>`;
    case 'ahead': return drink > p.expected ? 'Хурдаа сайн барьж байна!' : 'Яг цагтаа явж байна, сайн байна!';
    case 'done': return 'Өнөөдрийн хэмжээгээ уучихлаа, гайхалтай!';
    case 'night': return p.early ? `Өдрийн хэмжээ ${String(DAY_START).padStart(2, '0')}:00-аас эхэлнэ` : 'Амрах цаг боллоо. Маргааш үргэлжлүүлье';
    case 'limit-ok': return 'Хязгаартаа зөв явж байна';
    case 'limit-near': return 'Хязгаарт ойртож байна';
    case 'limit-over': return 'Эмчийн хязгаараас хэтэрсэн';
  }
}

// The latest drink at or before `now`, from any day; null when nothing was ever drunk.
export function lastDrink(events: readonly WaterEntry[], now: Date): Date | null {
  let last = -Infinity;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (e.type === 'drink' && t <= now.getTime() && t > last) last = t;
  }
  return Number.isFinite(last) ? new Date(last) : null;
}

export const minutesSince = (last: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - last.getTime()) / 60_000));

export const sinceTone = (minutes: number): 'ok' | 'warn' | 'alert' => (minutes >= ALERT_MIN ? 'alert' : minutes >= WARN_MIN ? 'warn' : 'ok');

// 130 → "2 цаг 10 мин", 120 → "2 цаг", 45 → "45 мин".
export function agoText(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} цаг${m ? ` ${m} мин` : ''}` : `${m} мин`;
}

export function sinceText(last: Date | null, now: Date): string {
  if (!last) return 'Өнөөдөр хараахан уугаагүй байна';
  const minutes = minutesSince(last, now);
  return minutes < 1 ? 'Сая уусан' : `Сүүлд ${agoText(minutes)} өмнө уусан`;
}
