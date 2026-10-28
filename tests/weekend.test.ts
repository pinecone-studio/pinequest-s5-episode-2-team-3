import { expect, mock, test } from 'bun:test';

mock.module('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));
mock.module('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
const { gapGainsMost, longestGap, weekendText } = await import('../src/weekend');

test('the longest gap between sessions', () => {
  expect(longestGap([1, 3, 5])).toEqual({ from: 5, to: 1, rest: 2 });  // Ба → Да
  expect(longestGap([2, 4, 6])).toEqual({ from: 6, to: 2, rest: 2 });  // Бя → Мя
  expect(longestGap([1])).toEqual({ from: 1, to: 1, rest: 6 });
  expect(longestGap([])).toBeNull();
  expect(longestGap([1, 2, 3, 4, 5, 6, 7])).toBeNull();
});

test('the reminder names the real days, time and limit', () => {
  expect(weekendText({ days: [1, 3, 5], time: '08:00' }, 1500)).toEqual({
    title: 'Амралтын 2 өдөр эхэлж байна',
    body: 'Дараагийн диализ Даваа 08:00. Өдөрт 1,500 мл-ээ барьж, давстай хоолоо цөөлөөрэй.',
  });
});

test('the weekend line only when the biggest gain is after the long gap', () => {
  const d = { days: [1, 3, 5], time: '08:00' };
  // 2026-10-23 is a Friday, 10-26 a Monday, 10-21 a Wednesday.
  const big = [{ from: '2026-10-21', to: '2026-10-23', kg: 1.8 }, { from: '2026-10-23', to: '2026-10-26', kg: 2.6 }];
  expect(gapGainsMost(d, big)).toBe(true);
  expect(gapGainsMost(d, [{ ...big[0], kg: 3 }, big[1]])).toBe(false);
  expect(gapGainsMost(d, [big[1]])).toBe(false);
});
