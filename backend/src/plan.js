import Anthropic from '@anthropic-ai/sdk';

// POST /api/plan: daily water amount suggested by Claude from the user's profile.
// Needs the ANTHROPIC_API_KEY secret (`npx wrangler secret put ANTHROPIC_API_KEY`).

const CONDITIONS = {
  none: 'none',
  stones: 'kidney stones',
  pregnant: 'pregnant',
  breastfeeding: 'breastfeeding',
  kidney: 'kidney failure',
  heart: 'heart failure',
};

const SYSTEM = `You help people in Mongolia plan how much water to drink per day.
Reply in Mongolian (Cyrillic). Keep "reason" to one or two short sentences a 10-year-old or an 80-year-old can follow.
Base the amount on age, weight, height, activity and climate from the user's note. Typical healthy adults need about 30-35 ml per kg; children and older adults less.
For kidney stones aim for at least 2500 ml. Pregnancy adds about 300 ml, breastfeeding about 700 ml.
For kidney failure or heart failure, do not invent a number: set mode "limit", use the doctor's limit if the note gives one, otherwise 1500 ml, and say in "warning" that the doctor must set the limit.
If anything in the note sounds like an emergency or a condition that changes fluid needs, say in "warning" that they should ask a doctor.
This is general guidance, not a diagnosis.`;

const SCHEMA = {
  type: 'object',
  properties: {
    ml: { type: 'integer', description: 'Daily amount in millilitres' },
    mode: { type: 'string', enum: ['goal', 'limit'], description: 'goal = drink at least this much; limit = do not exceed' },
    reason: { type: 'string' },
    warning: { type: 'string', description: 'Empty string when there is nothing to warn about' },
  },
  required: ['ml', 'mode', 'reason', 'warning'],
  additionalProperties: false,
};

export class PlanError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function checkProfile(body) {
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!body || !int(body.age, 4, 110) || !int(body.weight, 10, 250) || !int(body.height, 90, 230) || !Object.hasOwn(CONDITIONS, body.condition)) {
    throw new PlanError(400, 'Нас 4–110, жин 10–250 кг, өндөр 90–230 см, онош зөв байх ёстой.');
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  return { age: body.age, weight: body.weight, height: body.height, condition: body.condition, note };
}

export async function suggestPlan(body, env) {
  if (!env.ANTHROPIC_API_KEY) throw new PlanError(503, 'AI одоохондоо тохируулагдаагүй байна. Тооцоолох эсвэл эмчийн заавраа ашиглана уу.');
  const p = checkProfile(body);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Age: ${p.age}\nWeight: ${p.weight} kg\nHeight: ${p.height} cm\nCondition: ${CONDITIONS[p.condition]}\nNote from the user: ${p.note || '(none)'}`,
    }],
  });

  if (response.stop_reason === 'refusal') throw new PlanError(502, 'AI хариулж чадсангүй. Тооцоолох эсвэл эмчийн заавраа ашиглана уу.');
  const text = response.content.find(block => block.type === 'text')?.text;
  let plan;
  try { plan = JSON.parse(text ?? ''); } catch { throw new PlanError(502, 'AI-ийн хариу уншигдсангүй. Дахин оролдоно уу.'); }

  // Never trust the model on safety limits: clamp, and force doctor-set limits for kidney/heart failure.
  const doctorOnly = p.condition === 'kidney' || p.condition === 'heart';
  const ml = Math.round(Math.min(4000, Math.max(500, Number(plan.ml) || 2000)) / 50) * 50;
  return {
    ml,
    mode: doctorOnly ? 'limit' : plan.mode === 'limit' ? 'limit' : 'goal',
    reason: String(plan.reason ?? '').slice(0, 400),
    warning: doctorOnly && !plan.warning ? 'Хязгаарыг заавал эмч тогтооно.' : String(plan.warning ?? '').slice(0, 400),
  };
}
