import { expect, test } from 'bun:test';
import { classify, isFresh, MAX_STABLE_GAP_MS, validateDeviceCache, validateDeviceStatus, type ReadingState } from './device';
import type { DeviceReading } from './contracts';

const origin = Date.parse('2026-10-20T04:00:00.000Z');
function reading(id: string, remainingMl: number | null, seconds: number, capacityMl = 750): DeviceReading {
  const base = { version: 1 as const, id, deviceId: 'bottle-01', at: new Date(origin + seconds * 1000).toISOString(), capacityMl };
  return remainingMl === null ? { ...base, stable: false, remainingMl: null } : { ...base, stable: true, remainingMl };
}
const anchored = (r: DeviceReading): ReadingState => ({ reading: r, baselineMl: r.remainingMl, lastStableAt: r.at });

test('first reading is a baseline; stable decrease is a drink and increase is a refill', () => {
  const first = classify(null, reading('a', 750, 0));
  expect(first).toMatchObject({ outcome: 'baseline', amount: 0 });
  const drink = classify(first.next, reading('b', 500, 10));
  expect(drink).toMatchObject({ outcome: 'drink', amount: 250 });
  expect(classify(drink.next, reading('c', 750, 20))).toMatchObject({ outcome: 'refill', amount: 0 });
});

test('lifted bottle is unstable and keeps the anchor; old or equal timestamps are stale', () => {
  const start = anchored(reading('a', 750, 0));
  const lifted = classify(start, reading('b', null, 5));
  expect(lifted).toMatchObject({ outcome: 'unstable', amount: 0 });
  expect(lifted.next.baselineMl).toBe(750);
  expect(classify(lifted.next, reading('c', 600, 10))).toMatchObject({ outcome: 'drink', amount: 150 });
  expect(classify(start, reading('old', 100, 0))).toMatchObject({ outcome: 'stale', next: start });
});

test('drops under 5 ml are not a drink yet, but they accumulate against one anchor', () => {
  let current = anchored(reading('a', 750, 0));
  for (const [i, ml] of [748, 747, 746].entries()) {
    const step = classify(current, reading(`s${i}`, ml, i + 1));
    expect(step.outcome).toBe('noise');
    current = step.next;
  }
  expect(classify(current, reading('s3', 744, 4))).toMatchObject({ outcome: 'drink', amount: 6 });
  expect(classify(anchored(reading('b', 500, 0)), reading('up', 540, 1))).toMatchObject({ outcome: 'refill', amount: 0 });
});

test('long stable gap or capacity change resyncs without inventing a drink', () => {
  const start = anchored(reading('a', 750, 0));
  const later = { ...reading('b', 200, 0), at: new Date(origin + MAX_STABLE_GAP_MS + 1).toISOString() };
  expect(classify(start, later)).toMatchObject({ outcome: 'resync', amount: 0 });
  expect(classify(start, reading('c', 300, 10, 1000))).toMatchObject({ outcome: 'baseline', amount: 0 });
});

test('continuous unchanged readings keep the baseline valid beyond five minutes', () => {
  let current = anchored(reading('first', 750, 0));
  for (let seconds = 30; seconds <= 600; seconds += 30) current = classify(current, reading(`r-${seconds}`, 750, seconds)).next;
  expect(classify(current, reading('drink', 500, 610)).amount).toBe(250);
});

test('status freshness checks both measurement and receive time; caches reject duplicates', () => {
  const status = validateDeviceStatus({ reading: reading('a', 700, 0), receivedAt: new Date(origin).toISOString(), outcome: 'baseline' });
  expect(isFresh(status, origin + 30_000)).toBe(true);
  expect(isFresh(status, origin + 61_000)).toBe(false);
  expect(isFresh({ ...status, receivedAt: new Date(origin + 120_000).toISOString() }, origin + 121_000)).toBe(false);
  expect(() => validateDeviceStatus({ ...status, outcome: 'exploded' })).toThrow();
  expect(validateDeviceCache({ selectedId: 'bottle-01', devices: [status] }).selectedId).toBe('bottle-01');
  expect(() => validateDeviceCache({ selectedId: null, devices: [status, status] })).toThrow();
});
