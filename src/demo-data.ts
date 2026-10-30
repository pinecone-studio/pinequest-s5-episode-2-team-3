import type { AppState, WaterEntry } from './data';
import { save } from './storage';
import { setKind, setSalty, type Kind } from './drinks';
import { writeRules } from './drink-flags';
import { writeProfile } from './plan';
import { saveMember } from './member';
import { writeSettings } from './schedule';
import { about } from './prefs';
import { addWeight, logThirst, writeDialysis, writeDryWeight } from './progress-data';

// «Demo» on onboarding: a kidney-failure patient on dialysis with two weeks behind her, so «Түүх», «Явц»
// and the nurse's report have something to show at once. The first week runs over the doctor's 1,500 ml
// now and then (salty milk tea and soup, a cola she was told to skip, thirsty evenings); the second keeps
// within it, five days in a row up to today. Weights before and after each Mon/Wed/Fri session follow the
// water drunk in between. The same numbers every time (a fixed seed), only the dates move with today.
const LIMIT = 1500;
const DRY_KG = 68;
const DIALYSIS = { days: [1, 3, 5], time: '08:00' };
// Each past day's total, from 13 days ago to yesterday.
const TOTALS = [1820, 1700, 1450, 1900, 1650, 1480, 1620, 1580, 1440, 1420, 1350, 1460, 1300];
const SODA_DAYS = new Set([13, 10, 7]);
// Logged by the base (water placed on it); the rest by hand.
const BASE_ID = 'demo-base';

function random(seed: number): () => number {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

interface Slot { at: string; ml: number; kind?: Kind; salty?: boolean; base?: boolean }

// One day's drinks: pills with a little water, milk tea, soup at lunch and water from the base through the day.
function slots(ago: number, total: number | null): Slot[] {
  const over = total !== null && total > LIMIT;
  const list: Slot[] = [
    { at: '07:40', ml: 100, kind: 'medMix' },
    { at: '08:15', ml: 250, kind: 'milkTea', salty: ago >= 7 && ago % 2 === 1 },
    { at: '10:05', ml: 200, base: true },
    { at: '12:40', ml: 250, kind: 'soup', salty: ago >= 9 },
    { at: '14:30', ml: 200, base: true },
    ...(over && !SODA_DAYS.has(ago) ? [{ at: '16:20', ml: 150, kind: 'tea' as Kind }] : []),
    ...(SODA_DAYS.has(ago) ? [{ at: '17:10', ml: 330, kind: 'soda' as Kind }] : []),
    { at: '18:30', ml: 200, base: true },
  ];
  const sum = list.reduce((s, x) => s + x.ml, 0);
  list.push({ at: '20:10', ml: total === null ? 250 : total - sum, base: true });
  return list;
}

const dayAt = (ago: number, hhmm: string, jitter: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - ago);
  d.setHours(h, m + jitter, 0, 0);
  return d;
};

export async function seedKidneyDemo(name: string): Promise<boolean> {
  const rand = random(20261030);
  const now = Date.now();
  const events: WaterEntry[] = [];
  for (let ago = 13; ago >= 0; ago--) {
    const total = ago ? TOTALS[13 - ago] : null;
    for (const [i, s] of slots(ago, total).entries()) {
      const at = dayAt(ago, s.at, Math.round(rand() * 20) - 10);
      if (at.getTime() > now) continue;
      const id = `demo-${ago}-${i}`;
      events.push({ id, amount: s.ml, type: 'drink', at: at.toISOString(), ...(s.base ? { deviceId: BASE_ID } : {}) });
      setKind(id, s.kind);
      setSalty(id, !!s.salty);
    }
    // «Цангаж байна» opened: often in the first week, now and then after.
    const thirsty = ago >= 7 ? 2 : ago % 2 ? 1 : 0;
    for (let t = 0; t < thirsty; t++) { const at = dayAt(ago, t ? '21:00' : '15:30', Math.round(rand() * 30)); if (at.getTime() < now) logThirst(at); }
  }

  // Weights around each session: the gain follows the water drunk since the last one, the dry weight after.
  let after = DRY_KG + 0.2;
  let from = -Infinity;
  for (let ago = 13; ago >= 0; ago--) {
    const start = dayAt(ago, DIALYSIS.time, 0);
    if (!DIALYSIS.days.includes(start.getDay() || 7) || start.getTime() > now) continue;
    const drunk = events.reduce((s, e) => { const t = Date.parse(e.at); return t >= from && t < start.getTime() ? s + e.amount : s; }, 0);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    if (from > -Infinity) addWeight({ date, kg: after + drunk * 0.00068 + rand() * 0.2, tag: 'before' });
    // A session lasts about four hours; the weight after it comes once it is over.
    if (now >= start.getTime() + 4 * 3600e3 || ago > 0) { after = DRY_KG + 0.1 + rand() * 0.3; addWeight({ date, kg: after, tag: 'after' }); }
    from = start.getTime();
  }

  saveMember(name);
  writeProfile({ age: 62, weight: 70, height: 160, activity: 'low', condition: 'kidney', doctorLimit: LIMIT, doctorMode: 'limit', conditionNote: '' });
  about.write({ sex: 'female', climate: 'cold' });
  writeDialysis(DIALYSIS);
  writeDryWeight(DRY_KG);
  writeRules(['soda', 'saltySoup']);
  writeSettings({ wake: '07:00', sleep: '22:00', every: 2, on: true });
  const state: AppState = { goal: LIMIT, mode: 'limit', events };
  return (await save(state, true)) === 'saved';
}
