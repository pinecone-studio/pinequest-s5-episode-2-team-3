// Daily water amount from age, weight, height, activity and condition, shared by the app and the Worker's /api/plan.
// General guidance only; kidney and heart failure always use the doctor's limit.
export const CONDITIONS = {
  none: 'Байхгүй',
  stones: 'Бөөрний чулуу',
  pregnant: 'Жирэмсэн',
  breastfeeding: 'Хөхүүл',
  kidney: 'Бөөрний дутагдал',
  heart: 'Зүрхний дутагдал',
  // Anything not listed; the user names it in conditionNote (up to 60 characters).
  other: 'Бусад',
} as const;
export type Condition = keyof typeof CONDITIONS;

// Exercise and physical work add sweat losses on top of the body-weight amount.
export const ACTIVITIES = {
  low: { label: 'Бага', hint: 'Ихэнхдээ суудаг', extra: 0 },
  medium: { label: 'Дунд', hint: '7 хоногт 2–3 удаа дасгал хийдэг', extra: 300 },
  high: { label: 'Их', hint: 'Өдөр бүр дасгал эсвэл хүнд ажил', extra: 600 },
} as const;
export type Activity = keyof typeof ACTIVITIES;

export const DOCTOR_DEFAULT = 1500;
export const ASK_DOCTOR = 'Эмчээсээ асуугаарай.';
export interface PlanInput { age: number; weight: number; height: number; activity: Activity; condition: Condition; doctorLimit?: number; conditionNote?: string }
export interface Plan { ml: number; mode: 'goal' | 'limit'; how: string }
export interface AiPlan { ml: number; mode: 'goal' | 'limit'; reason: string; warning: string }

const round50 = (ml: number) => Math.round(ml / 50) * 50;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Kidney and heart failure: only the doctor sets the amount, never the AI.
export const doctorOnly = (condition: string) => condition === 'kidney' || condition === 'heart';

export function calcPlan(p: PlanInput): Plan {
  if (doctorOnly(p.condition)) {
    return { ml: p.doctorLimit ?? DOCTOR_DEFAULT, mode: 'limit', how: 'Эмчийн заасан хязгаараас хэтрүүлэхгүй' };
  }
  let ml: number, how: string;
  if (p.age <= 8) { ml = 1200; how = '4–8 насны хүүхдэд'; }
  else if (p.age <= 13) { ml = 1600; how = '9–13 насны хүүхдэд'; }
  else {
    // Above BMI 30 extra body weight barely changes water need, so cap it there.
    const m = p.height / 100;
    const w = Math.min(p.weight, Math.round(30 * m * m));
    const perKg = p.age <= 17 ? 35 : p.age < 65 ? 33 : 30;
    ml = clamp(w * perKg, p.age >= 65 ? 1600 : 1000, 3500);
    how = `${w} кг × ${perKg} мл`;
  }
  const extra = ACTIVITIES[p.activity].extra;
  if (extra) { ml += extra; how += ` + ${extra} мл (хөдөлгөөн)`; }
  if (p.condition === 'stones') { ml = Math.max(ml, 2500); how += ', бөөрний чулуунд 2.5 л-ээс багагүй'; }
  if (p.condition === 'pregnant') { ml += 300; how += ' + 300 мл (жирэмсэн)'; }
  if (p.condition === 'breastfeeding') { ml += 700; how += ' + 700 мл (хөхүүл)'; }
  return { ml: round50(ml), mode: 'goal', how };
}

// The formula the user already knows, shown at the start of the AI's reason.
export const formula = (calc: Plan) => `Тооцоо: ${calc.how} = ${calc.ml} мл.`;

// Never trust the model's number: doctor-only conditions get the doctor's limit, and an amount more than
// 40% away from calcPlan falls back to calcPlan. An unlisted condition always tells the user to ask a doctor.
// Running it twice gives the same answer, so the app can check again what the Worker already checked.
export function guardPlan(p: PlanInput, ai: AiPlan): AiPlan {
  const plan = checkAmount(p, ai);
  if (p.condition === 'other' && !plan.warning.toLowerCase().includes('эмчээсээ асуугаарай')) plan.warning = `${plan.warning} ${ASK_DOCTOR}`.trim();
  return plan;
}

function checkAmount(p: PlanInput, ai: AiPlan): AiPlan {
  if (doctorOnly(p.condition)) {
    return {
      ml: p.doctorLimit ?? DOCTOR_DEFAULT,
      mode: 'limit',
      reason: 'Зүрх, бөөрний дутагдалтай үед өдрийн хэмжээг зөвхөн эмч тогтооно.',
      warning: 'Хязгаарыг заавал эмч тогтооно.',
    };
  }
  const calc = calcPlan(p);
  const ml = round50(clamp(Number(ai.ml) || calc.ml, 500, 4000));
  const warning = String(ai.warning ?? '').slice(0, 400);
  const reason = String(ai.reason ?? '').slice(0, 400);
  if (Math.abs(ml - calc.ml) > calc.ml * 0.4) {
    return {
      ml: calc.ml,
      mode: 'goal',
      reason: formula(calc),
      warning: [warning, `AI-ын санал (${ml} мл) тооцооноос хэт зөрсөн тул тооцоолсон хэмжээг харууллаа.`].filter(Boolean).join(' '),
    };
  }
  return {
    ml,
    mode: ai.mode === 'limit' ? 'limit' : 'goal',
    reason: reason.startsWith(formula(calc)) ? reason : `${formula(calc)} ${reason}`.trim(),
    warning,
  };
}
