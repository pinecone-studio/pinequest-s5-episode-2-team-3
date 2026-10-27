import { beforeEach, describe, expect, mock, test } from 'bun:test';

// pet.ts uses hydration.ts, which pulls in its stylesheet; tests only need the logic.
mock.module('../src/hydration.css', () => ({}));
const { petState, unlockedKinds, readPetKind, writePetKind } = await import('../src/pet');
const { activeKind, feed, petGame, pickKind, readFed, shineFor, takeStageUp, takeStepBack } = await import('../src/pet-game');
const { XP_PER_DAY, XP_PER_FEED } = await import('../src/pet-config');

const store = new Map<string, string>();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: k => void store.delete(k) } as Storage;
beforeEach(() => store.clear());

const now = new Date(2026, 9, 27, 15, 0);
const GOAL = 2000;
const at = (back: number, ml: number, base = now) => {
  const d = new Date(base); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - back);
  return { id: crypto.randomUUID(), amount: ml, type: 'drink' as const, at: d.toISOString() };
};
const met = (...backs: number[]) => backs.map(b => at(b, GOAL));
const days = (n: number, from = 0) => met(...Array.from({ length: n }, (_, i) => i + from));
const game = (events: ReturnType<typeof at>[], when = now) => {
  const pet = petState(events, GOAL, 'goal', when);
  return { pet, game: petGame(events, GOAL, 'goal', pet, readFed(), when) };
};

describe('new user', () => {
  test('starts with the drop, no XP and nothing to feed', () => {
    const { pet, game: g } = game([]);
    expect(readPetKind(pet.best)).toBe('drop');
    expect(g).toMatchObject({ xp: 0, level: 1, canFeed: false, energy: 0, stageIndex: 0 });
    expect(g.badges.every(b => !b.got)).toBe(true);
  });
});

describe('XP and feeding', () => {
  test('the goal met today gives XP and a bowl to feed', () => {
    const { game: g } = game(met(0));
    expect(g).toMatchObject({ xp: XP_PER_DAY, canFeed: true, fedToday: false });
  });
  test('partial water does not count, and drinking past the goal gives no extra XP', () => {
    expect(game([at(0, GOAL - 1)]).game).toMatchObject({ xp: 0, canFeed: false });
    expect(game([at(0, GOAL * 3)]).game.xp).toBe(XP_PER_DAY);
  });
  test('the goal reached twice in one day counts once', () => {
    expect(game([...met(0), ...met(0)]).game.xp).toBe(XP_PER_DAY);
  });
  test('feeding works once a day; repeated taps change nothing', () => {
    const events = met(0);
    expect(feed(events, GOAL, 'goal', now)).toBe(true);
    expect(feed(events, GOAL, 'goal', now)).toBe(false);
    expect(game(events).game).toMatchObject({ xp: XP_PER_DAY + XP_PER_FEED, canFeed: false, fedToday: true, energy: 1 });
  });
  test('no bowl before the goal is met', () => {
    expect(feed([at(0, 500)], GOAL, 'goal', now)).toBe(false);
    expect(store.size).toBe(0);
  });
  test('progress survives reopening (it lives in the log and storage)', () => {
    const events = days(3);
    feed(events, GOAL, 'goal', now);
    expect(game(events).game.xp).toBe(3 * XP_PER_DAY + XP_PER_FEED);
  });
  test('a feed on a day whose log was deleted gives no XP', () => {
    feed(met(0), GOAL, 'goal', now);
    expect(game([]).game.xp).toBe(0);
  });
  test('the bowl refills on the next local day', () => {
    const events = [...met(0), at(-1, GOAL)];
    feed(events, GOAL, 'goal', now);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    expect(game(events, tomorrow).game.canFeed).toBe(true);
  });
});

describe('streaks, unlocks and badges', () => {
  test('consecutive days build the streak; a missed day resets it but keeps best, animals and badges', () => {
    expect(game(days(3)).pet.streak).toBe(3);
    const { pet, game: g } = game(days(7, 2));  // 7 in a row, then yesterday missed
    expect(pet).toMatchObject({ streak: 0, best: 7 });
    expect(unlockedKinds(pet.best)).toEqual(['drop', 'mouse', 'cat', 'rooster', 'frog', 'dog', 'bear']);
    expect(g.badges.filter(b => b.got).map(b => b.id)).toEqual(['first', 'd3', 'd7']);
  });
  test('milestones unlock exactly their animal, including 30 and the legend at 100', () => {
    expect(unlockedKinds(29)).not.toContain('sheep');
    expect(unlockedKinds(30)).toContain('sheep');
    expect(unlockedKinds(99)).not.toContain('legend');
    expect(unlockedKinds(100)).toContain('legend');
  });
  test('many days without a streak do not unlock animals', () => {
    const scattered = met(...Array.from({ length: 30 }, (_, i) => i * 2 + 1));  // every other day
    const { pet, game: g } = game(scattered);
    expect(pet.best).toBe(1);
    expect(g.level).toBeGreaterThan(5);
    expect(unlockedKinds(pet.best)).toEqual(['drop']);
  });
  test('only unlocked animals can be the companion', () => {
    writePetKind('dragon');
    expect(readPetKind(7)).toBe('drop');
    writePetKind('bear');
    expect(readPetKind(7)).toBe('bear');
  });
});

describe('evolution reveal', () => {
  test('first visit only remembers; a new stage plays once; going back never replays', () => {
    expect(takeStageUp('baby')).toBe(false);
    expect(takeStageUp('baby')).toBe(false);
    expect(takeStageUp('kid')).toBe(true);
    expect(takeStageUp('kid')).toBe(false);
    expect(takeStageUp('baby')).toBe(false);
  });
});

describe('the pet grows into animals by the current streak and steps back after a break', () => {
  test('with no pick it is the highest animal the current streak reaches', () => {
    expect(activeKind(0)).toBe('drop');
    expect(activeKind(3)).toBe('cat');
    expect(activeKind(30)).toBe('sheep');
    expect(activeKind(60)).toBe('dragon');
  });
  test('after a break it goes back, while the collection (by best) keeps everything', () => {
    const { pet } = game(days(7, 2));  // 7 in a row, then yesterday missed
    expect(activeKind(pet.streak)).toBe('drop');
    expect(unlockedKinds(pet.best)).toContain('bear');
  });
  test('a lower pick is kept; picking the top one goes back to growing by itself', () => {
    pickKind('cat', 14);
    expect(activeKind(14)).toBe('cat');
    expect(activeKind(2)).toBe('mouse');  // a pick the streak can't reach falls back to the highest it does
    pickKind('bunny', 14);
    expect(activeKind(30)).toBe('sheep');
  });
  test('a step back is told once', () => {
    expect(takeStepBack('bear')).toBeNull();
    expect(takeStepBack('drop')).toBe('bear');
    expect(takeStepBack('drop')).toBeNull();
    expect(takeStepBack('cat')).toBeNull();
  });
});

test('the sparkle grows every two levels up to four', () => {
  expect([1, 2, 3, 5, 7, 9, 30].map(shineFor)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  expect(game(days(6)).game.shine).toBe(1);  // 600 XP → level 3
});
