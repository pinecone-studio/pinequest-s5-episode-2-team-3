import { beforeEach, describe, expect, mock, test } from 'bun:test';

// The Anthropic client is mocked: these tests never call the real API.
let answer: Record<string, unknown> = {};
const create = mock(async (_request: Record<string, unknown>) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] }));
mock.module('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
const { suggestInsight } = await import('./src/insight.js');
const { PlanError } = await import('./src/plan.js');

const env = { ANTHROPIC_API_KEY: 'test-key' };
const today = { drink: 900, goal: 2500, mode: 'goal', hour: 14, steps: 12000, activeKcal: 600, bpm: 82, feels: 31 };
beforeEach(() => {
  create.mockClear();
  answer = { text: 'Өнөөдөр их алхсан тул ус нэмж уугаарай.', extraMl: 520 };
});

describe('/api/insight', () => {
  test('extra water is rounded to 50 and the watch numbers reach the model', async () => {
    const out = await suggestInsight(today, env);
    expect(out).toEqual({ text: 'Өнөөдөр их алхсан тул ус нэмж уугаарай.', extraMl: 500 });
    const content = (create.mock.calls[0][0].messages as { content: string }[])[0].content;
    expect(content).toContain('Steps today: 12000');
    expect(content).toContain('Latest heart rate: 82 bpm');
  });

  test('extra is capped at 750 ml and never negative', async () => {
    answer = { text: 'Уу.', extraMl: 3000 };
    expect((await suggestInsight(today, env)).extraMl).toBe(750);
    answer = { text: 'Уу.', extraMl: -200 };
    expect((await suggestInsight(today, env)).extraMl).toBe(0);
  });

  test("a doctor's limit never gets extra water", async () => {
    answer = { text: 'Их уу.', extraMl: 500 };
    expect((await suggestInsight({ ...today, mode: 'limit' }, env)).extraMl).toBe(0);
    expect((await suggestInsight({ ...today, condition: 'heart' }, env)).extraMl).toBe(0);
  });

  test('missing watch numbers are sent as unknown', async () => {
    await suggestInsight({ drink: 0, goal: 2000, mode: 'goal', hour: 8 }, env);
    const content = (create.mock.calls[0][0].messages as { content: string }[])[0].content;
    expect(content).toContain('Latest heart rate: unknown');
  });

  test('bad input is refused before the model is called', async () => {
    await expect(suggestInsight({ ...today, goal: 0 }, env)).rejects.toBeInstanceOf(PlanError);
    await expect(suggestInsight({ ...today, mode: 'more' }, env)).rejects.toBeInstanceOf(PlanError);
    expect(create).not.toHaveBeenCalled();
  });

  test('without a key it answers 503', async () => {
    await expect(suggestInsight(today, {})).rejects.toMatchObject({ status: 503 });
  });
});
