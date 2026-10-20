// Daily water amount from age, weight, height and condition.
// General guidance only; kidney and heart failure always use the doctor's limit.
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

export interface Profile { age: number; weight: number; height: number; condition: Condition; doctorLimit: number }
export interface Plan { ml: number; mode: 'goal' | 'limit'; how: string }

const DEFAULT: Profile = { age: 30, weight: 65, height: 165, condition: 'none', doctorLimit: 1500 };
const round50 = (ml: number) => Math.round(ml / 50) * 50;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

export function validProfile(p: Partial<Profile>): p is Profile {
  return isInt(p.age, 4, 110) && isInt(p.weight, 10, 250) && isInt(p.height, 90, 230)
    && typeof p.condition === 'string' && Object.hasOwn(CONDITIONS, p.condition) && isInt(p.doctorLimit, 500, 4000);
}

export function readProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<Profile> | null;
    return p && validProfile(p) ? p : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function writeProfile(p: Profile): boolean {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export function calcPlan(p: Profile): Plan {
  if (p.condition === 'kidney' || p.condition === 'heart') {
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
  if (p.condition === 'stones') { ml = Math.max(ml, 2500); how += ', бөөрний чулуунд 2.5 л-ээс багагүй'; }
  if (p.condition === 'pregnant') { ml += 300; how += ' + 300 мл (жирэмсэн)'; }
  if (p.condition === 'breastfeeding') { ml += 700; how += ' + 700 мл (хөхүүл)'; }
  return { ml: round50(ml), mode: 'goal', how };
}
