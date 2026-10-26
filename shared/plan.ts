// Safety rules for the AI's daily amount, shared by the app and the Worker's /api/plan.
// The app checks again so it stays safe against an older Worker.
export const DOCTOR_DEFAULT = 1500;
export interface AiPlan { ml: number; mode: 'goal' | 'limit'; reason: string; warning: string }

// Kidney and heart failure: only the doctor sets the amount, never the AI.
export const doctorOnly = (condition: string) => condition === 'kidney' || condition === 'heart';

export function guardPlan(p: { condition: string; doctorLimit?: number }, ai: AiPlan): AiPlan {
  if (doctorOnly(p.condition)) {
    return {
      ml: p.doctorLimit ?? DOCTOR_DEFAULT,
      mode: 'limit',
      reason: 'Зүрх, бөөрний дутагдалтай үед өдрийн хэмжээг зөвхөн эмч тогтооно.',
      warning: 'Хязгаарыг заавал эмч тогтооно.',
    };
  }
  return {
    ml: Math.round(Math.min(4000, Math.max(500, Number(ai.ml) || 2000)) / 50) * 50,
    mode: ai.mode === 'limit' ? 'limit' : 'goal',
    reason: String(ai.reason ?? '').slice(0, 400),
    warning: String(ai.warning ?? '').slice(0, 400),
  };
}
