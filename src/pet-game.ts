import { dayKey, type WaterEntry } from './data';
import { dayCounter } from './hydration';
import { BADGES, ENERGY_DAYS, LEVELS_PER_SHINE, MAX_SHINE, XP_PER_DAY, XP_PER_FEED, XP_PER_LEVEL, type BadgeId } from './pet-config';
import { KINDS, STAGES, unlockedKinds, type Kind, type PetState, type Stage } from './pet';

// The game around «Дусалхан» (pet.ts): XP, level, the daily bowl and badges. Like the pet itself it is
// worked out from the water log, so deletes and sync can't leave it out of step. The only thing stored
// is which days the bowl was fed, and a feed only counts on a day that counted, so a deleted log takes
// its XP back with it instead of leaving a reward behind.
type Mode = 'goal' | 'limit';

export interface Game {
  xp: number;
  level: number;
  levelXp: number;          // XP into the current level
  stageIndex: number;       // 0 = egg … growth stage number shown as «Өсөлтийн үе»
  shine: number;            // 0…MAX_SHINE, how much the pet sparkles; grows with the level
  canFeed: boolean;         // today counted and its bowl is still full
  fedToday: boolean;
  energy: number;           // fed days among the last ENERGY_DAYS
  badges: { id: BadgeId; name: string; need: number; got: boolean }[];
}

const FED_KEY = 'dusal-pet-fed-v1';
export function readFed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FED_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
  } catch { return new Set(); }
}
function writeFed(fed: Set<string>): void {
  // Only the last few months matter for energy and XP shown; older days stay counted through `days`.
  try { localStorage.setItem(FED_KEY, JSON.stringify([...fed].sort().slice(-400))); } catch { /* the bowl fills again next time */ }
}

const back = (now: Date, n: number) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return dayKey(d); };

export function petGame(events: readonly WaterEntry[], goal: number, mode: Mode, pet: PetState, fed = readFed(), now = new Date()): Game {
  const met = dayCounter(events, goal, mode);
  const today = back(now, 0);
  const fedDays = [...fed].filter(k => k <= today && met(k));
  const xp = pet.days * XP_PER_DAY + fedDays.length * XP_PER_FEED;
  let energy = 0;
  for (let i = 0; i < ENERGY_DAYS; i++) if (fed.has(back(now, i)) && met(back(now, i))) energy++;
  return {
    xp,
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    shine: shineFor(Math.floor(xp / XP_PER_LEVEL) + 1),
    levelXp: xp % XP_PER_LEVEL,
    stageIndex: STAGES.findIndex(s => s.id === pet.stage),
    canFeed: met(today) && !fed.has(today),
    fedToday: fed.has(today) && met(today),
    energy,
    badges: BADGES.map(b => ({ ...b, got: pet.best >= b.need })),
  };
}

// Claims today's bowl. Returns false (and changes nothing) when there is nothing to claim, so repeated
// taps or a second tab can never feed twice.
export function feed(events: readonly WaterEntry[], goal: number, mode: Mode, now = new Date()): boolean {
  const today = back(now, 0);
  const fed = readFed();
  if (fed.has(today) || !dayCounter(events, goal, mode)(today)) return false;
  fed.add(today);
  writeFed(fed);
  return true;
}

// The highest stage this phone has shown, so reaching a new one plays the evolution reveal once.
// The very first visit only remembers it: an old user shouldn't get a reveal for growth from long ago.
const STAGE_KEY = 'dusal-pet-stage-v1';
export function takeStageUp(stage: Stage): boolean {
  const at = STAGES.findIndex(s => s.id === stage);
  try {
    const seen = localStorage.getItem(STAGE_KEY);
    const was = seen === null ? -1 : STAGES.findIndex(s => s.id === seen);
    if (at > was) localStorage.setItem(STAGE_KEY, stage);
    return seen !== null && at > was;
  } catch { return false; }
}

export const shineFor = (level: number) => Math.min(MAX_SHINE, Math.floor((level - 1) / LEVELS_PER_SHINE));

// Which animal the pet is right now. Animals stay in the collection for good (by the longest streak),
// but the pet can only *be* one the current streak reaches: it grows into the next animal by itself as
// the streak climbs, and after a break it goes back to the one the new streak allows, until it climbs
// again. A pick of a lower animal is kept; with no pick it is always the highest one reached.
const PICK_KEY = 'dusal-pet-kind-v1';
export const usableKinds = (streak: number): Kind[] => unlockedKinds(streak);
export function activeKind(streak: number): Kind {
  const usable = usableKinds(streak);
  try { const v = localStorage.getItem(PICK_KEY) as Kind | null; if (v && usable.includes(v)) return v; } catch { /* the highest below */ }
  return usable[usable.length - 1];
}
// Picking the highest reachable animal clears the pick, so the pet keeps growing by itself.
export function pickKind(kind: Kind, streak: number): void {
  const usable = usableKinds(streak);
  try { if (kind === usable[usable.length - 1]) localStorage.removeItem(PICK_KEY); else localStorage.setItem(PICK_KEY, kind); } catch { /* auto next time */ }
}

// The animal shown last time, so a step back after a break is told once, gently.
const SHOWN_KEY = 'dusal-pet-shown-v1';
export function takeStepBack(now: Kind): Kind | null {
  const at = (k: Kind) => KINDS.findIndex(x => x.id === k);
  try {
    const was = localStorage.getItem(SHOWN_KEY) as Kind | null;
    localStorage.setItem(SHOWN_KEY, now);
    return was && at(was) > at(now) ? was : null;
  } catch { return null; }
}
