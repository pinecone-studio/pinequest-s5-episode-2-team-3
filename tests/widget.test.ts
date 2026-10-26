import { expect, test } from 'bun:test';
import { widgetEntries, widgetMessage } from '../src/widget-data';

test('the nudge follows the mood, Duolingo style', () => {
  expect(widgetMessage(0, 2000, 'goal', 'Default', 0)).toBe('Эхний аягаа уугаарай 💧');
  expect(widgetMessage(750, 2000, 'goal', 'Default', 3)).toBe('Сайн явж байна! Дахиад 1,250 мл');
  expect(widgetMessage(500, 2000, 'goal', 'Worried', 3)).toBe('Ус уух цаг өнгөрлөө · дахиад 1,500 мл');
  expect(widgetMessage(500, 2000, 'goal', 'Sad', 5)).toBe('5 өдрийн streak-ээ алдах гэж байна!');
  expect(widgetMessage(500, 2000, 'goal', 'Sad', 0)).toBe('Өдөр дуусах гэж байна · 1,500 мл дутуу');
  expect(widgetMessage(500, 2000, 'goal', 'Crying', 0)).toBe('Streak тасарчихлаа… Өнөөдөр дахин эхэлье');
});

test('a met goal is celebrated whatever the mood', () => {
  expect(widgetMessage(2000, 2000, 'goal', 'Worried', 2)).toBe('Зорилт биеллээ! Гайхалтай 🎉');
  expect(widgetMessage(2600, 2000, 'goal', 'Default', 2)).toBe('Зорилт биеллээ! Гайхалтай 🎉');
});

test('under a doctor\'s limit it never asks for more water', () => {
  for (const mood of ['Default', 'Worried', 'Sad', 'Crying'] as const) {
    expect(widgetMessage(0, 1500, 'limit', mood, 0)).toBe('Хязгаартаа зөв явж байна');
  }
  expect(widgetMessage(1250, 1500, 'limit', 'Default', 0)).toBe('Хязгаарт ойртлоо · 250 мл үлдсэн');
  expect(widgetMessage(1600, 1500, 'limit', 'Default', 0)).toBe('Хязгаараас хэтэрлээ. Эмчийн заавраа санаарай');
});

test('widget taps become ordinary drinks with the widget\'s IDs', () => {
  const at = Date.UTC(2026, 9, 26, 3, 0);
  expect(widgetEntries([{ id: 'a1b2-c3', ml: 250, at }])).toEqual([
    { id: 'a1b2-c3', amount: 250, type: 'drink', at: new Date(at).toISOString() },
  ]);
});

test('malformed taps are skipped, never break the log', () => {
  const at = Date.UTC(2026, 9, 26, 3, 0);
  expect(widgetEntries(null)).toEqual([]);
  expect(widgetEntries('[]')).toEqual([]);
  expect(widgetEntries([
    { id: 'bad id!', ml: 250, at },
    { id: 'ok-1', ml: 'many', at },
    { id: 'ok-2', ml: 250, at: 'yesterday' },
    { id: 'ok-3', ml: 250, at },
  ]).map(e => e.id)).toEqual(['ok-3']);
});
