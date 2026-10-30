import { describe, expect, test } from 'bun:test';
import type { WaterEntry } from '../src/data';
import { longestGap, weekendNotice, weekendTip, type WeekendInput } from '../src/weekend-notice';

// Wednesday 28 October 2026, 10:00.
const WED = new Date(2026, 9, 28, 10, 0);
const base: WeekendInput = { condition: 'none', mode: 'goal', goal: 2150, dialysis: { days: [], time: '08:00' }, events: [], streak: 0, now: WED };
const kidney = (days: number[], time = '08:00'): WeekendInput => ({ ...base, condition: 'kidney', mode: 'limit', goal: 1500, dialysis: { days, time } });
const at = (d: Date) => [d.getDay(), d.getHours(), d.getMinutes()];

// One drink a day: `weekend` ml on Saturdays and Sundays, `weekday` on the other days, for `days` days before WED.
function history(days: number, weekend: number, weekday: number): WaterEntry[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(2026, 9, 28 - (i + 1), 12);
    return { id: `e${i}`, type: 'drink', amount: [0, 6].includes(d.getDay()) ? weekend : weekday, at: d.toISOString() } as WaterEntry;
  });
}

describe('dialysis', () => {
  test('Mon/Wed/Fri 08:00: Friday 19:00, 2 days, next session Monday 08:00', () => {
    const n = weekendNotice(kidney([1, 3, 5]))!;
    expect(n.kind).toBe('dialysis');
    expect(at(n.at)).toEqual([5, 19, 0]);
    expect(n.at.getDate()).toBe(30);
    expect(n.title).toBe('Амралтын 2 өдөр эхэлж байна');
    expect(n.body).toBe('Дараагийн диализ Даваа 08:00. Өдөрт 1,500 мл-ээ барьж, давстай хоолоо цөөлөөрэй.');
    expect(at(n.until)).toEqual([1, 8, 0]);
    expect(n.card.days).toEqual([{ label: 'Бямба', ml: 1500 }, { label: 'Ням', ml: 1500 }]);
    expect(n.card.timeline!.map(p => p.label)).toEqual(['Ба орой', 'Бя', 'Ня', 'Да 08:00']);
    expect(n.card.timeline!.every(p => !p.done)).toBe(true);
  });
  test('Mon/Thu: the longest gap is Thursday to Monday, 3 days', () => {
    const n = weekendNotice(kidney([1, 4]))!;
    expect(longestGap([1, 4])).toEqual({ start: 4, end: 1, off: [5, 6, 0] });
    expect(at(n.at)).toEqual([4, 19, 0]);
    expect(n.title).toBe('Амралтын 3 өдөр эхэлж байна');
  });
  test('Sunday is stored as 7', () => {
    expect(longestGap([2, 4, 7])).toEqual({ start: 4, end: 0, off: [5, 6] });
  });
  test('inside the gap: the card covers this window, the timeline marks what passed, the notice is next week', () => {
    const sat = new Date(2026, 9, 31, 15, 0);
    const n = weekendNotice({ ...kidney([1, 3, 5]), now: sat })!;
    expect(n.from.getDate()).toBe(30);
    expect(n.from <= sat && sat < n.until).toBe(true);
    expect(n.at.getDate()).toBe(6);
    expect(n.card.timeline!.map(p => p.done)).toEqual([true, true, false, false]);
  });
  test('no dialysis days set: nothing', () => {
    expect(weekendNotice(kidney([]))).toBeNull();
  });
});

describe('heart', () => {
  test('Friday 19:00, the limit, never dialysis', () => {
    const n = weekendNotice({ ...base, condition: 'heart', mode: 'limit', goal: 1500 })!;
    expect(n.kind).toBe('heart');
    expect(at(n.at)).toEqual([5, 19, 0]);
    expect(n.title).toBe('Амралтын өдөр эхэлж байна');
    expect(n.body).toBe('Өдөрт 1,500 мл-ээс хэтрүүлэхгүй. Давс, шингэн ихтэй хоолноос болгоомжлоорой.');
    expect(`${n.title} ${n.body} ${n.card.note} ${n.card.tip}`).not.toMatch(/диализ/i);
    expect(n.card.timeline).toBeNull();
    expect(n.card.days.map(d => d.label)).toEqual(['Бямба', 'Ням']);
  });
});

describe('everyone else', () => {
  test('the streak in the body when there is one', () => {
    const n = weekendNotice({ ...base, streak: 5 })!;
    expect(n.kind).toBe('goal');
    expect(n.title).toBe('Амралтын өдөр ч усаа мартуузай');
    expect(n.body).toBe('Өдөрт 2,150 мл. 5 өдрийн streak-ээ амралтын өдрүүдэд ч үргэлжлүүлээрэй.');
  });
  test('no streak part at 0', () => {
    const n = weekendNotice(base)!;
    expect(n.body).not.toMatch(/streak/);
    expect(n.body.startsWith('Өдөрт 2,150 мл.')).toBe(true);
  });
  test('any other diagnosis gets the same notice', () => {
    expect(weekendNotice({ ...base, condition: 'stones' })!.kind).toBe('goal');
  });
});

describe('tip line', () => {
  test('too little history: the general tip', () => {
    expect(weekendTip(history(6, 1000, 2000), false, WED)).toBe('Гадуур явахдаа саваа авч яваарай.');
    expect(weekendTip([], true, WED)).toBe('Цангавал мөс хөхөх, амаа зайлах тусална.');
  });
  test('under a limit, more on days off', () => {
    expect(weekendTip(history(28, 1700, 1400), true, WED)).toBe('Таны түүхээс: амралтын өдрүүдэд та дунджаар 300 мл илүү уудаг.');
  });
  test('with a goal, less on days off', () => {
    expect(weekendTip(history(28, 1600, 2000), false, WED)).toBe('Таны түүхээс: амралтын өдрүүдэд та дунджаар 400 мл бага уудаг.');
  });
  test('a gap under 100 мл: the general tip', () => {
    expect(weekendTip(history(28, 1950, 2000), false, WED)).toBe('Гадуур явахдаа саваа авч яваарай.');
  });
  test('the notice carries it', () => {
    expect(weekendNotice({ ...base, events: history(28, 1600, 2000) })!.card.tip).toContain('400 мл бага');
  });
});
