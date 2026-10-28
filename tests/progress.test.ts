import { beforeEach, describe, expect, test } from 'bun:test';
import { addWeight, dayKept, gains, keptGainDiff, readDialysis, readDialysisDays, readWeights, streaks, writeDialysis, type Weight } from '../src/progress-data';
import type { WaterEntry } from '../src/data';

const store = new Map<string, string>();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: k => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
beforeEach(() => store.clear());

let n = 0;
const drink = (day: string, amount: number): WaterEntry => ({ id: `e${n++}`, amount, type: 'drink', at: new Date(`${day}T12:00`).toISOString() });

describe('dayKept', () => {
  test('limit: something drunk and within the limit', () => {
    expect(dayKept(0, 1500, 'limit')).toBe(false);
    expect(dayKept(1500, 1500, 'limit')).toBe(true);
    expect(dayKept(1501, 1500, 'limit')).toBe(false);
  });
  test('goal: reached', () => {
    expect(dayKept(1999, 2000, 'goal')).toBe(false);
    expect(dayKept(2000, 2000, 'goal')).toBe(true);
  });
});

describe('streaks', () => {
  const today = '2026-10-28';
  test('counts days in a row ending yesterday; today does not count yet', () => {
    const events = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'].map(d => drink(d, 1200));
    expect(streaks(events, 1500, 'limit', today)).toEqual({ current: 4, best: 4 });
  });
  test('a day over the limit or without entries breaks it; the longest run is kept', () => {
    const events = [
      ...['2026-10-10', '2026-10-11', '2026-10-12'].map(d => drink(d, 1000)),
      drink('2026-10-13', 1800),
      ...['2026-10-20', '2026-10-21'].map(d => drink(d, 900)),
      drink('2026-10-27', 1000),
    ];
    expect(streaks(events, 1500, 'limit', today)).toEqual({ current: 1, best: 3 });
  });
  test('a missing yesterday means no current streak', () => {
    expect(streaks([drink('2026-10-26', 1000)], 1500, 'limit', today).current).toBe(0);
  });
});

describe('weights and gains', () => {
  const w = (date: string, kg: number, tag: Weight['tag']): Weight => ({ date, kg, tag });
  test('gain = this before minus the previous after', () => {
    const list = [w('2026-10-21', 60.2, 'after'), w('2026-10-23', 62, 'before'), w('2026-10-23', 60.4, 'after'), w('2026-10-26', 63, 'before')];
    expect(gains(list)).toEqual([{ from: '2026-10-21', to: '2026-10-23', kg: 1.8 }, { from: '2026-10-23', to: '2026-10-26', kg: 2.6 }]);
  });
  test('a before without an earlier after has no gain', () => {
    expect(gains([w('2026-10-23', 62, 'before')])).toEqual([]);
  });
  test('the same day and tag replaces the earlier entry; bad values are refused', () => {
    expect(addWeight(w('2026-10-23', 62, 'before'))).toBe(true);
    expect(addWeight(w('2026-10-23', 61.55, 'before'))).toBe(true);
    expect(addWeight(w('2026-10-23', 5, 'after'))).toBe(false);
    expect(readWeights()).toEqual([w('2026-10-23', 61.6, 'before')]);
  });
  test('kept intervals compared with the others', () => {
    const g = [{ from: '2026-10-19', to: '2026-10-21', kg: 2.5 }, { from: '2026-10-21', to: '2026-10-23', kg: 1.5 }];
    const events = [drink('2026-10-19', 1800), drink('2026-10-20', 1400), drink('2026-10-21', 1000), drink('2026-10-22', 1200)];
    expect(keptGainDiff(g, events, 1500)).toBe(1);
    expect(keptGainDiff(g.slice(1), events, 1500)).toBeNull();
  });
});

test('dialysis days: 1 = Monday … 7 = Sunday, read back as getDay() numbers', () => {
  writeDialysis({ days: [7, 5, 1, 3], time: '07:30' });
  expect(readDialysis()).toEqual({ days: [1, 3, 5, 7], time: '07:30' });
  expect(readDialysisDays()).toEqual([1, 3, 5, 0]);
});
test('dialysis days saved by the first version still load', () => {
  localStorage.setItem('dusal-dialysis-days-v1', JSON.stringify([5, 1, 3]));
  expect(readDialysis()).toEqual({ days: [1, 3, 5], time: '08:00' });
});
