import { describe, expect, mock, test } from 'bun:test';

// pet.ts uses hydration.ts, which pulls in its stylesheet; tests only need the logic.
mock.module('../src/hydration.css', () => ({}));
const { petState, petSvg } = await import('../src/pet');

const now = new Date(2026, 9, 27, 15, 0);  // a fixed afternoon, local time
const GOAL = 2000;
const at = (back: number, ml: number) => {
  const d = new Date(now); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - back);
  return { id: crypto.randomUUID(), amount: ml, type: 'drink' as const, at: d.toISOString() };
};
// Days back that met the goal, e.g. met(3, 2, 1).
const met = (...backs: number[]) => backs.map(b => at(b, GOAL));
const pet = (events: ReturnType<typeof at>[], mode: 'goal' | 'limit' = 'goal', goal = GOAL) => petState(events, goal, mode, now);

describe('mood', () => {
  test('no days yet: a calm egg', () => {
    expect(pet([])).toMatchObject({ stage: 'egg', mood: 'good', streak: 0, days: 0, nextStageIn: 1 });
    expect(pet([at(0, 500)])).toMatchObject({ stage: 'egg', mood: 'good' });
  });
  test('a 3-day streak with today met is joyful', () => {
    expect(pet(met(2, 1, 0))).toMatchObject({ stage: 'baby', mood: 'joyful', streak: 3, days: 3, nextStageIn: 4 });
  });
  test('1–2 days with today met is good', () => {
    expect(pet(met(1, 0))).toMatchObject({ mood: 'good', streak: 2 });
  });
  test('today still open after a met yesterday: thirsty, with what is left', () => {
    const p = pet([...met(3, 2, 1), at(0, 800)]);
    expect(p).toMatchObject({ mood: 'thirsty', streak: 3 });
    expect(p.line).toBe('Дусалхан цангаж байна — өнөөдөр 1.2 л дутуу');
  });
  test('the streak broke yesterday: sick, and the line says why', () => {
    expect(pet([...met(3, 2), at(0, 300)])).toMatchObject({ mood: 'sick', streak: 0 });
    expect(pet(met(3, 2)).line).toBe('Өчигдөр уугаагүй тул Дусалхан өвдчихлөө. Өнөөдөр зорилтоо биелүүлээд эдгээгээрэй.');
    expect(pet([...met(3, 2), at(1, 900)]).line).toStartWith('Өчигдөр зорилт биелээгүй тул');
  });
  test('4 days in a row without water: very weak, but it keeps its stage and never dies', () => {
    const p = pet(met(12, 11, 10, 9, 8, 7, 6, 5));
    expect(p).toMatchObject({ mood: 'weak', stage: 'kid', days: 8, streak: 0 });
    expect(p.line).toContain('4 өдөр');
  });
  test('one day met after being sick brings it back to good', () => {
    expect(pet([...met(4, 3), ...met(0)])).toMatchObject({ mood: 'good', streak: 1 });
    expect(pet([...met(9, 8), ...met(0)])).toMatchObject({ mood: 'good', streak: 1 });
  });
  test('a custom name goes into the line', () => {
    expect(petState(met(1), GOAL, 'goal', now, 'Бөмбөг').line).toStartWith('Бөмбөг цангаж байна');
  });
});

describe('doctor limit', () => {
  const LIMIT = 1500;
  test('days within the limit count; it is never thirsty and never asks for more water', () => {
    const ok = pet([at(2, 1200), at(1, 1400)], 'limit', LIMIT);
    expect(ok).toMatchObject({ mood: 'good', streak: 2, days: 2 });
    expect(ok.line).not.toContain('уу');
    expect(pet([at(2, 1200), at(1, 1400), at(0, 1000)], 'limit', LIMIT)).toMatchObject({ mood: 'joyful', streak: 3 });
  });
  test('going over the limit yesterday counts as a missed day', () => {
    const p = pet([at(2, 1200), at(1, 2500)], 'limit', LIMIT);
    expect(p.mood).toBe('sick');
    expect(p.line).toContain('хязгаартаа багтаагаад');
  });
});

describe('stages', () => {
  const days = (n: number) => met(...Array.from({ length: n }, (_, i) => i));
  test('egg → baby → kid → big → giant by days that counted', () => {
    expect(pet(days(1)).stage).toBe('baby');
    expect(pet(days(7))).toMatchObject({ stage: 'kid', nextStageIn: 14 });
    expect(pet(days(21)).stage).toBe('big');
    expect(pet(days(60))).toMatchObject({ stage: 'giant', nextStageIn: null });
  });
});

test('the picture is labelled for screen readers', () => {
  const p = pet(met(3, 2));
  expect(petSvg(p, 'Дусалхан', 't')).toContain('role="img" aria-label="Дусалхан, нялх шат, өвдсөн"');
  expect(petSvg(p, 'Дусалхан', 't', true)).toContain('aria-hidden="true"');
});
