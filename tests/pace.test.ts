import { expect, test } from 'bun:test';
import { agoText, dayShare, expectedBy, lastDrink, pace, paceText, sinceText, sinceTone } from '../src/pace';

// A fixed local day so the tests don't depend on when they run.
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m);
const drink = (h: number, m: number, ml = 200, type: 'drink' | 'spill' = 'drink') =>
  ({ id: crypto.randomUUID(), amount: ml, type, at: at(h, m).toISOString() });

test('the goal spreads over 08:00–22:00', () => {
  expect(dayShare(at(8))).toBe(0);
  expect(dayShare(at(15))).toBe(0.5);
  expect(dayShare(at(22))).toBe(1);
  expect(expectedBy(2000, at(15))).toBe(1000);
  expect(expectedBy(2200, at(15))).toBe(1100);
});

test('behind: shows what should be drunk by now and a sad or worried face', () => {
  const p = pace(600, 2200, 'goal', at(15));
  expect(p).toEqual({ kind: 'behind', expected: 1100, face: 'worried' });
  expect(paceText(p, 600)).toBe('Одоогоор <b>1,100 мл</b> байх ёстой · та <b>600 мл</b>');
  expect(pace(300, 2200, 'goal', at(15))).toMatchObject({ kind: 'behind', face: 'sad' });
});

test('on pace: a little short still counts, and the text praises', () => {
  expect(pace(1000, 2200, 'goal', at(15))).toEqual({ kind: 'ahead', expected: 1100 });
  const ahead = pace(1500, 2200, 'goal', at(15));
  expect(ahead.kind).toBe('ahead');
  expect(paceText(ahead, 1500)).toContain('сайн');
  expect(pace(2200, 2200, 'goal', at(15))).toEqual({ kind: 'done' });
});

test('night: before 08:00 and from 22:00 nothing is behind', () => {
  expect(pace(0, 2000, 'goal', at(6, 30))).toEqual({ kind: 'night', early: true });
  expect(pace(300, 2000, 'goal', at(22, 15))).toEqual({ kind: 'night', early: false });
  expect(paceText({ kind: 'night', early: true }, 0)).toBe('Өдрийн хэмжээ 08:00-аас эхэлнэ');
});

test("limit mode never asks for more water, only how close the doctor's limit is", () => {
  // 15:00 with only 100 ml would be far behind on a goal; under a limit it is simply fine.
  expect(pace(100, 1500, 'limit', at(15))).toEqual({ kind: 'limit-ok' });
  expect(pace(1250, 1500, 'limit', at(15))).toEqual({ kind: 'limit-near' });
  expect(pace(1600, 1500, 'limit', at(15))).toEqual({ kind: 'limit-over' });
  expect(paceText({ kind: 'limit-ok' }, 100)).toBe('Хязгаартаа зөв явж байна');
  expect(paceText({ kind: 'limit-near' }, 1250)).toBe('Хязгаарт ойртож байна');
});

test('a day with no entries: behind once the day is under way, with no last drink', () => {
  expect(pace(0, 2000, 'goal', at(12))).toMatchObject({ kind: 'behind', face: 'sad' });
  expect(pace(0, 2000, 'goal', at(8, 30))).toMatchObject({ kind: 'ahead' });
  expect(lastDrink([], at(12))).toBeNull();
  expect(sinceText(null, at(12))).toBe('Өнөөдөр хараахан уугаагүй байна');
});

test('last drink: latest drink at or before now, spills and future entries ignored', () => {
  const events = [drink(9, 0), drink(11, 50), drink(12, 30, 100, 'spill'), drink(18, 0)];
  expect(lastDrink(events, at(14))!.getTime()).toBe(at(11, 50).getTime());
  expect(sinceText(lastDrink(events, at(14)), at(14))).toBe('Сүүлд 2 цаг 10 мин өмнө уусан');
});

test('time since the last drink: amber after 90 min, red after 180', () => {
  expect(sinceTone(89)).toBe('ok');
  expect(sinceTone(90)).toBe('warn');
  expect(sinceTone(179)).toBe('warn');
  expect(sinceTone(180)).toBe('alert');
  expect(agoText(45)).toBe('45 мин');
  expect(agoText(120)).toBe('2 цаг');
  expect(sinceText(at(14), at(14))).toBe('Сая уусан');
});
