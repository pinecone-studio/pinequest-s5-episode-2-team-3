import { describe, expect, mock, test } from 'bun:test';

// home-limit.ts pulls in stylesheets; tests only need the logic.
mock.module('../src/hydration.css', () => ({}));
mock.module('../src/home-limit.css', () => ({}));
const { baseVoice, crossedNear, crossedOver, cupsText, nearLimit, nextDialysis, quickDrink, untilText } = await import('../src/home-limit');

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

describe('quick tiles', () => {
  const setup = (drink: number, limit: boolean) => {
    const added: [number, string | undefined, boolean][] = [], warned: number[] = [];
    const ctx = { drink, goal: 1500, limit, cup: 250, add: (ml: number, kind?: string, salty = false) => { added.push([ml, kind, salty]); } };
    const warn = (_: unknown, ml: number) => { warned.push(ml); };
    return { ctx, added, warned, warn };
  };
  test('water past the limit goes to the warning first', () => {
    const { ctx, added, warned, warn } = setup(1400, true);
    quickDrink(ctx, 'water', warn);
    expect(added).toEqual([]);
    expect(warned).toEqual([250]);
  });
  test('the 50 мл pill sip is added straight away, even past the limit', () => {
    const { ctx, added, warned, warn } = setup(1480, true);
    quickDrink(ctx, 'pill', warn);
    expect(added).toEqual([[50, undefined, false]]);
    expect(warned).toEqual([]);
  });
  test('a dissolved medicine is 100 мл of water; without a limit it adds directly', () => {
    const { ctx, added, warned, warn } = setup(1400, false);
    quickDrink(ctx, 'medMix', warn);
    expect(added).toEqual([[100, 'medMix', false]]);
    expect(warned).toEqual([]);
  });
  test('a dissolved medicine past the limit goes to the warning first', () => {
    const { ctx, added, warned, warn } = setup(1450, true);
    quickDrink(ctx, 'medMix', warn);
    expect(added).toEqual([]);
    expect(warned).toEqual([100]);
  });
});

describe('close to the limit', () => {
  test('from 80 % up to the limit itself, not past it', () => {
    expect(nearLimit(1199, 1500)).toBe(false);
    expect(nearLimit(1200, 1500)).toBe(true);
    expect(nearLimit(1500, 1500)).toBe(true);
    expect(nearLimit(1501, 1500)).toBe(false);
  });
  test('said once: only by the drink that crosses 80 %', () => {
    expect(crossedNear(1000, 1250, 1500)).toBe(true);
    expect(crossedNear(1250, 1400, 1500)).toBe(false);  // already close
    expect(crossedNear(1000, 1100, 1500)).toBe(false);  // not yet
    expect(crossedNear(1000, 1700, 1500)).toBe(false);  // straight past it: the over-limit popup says that
  });
  test('past it: only by the drink that goes over', () => {
    expect(crossedOver(1400, 1600, 1500)).toBe(true);
    expect(crossedOver(1000, 1700, 1500)).toBe(true);   // straight past it
    expect(crossedOver(1500, 1501, 1500)).toBe(true);   // exactly at it was not over yet
    expect(crossedOver(1600, 1700, 1500)).toBe(false);  // already over
    expect(crossedOver(1000, 1500, 1500)).toBe(false);  // reaching it is not passing it
  });
});

describe('baseVoice', () => {
  test('past the goal, every drink says by how much', () => {
    expect(baseVoice(900, 1100, 1000, false)).toEqual(['extra 100']);
    expect(baseVoice(1100, 1350, 1000, false)).toEqual(['extra 350']);
  });
  test('past a limit, the warning comes first', () => {
    expect(baseVoice(1100, 1200, 1000, true)).toEqual(['over', 'extra 200']);
  });
  test('reaching it exactly says so', () => {
    expect(baseVoice(900, 1000, 1000, false)).toEqual(['reached']);
  });
  test('within 200 ml says how much is left', () => {
    expect(baseVoice(700, 850, 1000, false)).toEqual([150]);
    expect(baseVoice(700, 995, 1000, true)).toEqual([10]);
    expect(baseVoice(500, 700, 1000, false)).toEqual([]);
  });
});
