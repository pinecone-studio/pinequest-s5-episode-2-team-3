import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ACK_CHAR, DRINK_CHAR, ID_CHAR, SCALE_SERVICE, STATUS_CHAR, ackBytes, deviceIdFrom, drinkEntry, parseDrink, parseStatus } from '../src/scale-protocol';

const view = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

test('Bluetooth UUIDs match the firmware', () => {
  const firmware = readFileSync(new URL('../firmware/firmware.ino', import.meta.url), 'utf8');
  const uuid = (name: string) => firmware.match(new RegExp(`#define ${name}\\s+"([^"]+)"`))?.[1];
  expect([uuid('SERVICE_UUID'), uuid('STATUS_UUID'), uuid('DRINK_UUID'), uuid('ACK_UUID'), uuid('ID_UUID')])
    .toEqual([SCALE_SERVICE, STATUS_CHAR, DRINK_CHAR, ACK_CHAR, ID_CHAR]);
});

test('status: weight, water left and unknown states', () => {
  // calibrated + bottle set, present, 741 g, 531 ml left of 600, 2 waiting
  expect(parseStatus(view(3, 2, 0xe5, 0x02, 0x13, 0x02, 0x58, 0x02, 2))).toEqual({
    calibrated: true, bottleSet: true, phase: 'present', weightG: 741, remainingMl: 531, capacityMl: 600, waiting: 2,
  });
  // lifted: negative weight after a bottle tare, remaining -1 = unknown
  const lifted = parseStatus(view(1, 1, 0x2e, 0xff, 0xff, 0xff, 0, 0, 0));
  expect([lifted.phase, lifted.weightG, lifted.remainingMl, lifted.bottleSet]).toEqual(['empty', -210, null, false]);
  expect(() => parseStatus(view(1, 7, 0, 0, 0, 0, 0, 0, 0))).toThrow();
  expect(() => parseStatus(view(1, 2, 0))).toThrow();
});

test('drink: fixed ID, time from seconds ago, unknown time logged on arrival', () => {
  // boot 3, n 12, 109 ml, 90 s ago
  const drink = parseDrink(view(3, 0, 0, 0, 12, 0, 0, 0, 109, 0, 90, 0, 0, 0))!;
  expect(drink).toEqual({ boot: 3, n: 12, amountMl: 109, secondsAgo: 90 });
  const received = Date.parse('2026-10-24T10:00:00Z');
  expect(drinkEntry('dusal-a1b2', drink, received)).toEqual({
    id: 'dusal-a1b2-e-3-12', amount: 109, type: 'drink', at: '2026-10-24T09:58:30.000Z', deviceId: 'dusal-a1b2',
  });
  const earlier = parseDrink(view(2, 0, 0, 0, 1, 0, 0, 0, 150, 0, 0xff, 0xff, 0xff, 0xff))!;
  expect(earlier.secondsAgo).toBeNull();
  expect(drinkEntry('dusal-a1b2', earlier, received).at).toBe('2026-10-24T10:00:00.000Z');
  expect(parseDrink(view())).toBeNull();
  expect(() => drinkEntry('dusal-a1b2', { ...drink, amountMl: 0 }, received)).toThrow();
});

test('ack echoes boot and n; device ID is validated', () => {
  expect([...new Uint8Array(ackBytes({ boot: 3, n: 258, amountMl: 1, secondsAgo: 0 }).buffer)]).toEqual([3, 0, 0, 0, 2, 1, 0, 0]);
  expect(deviceIdFrom(new DataView(new TextEncoder().encode('dusal-a1b2').buffer))).toBe('dusal-a1b2');
  expect(() => deviceIdFrom(new DataView(new TextEncoder().encode('bad id!').buffer))).toThrow();
});
