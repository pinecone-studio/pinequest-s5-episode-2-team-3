import { expect, test } from 'bun:test';
import { CONTRACT_VERSION, validateDeviceReading, validateEntry, validateState } from './contracts';
const event = { id: 'bottle-01-event-1', amount: 200, type: 'drink', at: '2026-10-20T04:00:00.000Z', deviceId: 'bottle-01' };

  test('old browser backups remain valid; device identity survives round trips', () => {
    const old = { goal: 2000, mode: 'goal', events: [{ id: 'manual-1', amount: 100, type: 'drink', at: event.at }] };
    expect(validateState(old)).toEqual(old);
    expect(validateState({ ...old, events: [event] }).events[0]).toEqual(event);
    expect(() => validateState({ ...old, events: [event, event] })).toThrow();
    for (const body of [null, [], { ...event, amount: 1.5 }, { ...event, deviceId: '../x' }, { ...event, type: 'refill' }]) {
      expect(() => validateEntry(body)).toThrow();
    }
  });

  test('stable zero means empty; unstable has no claimed remaining volume', () => {
    const reading = { version: CONTRACT_VERSION, id: 'bottle-01-reading-1', deviceId: 'bottle-01', at: event.at, capacityMl: 750, stable: true, remainingMl: 0 };
    expect(validateDeviceReading(reading)).toEqual(reading);
    expect(validateDeviceReading({ ...reading, stable: false, remainingMl: null }).remainingMl).toBeNull();
    for (const bad of [{ remainingMl: 751 }, { stable: false }, { version: 2 }, { capacityMl: 0 }]) {
      expect(() => validateDeviceReading({ ...reading, ...bad })).toThrow();
    }
  });
