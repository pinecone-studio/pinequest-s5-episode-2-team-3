import type { Feel, Pet3D } from './pet3d';
import type { PetMood } from './pet';

// «Дусал» in 3D inside the home gauge, in place of the flat drop: a clear glass drop that fills with
// water as the day's total grows, breathes, blinks, sways and shows how it feels (six steps from
// parched to overjoyed, or sick, asleep). three.js loads after the first paint; until then, or without WebGL, the flat
// SVG drop stays. One live view for the whole visit: its host moves into each new gauge on redraw.
let pet: Pet3D | null = null;
let host: HTMLDivElement | null = null;
let failed = false, loading = false;
let feel: Feel = 'okay', shown: Feel | null = null, share = 0;

// The mood that drives blinking and waving for each face.
const MOOD: Record<Feel, PetMood> = { parched: 'thirsty', thirsty: 'thirsty', okay: 'good', good: 'good', happy: 'good', joyful: 'joyful', sick: 'sick', weak: 'weak' };
const STEPS: Feel[] = ['parched', 'thirsty', 'okay', 'good', 'happy', 'joyful'];
const apply = () => {
  if (!pet) return;
  // Each step up the scale it hops for joy.
  if (shown && STEPS.indexOf(feel) > STEPS.indexOf(shown)) pet.hop();
  shown = feel;
  pet.set({ kind: 'drop', mood: MOOD[feel], stage: 'big', water: true, feel }, false);
  pet.fill(share);
};

function attach(): void {
  const gauge = document.querySelector<HTMLElement>('.hx-gauge');
  if (!gauge || !host || !pet) return;
  if (host.parentElement !== gauge) gauge.append(host);
  gauge.classList.add('has-pet3d');
}

// Called after each home render with today's feeling and share of the goal.
export function placeHomePet(nextFeel: Feel, nextShare: number): void {
  feel = nextFeel; share = nextShare;
  if (pet) { attach(); apply(); return; }
  if (failed || loading) return;
  loading = true;
  void import('./pet3d').then(m => {
    host = document.createElement('div');
    host.className = 'hx-pet3d';
    host.setAttribute('aria-hidden', 'true');
    host.addEventListener('click', () => { if (!pet?.dragged()) pet?.hop(); });
    document.querySelector('.hx-gauge')?.append(host);
    try { pet = m.mountPet3d(host, { stage: false }); } catch { failed = true; host.remove(); return; }
    attach(); apply();
  }).catch(() => { failed = true; }).finally(() => { loading = false; });
}

// While the arc is dragged or a pour is previewed, the water follows the finger.
export function previewHomePet(nextShare: number): void { pet?.fill(nextShare); }

// A drink was added: it gulps, and cheers when that drink reached the goal.
export function homePetDrank(reached: boolean): void { if (reached) pet?.cheer(); else pet?.eat(); }

// Today's feeling, a step for each quarter of the goal: parched with nothing drunk, thirsty, okay
// from 25%, good from 50%, happy from 75% and overjoyed at the goal. Sick or asleep (missed days)
// stays until a quarter is in. Under a doctor's limit it is the pet's own mood: no reward for more.
export function homeFeel(petMood: PetMood, frac: number, limit: boolean): Feel {
  if (limit) return petMood;
  if ((petMood === 'sick' || petMood === 'weak') && frac < 0.25) return petMood;
  return frac >= 1 ? 'joyful' : frac >= 0.75 ? 'happy' : frac >= 0.5 ? 'good' : frac >= 0.25 ? 'okay' : frac > 0 ? 'thirsty' : 'parched';
}
