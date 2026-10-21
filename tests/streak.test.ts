import { expect, mock, test } from 'bun:test';

// hydration.ts pulls in its stylesheet; tests only need the streak logic.
mock.module('../src/hydration.css', () => ({}));
const { streakParts } = await import('../src/hydration');

const at = (back: number, ml: number) => {
  const d = new Date(); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - back);
  return { id: crypto.randomUUID(), amount: ml, type: 'drink' as const, at: d.toISOString() };
};
const streak = (chip: string) => Number(chip.match(/<\/span>(\d+)<\/button>/)![1]);

test('an unfinished today keeps the streak up to yesterday', () => {
  expect(streak(streakParts([at(1, 2000), at(2, 2100), at(3, 2000), at(0, 500)], 2000, 'goal').chip)).toBe(3);
});

test('meeting the goal today adds one', () => {
  expect(streak(streakParts([at(0, 2000), at(1, 2000)], 2000, 'goal').chip)).toBe(2);
});

test('a missed day breaks the streak', () => {
  expect(streak(streakParts([at(1, 2000), at(3, 2000)], 2000, 'goal').chip)).toBe(1);
});

test("under a doctor's limit, days within it count and a day over it breaks the streak", () => {
  // today 300 and yesterday 1,400 are within 1,500; the day before went over.
  expect(streak(streakParts([at(0, 300), at(1, 1400), at(2, 1600), at(3, 1200)], 1500, 'limit').chip)).toBe(2);
});

test('the week strip always shows seven days', () => {
  expect(streakParts([], 2000, 'goal').week.match(/<li/g)!.length).toBe(7);
});
