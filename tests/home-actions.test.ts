import { describe, expect, test } from 'bun:test';
import { homeActions } from '../src/home-actions';

describe('homeActions', () => {
  test('kidney failure under a limit: thirst, dialysis, goal', () => {
    expect(homeActions('kidney', 'limit')).toEqual(['thirst', 'dialysis', 'plan']);
  });
  test('heart failure never shows dialysis', () => {
    expect(homeActions('heart', 'limit')).toEqual(['thirst', 'plan']);
    expect(homeActions('heart', 'goal')).not.toContain('dialysis');
  });
  test('every other diagnosis: goal and reminders', () => {
    for (const c of ['none', 'stones', 'pregnant', 'breastfeeding', 'other'] as const) {
      expect(homeActions(c, 'goal')).toEqual(['plan', 'reminder']);
      expect(homeActions(c, 'limit')).toEqual(['plan', 'reminder']);
    }
  });
  test('thirst only under a limit', () => {
    expect(homeActions('kidney', 'goal')).toEqual(['dialysis', 'plan', 'reminder']);
    expect(homeActions('heart', 'goal')).toEqual(['plan', 'reminder']);
  });
});
