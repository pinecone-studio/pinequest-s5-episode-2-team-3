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

// 70 kg × 33 ml = 2310 → 2300 ml; ±40% allows 1380–3220 ml.
describe('precise amount', () => {
  test('the AI amount is used, rounded to 50 ml, after the formula the user knows', async () => {
    answer = { ml: 2333, mode: 'goal', reason: 'Халуунд бага зэрэг нэмлээ.', warning: '' };
    const plan = await suggestPlan(adult, env);
    expect(plan).toEqual({ ml: 2350, mode: 'goal', reason: 'Тооцоо: 70 кг × 33 мл = 2300 мл. Халуунд бага зэрэг нэмлээ.', warning: '' });
  });
  test('activity reaches the AI together with the baseline', async () => {
    answer = { ml: 2600, mode: 'goal', reason: 'Дасгалд нэмсэн.', warning: '' };
    const plan = await suggestPlan({ ...adult, activity: 'medium' }, env);
    const prompt = (create.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(prompt).toContain('Activity: medium');
    expect(prompt).toContain('Baseline: 2600 ml (70 кг × 33 мл + 300 мл (хөдөлгөөн))');
    expect(plan.reason).toStartWith('Тооцоо: 70 кг × 33 мл + 300 мл (хөдөлгөөн) = 2600 мл.');
  });
  test('more than 40% away from the formula falls back to it with a warning', async () => {
    for (const ml of [1000, 3500, 9000]) {
      answer = { ml, mode: 'goal', reason: 'Буруу тоо.', warning: '' };
      const plan = await suggestPlan(adult, env);
      expect(plan).toMatchObject({ ml: 2300, mode: 'goal', reason: 'Тооцоо: 70 кг × 33 мл = 2300 мл.' });
      expect(plan.warning).toContain('тооцооноос хэт зөрсөн');
    }
    answer = { ml: 3200, mode: 'goal', reason: '', warning: '' };
    expect((await suggestPlan(adult, env)).ml).toBe(3200);
  });
  test('older apps without activity still work; an unknown activity is rejected', async () => {
    expect((await suggestPlan(adult, env)).ml).toBe(3000);
    await expect(suggestPlan({ ...adult, activity: 'extreme' }, env)).rejects.toBeInstanceOf(PlanError);
  });
});
