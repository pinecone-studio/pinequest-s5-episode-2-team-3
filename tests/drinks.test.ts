import { beforeEach, expect, mock, test } from 'bun:test';

// drinks.ts uses hydrify.ts, which pulls in a stylesheet; tests only need the logic.
mock.module('../src/hydration.css', () => ({}));
const store = new Map<string, string>();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: k => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
const { entryName, kindOf, setKind, setSalty } = await import('../src/drinks');
const { forbidden, writeRules } = await import('../src/drink-flags');
beforeEach(() => store.clear());

const entry = (id: string) => ({ id, amount: 200, type: 'drink' as const, at: '2026-10-28T10:00:00.000Z' });

test('wine, beer and liquor read as alcohol; the dropped kinds keep their old names', () => {
  store.set('dusal-drink-kind-v1', JSON.stringify({ a: 'wine', b: 'beer', c: 'coconut', d: 'sport' }));
  expect(kindOf(entry('a'))).toBe('alcohol');
  expect(entryName(entry('b'))).toBe('Согтууруулах ундаа');
  expect(kindOf(entry('c'))).toBeUndefined();
  expect(entryName(entry('c'))).toBe('Наргил');
  expect(entryName(entry('d'))).toBe('Спорт ундаа');
});

test('salty milk tea says so', () => {
  setKind('m', 'milkTea'); setSalty('m', true);
  expect(entryName(entry('m'))).toBe('Сүүтэй цай · давстай');
});

test('what the doctor ruled out', () => {
  expect(forbidden('juice', false)).toBe(false);
  writeRules(['potassium', 'saltySoup']);
  expect(forbidden('juice', false)).toBe(true);
  expect(forbidden('chocolate', false)).toBe(true);
  expect(forbidden('soup', false)).toBe(false);
  expect(forbidden('soup', true)).toBe(true);
  expect(forbidden('alcohol', false)).toBe(false);
});
