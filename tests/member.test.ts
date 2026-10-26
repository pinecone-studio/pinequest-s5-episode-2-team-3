import { expect, test } from 'bun:test';
import { cleanName } from '../src/member';
import { validateReport } from '../shared/family';

test('names follow the server\'s rule: spaces collapsed, at most 24 characters', () => {
  expect(cleanName('  Сараа  ')).toBe('Сараа');
  expect(cleanName('Бат   Эрдэнэ')).toBe('Бат Эрдэнэ');
  expect(cleanName('   ')).toBe('');
  expect(cleanName('А'.repeat(40))).toHaveLength(24);
});

test('every cleaned name is one the leaderboard accepts', () => {
  const report = (name: string) => ({ name, avatar: 'bottle', day: '2026-10-26', drinkMl: 500, goalMl: 2000, mode: 'goal' });
  for (const raw of ['  Сараа  ', 'Бат   Эрдэнэ', 'Ээж', 'А'.repeat(40)]) {
    expect(validateReport(report(cleanName(raw))).name).toBe(cleanName(raw));
  }
});
