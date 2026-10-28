import { describe, expect, mock, test } from 'bun:test';

// home-limit.ts pulls in stylesheets; tests only need the logic.
mock.module('../src/hydration.css', () => ({}));
mock.module('../src/home-limit.css', () => ({}));
const { cupsText, nextDialysis, untilText } = await import('../src/home-limit');

describe('cupsText', () => {
  test('rounds down to a half cup', () => {
    expect(cupsText(400, 220)).toBe('≈ 1½ аяга');
    expect(cupsText(440, 220)).toBe('≈ 2 аяга');
    expect(cupsText(120, 220)).toBe('≈ ½ аяга');
  });
  test('the dial rounds down to a quarter', () => {
    expect(cupsText(500, 220, 0.25)).toBe('≈ 2¼ аяга');
  });
  test('less than the step, and nothing', () => {
    expect(cupsText(100, 220)).toBe('½ аяганаас бага');
    expect(cupsText(0, 220)).toBe('0 аяга');
    expect(cupsText(-300, 220)).toBe('0 аяга');
  });
});

describe('next dialysis', () => {
  const days = { days: [1, 3, 5], time: '08:00' }; // Да, Лх, Ба
  test('the next session day at its time', () => {
    const now = new Date(2026, 9, 28, 17, 0); // Wednesday 17:00
    const at = nextDialysis(days, now)!;
    expect([at.getDay(), at.getHours()]).toEqual([5, 8]);
    expect(untilText(at, now)).toBe('1 өдөр 15 цагийн дараа');
  });
  test('later today counts; Sunday is 7', () => {
    expect(nextDialysis(days, new Date(2026, 9, 28, 7, 0))!.getDate()).toBe(28);
    expect(nextDialysis({ days: [7], time: '09:30' }, new Date(2026, 9, 28))!.getDay()).toBe(0);
  });
  test('none set', () => {
    expect(nextDialysis({ days: [], time: '08:00' })).toBeNull();
  });
});
