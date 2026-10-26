// Daily water amount from age, weight, height, activity and condition.
// General guidance only; kidney and heart failure always use the doctor's limit.
import { doctorOnly } from '../shared/plan';

export const PROFILE_KEY = 'dusal-profile-v1';

export const CONDITIONS = {
  none: 'Байхгүй',
  stones: 'Бөөрний чулуу',
  pregnant: 'Жирэмсэн',
  breastfeeding: 'Хөхүүл',
  kidney: 'Бөөрний дутагдал',
  heart: 'Зүрхний дутагдал',
} as const;
export type Condition = keyof typeof CONDITIONS;

// Exercise and physical work add sweat losses on top of the body-weight amount.
export const ACTIVITIES = {
  low: { label: 'Бага', hint: 'Ихэнхдээ суудаг', extra: 0 },
  medium: { label: 'Дунд', hint: '7 хоногт 2–3 удаа дасгал хийдэг', extra: 300 },
  high: { label: 'Их', hint: 'Өдөр бүр дасгал эсвэл хүнд ажил', extra: 600 },
} as const;
export type Activity = keyof typeof ACTIVITIES;

export interface Profile { age: number; weight: number; height: number; activity: Activity; condition: Condition; doctorLimit: number; doctorMode: 'goal' | 'limit' }
export interface Plan { ml: number; mode: 'goal' | 'limit'; how: string }

const DEFAULT: Profile = { age: 30, weight: 65, height: 165, activity: 'low', condition: 'none', doctorLimit: 1500, doctorMode: 'limit' };
const round50 = (ml: number) => Math.round(ml / 50) * 50;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
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

export function calcPlan(p: Profile): Plan {
  if (doctorOnly(p.condition)) {
    return { ml: p.doctorLimit, mode: 'limit', how: 'Эмчийн заасан хязгаараас хэтрүүлэхгүй' };
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
