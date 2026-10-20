import { expect, test } from 'bun:test';
import { validateEntry, validateState } from './contracts';
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
