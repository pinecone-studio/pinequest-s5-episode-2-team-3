import { expect, test } from 'bun:test';
import { familyCard } from '../src/family-view';
import type { Leaderboard } from '../shared/family';

const board = (members: Leaderboard['members']): Leaderboard => ({ baseId: 'dusal-a1b2', day: '2026-10-26', members });
const row = (over: Partial<Leaderboard['members'][number]>) =>
  ({ rank: 1, name: 'Сараа', avatar: 'bottle', drinkMl: 1500, goalMl: 2000, mode: 'goal' as const, pct: 75, me: false, ...over });

test('ranked members show medals and their share of their own goal', () => {
  const html = familyCard(board([row({ rank: 1, name: 'Сараа', pct: 105, drinkMl: 2100 }), row({ rank: 2, name: 'Бат', pct: 72, me: true })]));
  expect(html).toContain('fam-medal gold');
  expect(html).toContain('fam-medal silver');
  expect(html).toContain('105%');
  expect(html).toContain('Бат <small>(та)</small>');
});

test('a doctor\'s limit is never ranked or cheered on', () => {
  const html = familyCard(board([row({ rank: null, name: 'Аав', mode: 'limit', drinkMl: 1200, goalMl: 1500, pct: 80 })]));
  expect(html).toContain('Хязгаартаа <svg class="md-icon"');
  expect(html).toContain('fam-limit');
  expect(html).not.toContain('<span class="fam-value">80%</span>');
  expect(familyCard(board([row({ rank: null, mode: 'limit', drinkMl: 1600, goalMl: 1500, pct: 107 })]))).toContain('Хязгаараас хэтэрсэн');
});

test('names from other phones cannot inject markup', () => {
  const html = familyCard(board([row({ name: '<img src=x onerror=alert(1)>', avatar: '"><script>' })]));
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;img');
});

test('a family of one says so', () => {
  expect(familyCard(board([]))).toContain('Одоогоор зөвхөн та байна');
});
