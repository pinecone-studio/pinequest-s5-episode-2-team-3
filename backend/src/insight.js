import Anthropic from '@anthropic-ai/sdk';
import { doctorOnly } from '../../shared/plan.ts';
import { PlanError } from './plan.js';

// POST /api/insight: one short tip for right now from today's water and the watch (heart rate,
// steps, active calories) and how hot it feels. Numbers only come in, so there is no user text for
// the model to mistake for instructions. Same cheap setup as /api/plan.

const SYSTEM = `You are the water coach inside a hydration app in Mongolia. Reply in Mongolian (Cyrillic).
You get today's numbers: water drunk so far and the daily goal or a doctor's limit, the hour, steps, active calories, the latest heart rate from the person's watch and how hot it feels outside.
"text" is one or two short, friendly sentences about water right now that a 10-year-old or an 80-year-old can follow. Link it to the watch numbers when they matter (many steps or calories mean sweat; a resting heart rate that is high can come with too little water).
"extraMl" is how much to drink on top of the goal today because of activity or heat, rounded to 50, 0 when nothing extra is needed.
Under a doctor's limit never suggest drinking more: extraMl is 0 and the tip is about spreading the water across the day and not going over the limit.
If the heart rate is over 120 while the steps are low, or under 45, add in "text" that if it does not settle they should see a doctor. This is general guidance, not a diagnosis.`;

const SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One or two short sentences' },
    extraMl: { type: 'integer', description: 'Extra water for today on top of the goal, rounded to 50' },
  },
  required: ['text', 'extraMl'],
  additionalProperties: false,
};

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);

export function checkInsight(body) {
  const drink = num(body?.drink, 0, 20000), goal = num(body?.goal, 50, 10000), hour = num(body?.hour, 0, 23);
  if (drink === null || goal === null || hour === null || (body.mode !== 'goal' && body.mode !== 'limit')) {
    throw new PlanError(400, 'Өнөөдрийн ус, зорилт, цаг зөв байх ёстой.');
  }
  return {
    drink, goal, hour, mode: body.mode,
    condition: typeof body.condition === 'string' ? body.condition : 'none',
    steps: num(body.steps, 0, 200000), kcal: num(body.activeKcal, 0, 20000), bpm: num(body.bpm, 20, 250), feels: num(body.feels, -60, 60),
  };
}

// The model's answer, held to the app's rules: a doctor's limit never gets extra water, extra is
// 0–750 ml in steps of 50, and the text stays short.
export function guardInsight(input, answer) {
  const limit = input.mode === 'limit' || doctorOnly(input.condition);
  const extra = Number.isFinite(answer?.extraMl) ? Math.round(Math.min(750, Math.max(0, answer.extraMl)) / 50) * 50 : 0;
  const text = typeof answer?.text === 'string' ? answer.text.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  return { text, extraMl: limit ? 0 : extra };
}

export async function suggestInsight(body, env) {
  if (!env.ANTHROPIC_API_KEY) throw new PlanError(503, 'AI одоохондоо тохируулагдаагүй байна.');
  const p = checkInsight(body);
  const line = (label, v, unit) => `${label}: ${v === null ? 'unknown' : `${v}${unit}`}`;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 300,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `Water so far: ${p.drink} ml`,
        `${p.mode === 'limit' || doctorOnly(p.condition) ? "Doctor's daily limit" : 'Daily goal'}: ${p.goal} ml`,
        `Hour: ${p.hour}:00`,
        line('Steps today', p.steps, ''), line('Active calories', p.kcal, ' kcal'),
        line('Latest heart rate', p.bpm, ' bpm'), line('Feels like (today max)', p.feels, ' °C'),
      ].join('\n'),
    }],
  });
  if (response.stop_reason === 'refusal') throw new PlanError(502, 'AI хариулж чадсангүй.');
  let answer;
  try { answer = JSON.parse(response.content.find(b => b.type === 'text')?.text ?? ''); } catch { throw new PlanError(502, 'AI-ийн хариу уншигдсангүй.'); }
  const out = guardInsight(p, answer);
  if (!out.text) throw new PlanError(502, 'AI-ийн хариу хоосон байна.');
  return out;
}
