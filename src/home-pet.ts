import type { Pet3D } from './pet3d';
import type { PetMood } from './pet';

// «Дусал» in 3D inside the home gauge, in place of the flat drop: a clear glass drop that fills with
// water as the day's total grows, breathes, blinks, sways and shows how it feels (thirsty, fine,
// joyful, sick, asleep). three.js loads after the first paint; until then, or without WebGL, the flat
// SVG drop stays. One live view for the whole visit: its host moves into each new gauge on redraw.
let pet: Pet3D | null = null;
let host: HTMLDivElement | null = null;
let failed = false, loading = false;
let mood: PetMood = 'good', share = 0;

const apply = () => { pet?.set({ kind: 'drop', mood, stage: 'big', water: true }, false); pet?.fill(share); };

function attach(): void {
  const gauge = document.querySelector<HTMLElement>('.hx-gauge');
  if (!gauge || !host || !pet) return;
  if (host.parentElement !== gauge) gauge.append(host);
  gauge.classList.add('has-pet3d');
}

// Called after each home render with today's mood and share of the goal.
export function placeHomePet(nextMood: PetMood, nextShare: number): void {
  mood = nextMood; share = nextShare;
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

// Today's feeling: sick or asleep from missed days until half the water is in; then thirsty until
// half, fine after, and the pet's own (fine or joyful) once the goal is met.
export function homeMood(petMood: PetMood, frac: number, met: boolean, limit: boolean): PetMood {
  if (met || limit) return petMood;
  if ((petMood === 'sick' || petMood === 'weak') && frac < 0.5) return petMood;
  return frac >= 0.5 ? 'good' : 'thirsty';
}
