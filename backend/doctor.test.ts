import { beforeEach, describe, expect, mock, test } from 'bun:test';

// The Anthropic client is mocked: these tests never call the real API.
let answer: Record<string, unknown> = {};
const create = mock(async (_request: Record<string, unknown>) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] }));
mock.module('@anthropic-ai/sdk', () => ({ default: class { beta = { messages: { create } }; } }));
const { readDoctorNote } = await import('./src/doctor.js');
const { PlanError } = await import('./src/plan.js');

const env = { ANTHROPIC_API_KEY: 'test-key' };
const note = { text: 'Өдөрт 1.5 литрээс хэтрүүлэхгүй', wake: '07:00', sleep: '22:00' };
beforeEach(() => {
  create.mockClear();
  answer = { found: true, ml: 1500, mode: 'limit', times: [{ at: '12:00', ml: 500 }, { at: '08:00', ml: 500 }, { at: '17:00', ml: 500 }], summary: 'Өдөрт 1,500 мл-ээс хэтрүүлэхгүй.', warning: '' };
});

describe('reading the doctor\'s note', () => {
  test('the amount, mode and times come back, times in order', async () => {
    const r = await readDoctorNote(note, env);
    expect(r).toMatchObject({ found: true, ml: 1500, mode: 'limit' });
    expect(r.times.map((t: { at: string }) => t.at)).toEqual(['08:00', '12:00', '17:00']);
  });
  test('the photo is sent before the text', async () => {
    await readDoctorNote({ ...note, image: { mediaType: 'image/jpeg', data: 'abc' } }, env);
    const content = (create.mock.calls[0][0].messages as { content: { type: string }[] }[])[0].content;
    expect(content.map(c => c.type)).toEqual(['image', 'text']);
  });
  test('nothing to read is rejected before the API', async () => {
    await expect(readDoctorNote({ text: '  ' }, env)).rejects.toBeInstanceOf(PlanError);
    expect(create).not.toHaveBeenCalled();
  });
  test('no key: a clear error', async () => {
    await expect(readDoctorNote(note, {})).rejects.toMatchObject({ status: 503 });
  });
});

describe('the model is not trusted', () => {
  test('an amount outside 500–4000 ml is "not found"', async () => {
    answer = { ...answer, ml: 9000 };
    expect(await readDoctorNote(note, env)).toMatchObject({ found: false, ml: 0, times: [] });
  });
  test('times adding up to more than the limit are dropped', async () => {
    answer = { ...answer, times: [{ at: '08:00', ml: 1000 }, { at: '12:00', ml: 1000 }] };
    const r = await readDoctorNote(note, env);
    expect(r.times).toEqual([]);
    expect(r.warning).not.toBe('');
  });
  test('unreadable times are left out', async () => {
    answer = { ...answer, times: [{ at: '8 цаг', ml: 200 }, { at: '25:00', ml: 200 }, { at: '09:00', ml: 200 }] };
    expect((await readDoctorNote(note, env)).times).toEqual([{ at: '09:00', ml: 200 }]);
  });
  test('a refusal is an error, not an empty plan', async () => {
    create.mockImplementationOnce(async () => ({ stop_reason: 'refusal', content: [] }));
    await expect(readDoctorNote(note, env)).rejects.toMatchObject({ status: 502 });
  });
});
