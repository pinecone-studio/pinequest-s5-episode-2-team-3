import { beforeEach, describe, expect, mock, test } from 'bun:test';

// The Anthropic client is mocked: these tests never call the real API.
let answer: Record<string, unknown> = {};
const create = mock(async (_request: Record<string, unknown>) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] }));
mock.module('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
const { suggestPlan, PlanError } = await import('./src/plan.js');

const env = { ANTHROPIC_API_KEY: 'test-key' };
const adult = { age: 40, weight: 70, height: 170, condition: 'none', note: '' };
beforeEach(() => {
  create.mockClear();
  answer = { ml: 3000, mode: 'goal', reason: 'Их ус уу.', warning: '' };
});

describe('kidney and heart failure', () => {
  for (const condition of ['kidney', 'heart']) {
    test(`${condition}: AI says 3000 ml, the doctor's limit comes back`, async () => {
      const plan = await suggestPlan({ ...adult, condition, doctorLimit: 1200 }, env);
      expect(plan.ml).toBe(1200);
      expect(plan.mode).toBe('limit');
      expect(plan.warning).not.toBe('');
      expect(create).not.toHaveBeenCalled();
    });
    test(`${condition}: no doctor's limit sent, 1500 ml`, async () => {
      const plan = await suggestPlan({ ...adult, condition }, env);
      expect(plan).toMatchObject({ ml: 1500, mode: 'limit' });
    });
  }
  test('a doctor limit outside 500–4000 is rejected', async () => {
    await expect(suggestPlan({ ...adult, condition: 'heart', doctorLimit: 5000 }, env)).rejects.toBeInstanceOf(PlanError);
    await expect(suggestPlan({ ...adult, condition: 'heart', doctorLimit: '1200' }, env)).rejects.toBeInstanceOf(PlanError);
  });
});

describe('other conditions', () => {
  test('the AI amount is used, clamped and rounded to 50 ml', async () => {
    answer = { ml: 2333, mode: 'goal', reason: 'Насанд хүрэгчид.', warning: '' };
    expect((await suggestPlan(adult, env)).ml).toBe(2350);
    answer = { ml: 9000, mode: 'goal', reason: '', warning: '' };
    expect((await suggestPlan(adult, env)).ml).toBe(4000);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
