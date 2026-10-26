import { expect, test } from 'bun:test';
import { guardPlan, type PlanInput } from './plan';

const adult: PlanInput = { age: 40, weight: 70, height: 170, activity: 'low', condition: 'none' };

test('kidney and heart failure ignore the AI number and use the doctor limit', () => {
  for (const condition of ['kidney', 'heart'] as const) {
    expect(guardPlan({ ...adult, condition, doctorLimit: 1000 }, { ml: 3000, mode: 'goal', reason: '', warning: '' })).toMatchObject({ ml: 1000, mode: 'limit' });
    expect(guardPlan({ ...adult, condition }, { ml: 3000, mode: 'goal', reason: '', warning: '' })).toMatchObject({ ml: 1500, mode: 'limit' });
  }
});

test('checking twice gives the same answer, so the app can recheck the Worker', () => {
  for (const ml of [2400, 6000]) {
    const once = guardPlan(adult, { ml, mode: 'goal', reason: 'Учир нь.', warning: 'Анхаар.' });
    expect(guardPlan(adult, once)).toEqual(once);
  }
});
