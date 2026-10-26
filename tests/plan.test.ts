import { beforeEach, expect, test } from 'bun:test';
import { PROFILE_KEY, readProfile, writeProfile } from '../src/plan';

const store = new Map<string, string>();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } as Storage;
beforeEach(() => store.clear());

test('profiles saved before conditionNote existed still load', () => {
  store.set(PROFILE_KEY, JSON.stringify({ age: 50, weight: 80, height: 175, activity: 'medium', condition: 'stones', doctorLimit: 1500, doctorMode: 'limit' }));
  expect(readProfile()).toMatchObject({ age: 50, weight: 80, condition: 'stones', conditionNote: '' });
});

test('the "other" condition and its note are saved and read back', () => {
  writeProfile({ ...readProfile(), condition: 'other', conditionNote: 'чихрийн шижин' });
  expect(readProfile()).toMatchObject({ condition: 'other', conditionNote: 'чихрийн шижин' });
});
