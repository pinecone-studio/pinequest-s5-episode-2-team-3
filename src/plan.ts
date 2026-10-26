// The saved profile; the amount itself is computed in shared/plan.ts so the Worker uses the same formula.
// General guidance only; kidney and heart failure always use the doctor's limit.
import { ACTIVITIES, CONDITIONS, type PlanInput } from '../shared/plan';

export { ACTIVITIES, CONDITIONS, calcPlan } from '../shared/plan';
export type { Activity, Condition, Plan } from '../shared/plan';
export const PROFILE_KEY = 'dusal-profile-v1';

export interface Profile extends PlanInput { doctorLimit: number; doctorMode: 'goal' | 'limit' }

const DEFAULT: Profile = { age: 30, weight: 65, height: 165, activity: 'low', condition: 'none', doctorLimit: 1500, doctorMode: 'limit' };
const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

export function validProfile(p: Partial<Profile>): p is Profile {
  return isInt(p.age, 4, 110) && isInt(p.weight, 10, 250) && isInt(p.height, 90, 230)
    && typeof p.activity === 'string' && Object.hasOwn(ACTIVITIES, p.activity)
    && typeof p.condition === 'string' && Object.hasOwn(CONDITIONS, p.condition) && isInt(p.doctorLimit, 500, 4000)
    && (p.doctorMode === 'goal' || p.doctorMode === 'limit');
}

export function readProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<Profile> | null;
    // Profiles saved before doctorMode or activity existed are still valid.
    const merged = p ? { doctorMode: DEFAULT.doctorMode, activity: DEFAULT.activity, ...p } : null;
    return merged && validProfile(merged) ? merged : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function writeProfile(p: Profile): boolean {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
