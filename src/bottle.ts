import { devices } from './devices';
import './bottle.css';
import type { WaterEntry } from './data';

// Bottle state lives in its own key so the shared `dusal-v1` format stays untouched.
const BOTTLE_KEY = 'dusal-bottle-v1';
const CAPACITIES = [500, 750, 1000];
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);

interface BottleState { capacity: number; refilledAt: string | null }

function readBottle(): BottleState {
  try {
    const raw = JSON.parse(localStorage.getItem(BOTTLE_KEY) ?? 'null') as Partial<BottleState> | null;
    const capacity = CAPACITIES.includes(raw?.capacity as number) ? raw!.capacity! : 750;
    const refilledAt = typeof raw?.refilledAt === 'string' && Number.isFinite(Date.parse(raw.refilledAt)) ? raw.refilledAt : null;
    return { capacity, refilledAt };
  } catch {
    return { capacity: 750, refilledAt: null };
  }
}

function writeBottle(next: BottleState): boolean {
  try { localStorage.setItem(BOTTLE_KEY, JSON.stringify(next)); return true; } catch { return false; }
}

// Without a refill on record, assume the bottle was filled at the start of today.
function since(bottle: BottleState): number {
  if (bottle.refilledAt) return Date.parse(bottle.refilledAt);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return start.getTime();
}

// Every logged amount left the bottle: drunk, spilled, or not yet decided.
// Using more than one bottle means it was refilled, so count from the last full bottle.
function remaining(events: readonly WaterEntry[], bottle: BottleState): number {
  const from = since(bottle);
  const used = events.reduce((sum, e) => (Date.parse(e.at) >= from ? sum + e.amount : sum), 0);
  if (used <= bottle.capacity) return bottle.capacity - used;
  const rest = used % bottle.capacity;
  return rest === 0 ? 0 : bottle.capacity - rest;
}

// Body geometry inside the 240×400 viewBox; water level moves within it.
const BODY_TOP = 118, BODY_BOTTOM = 320;
let shownFrac: number | null = null;

const levelY = (frac: number) => (BODY_BOTTOM - BODY_TOP) * (1 - frac);
const BODY = 'M98 74 V62 H142 V74 C142 90 172 94 172 130 V300 A20 20 0 0 1 152 320 H88 A20 20 0 0 1 68 300 V130 C68 94 98 90 98 74Z';

export function bottleStatus(events: readonly WaterEntry[]): { left: number | null; capacity: number; frac: number; measured: boolean } {
  if (devices.cache.selectedId) {
    const reading = devices.selected?.reading;
    const left = reading?.stable ? reading.remainingMl : null;
    const capacity = reading?.capacityMl ?? 0;
    return { left, capacity, frac: left === null ? 0 : left / capacity, measured: true };
  }
  const bottle = readBottle();
  const left = remaining(events, bottle);
  return { left, capacity: bottle.capacity, frac: left / bottle.capacity, measured: false };
}

// The bottle standing on the smart base, with its own small controls underneath.
export function bottleSection(events: readonly WaterEntry[]): string {
  const bottle = readBottle();
  const { left, capacity, frac, measured } = bottleStatus(events);
  const low = left !== null && frac <= 0.15;
  const startFrac = left === null ? 0 : shownFrac ?? frac;
  const wave = (y: number, amp: number) => `M-240 ${y} q30 -${amp} 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V460 H-240Z`;
  return `<div class="bottle-card${left === null ? ' unknown' : ''}${low ? ' low' : ''}" data-frac="${frac}">
    <div class="bottle-art" aria-hidden="true">
      <svg viewBox="0 0 240 400">
        <defs>
          <clipPath id="bottle-clip"><path d="${BODY}"/></clipPath>
          <linearGradient id="g-glass" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".55" stop-color="#eef5ff" stop-opacity=".75"/><stop offset="1" stop-color="#d7e6fb" stop-opacity=".9"/></linearGradient>
          <linearGradient id="g-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8ff"/><stop offset="1" stop-color="#2f6fe0"/></linearGradient>
          <linearGradient id="g-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4558"/><stop offset="1" stop-color="#12161f"/></linearGradient>
          <linearGradient id="g-sleeve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#0f9488"/></linearGradient>
          <linearGradient id="g-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4454"/><stop offset="1" stop-color="#0d1118"/></linearGradient>
          <radialGradient id="g-shadow"><stop offset="0" stop-color="#1d2734" stop-opacity=".35"/><stop offset="1" stop-color="#1d2734" stop-opacity="0"/></radialGradient>
          <radialGradient id="g-led"><stop offset="0" stop-color="#9ff3ff"/><stop offset="1" stop-color="#9ff3ff" stop-opacity="0"/></radialGradient>
        </defs>
        <ellipse cx="120" cy="384" rx="104" ry="12" fill="url(#g-shadow)"/>
        <g class="bottle-body">
          <path class="glass" d="${BODY}" fill="url(#g-glass)"/>
          <g clip-path="url(#bottle-clip)">
            <g class="water" style="transform: translateY(${levelY(startFrac)}px)">
              <path class="wave back" d="${wave(BODY_TOP, 9)}"/>
              <path class="wave front" d="${wave(BODY_TOP + 5, 8)}" fill="url(#g-water)"/>
              <circle class="bubble b1" cx="96" cy="300" r="4"/><circle class="bubble b2" cx="146" cy="306" r="3"/><circle class="bubble b3" cx="120" cy="312" r="5"/>
            </g>
          </g>
          <path class="outline" d="${BODY}"/>
          <rect class="shine" x="80" y="136" width="9" height="118" rx="4.5"/>
          <rect class="shine soft" x="152" y="150" width="5" height="60" rx="2.5"/>
          <rect class="cap" x="90" y="26" width="60" height="38" rx="11" fill="url(#g-cap)"/>
          <circle cx="120" cy="45" r="14" fill="url(#g-led)" class="cap-glow"/>
          <circle class="cap-light" cx="120" cy="45" r="6"/>
          <g class="face">
            <g class="eyes"><circle cx="102" cy="206" r="7"/><circle cx="138" cy="206" r="7"/></g>
            <circle class="glint" cx="104" cy="204" r="2.4"/><circle class="glint" cx="140" cy="204" r="2.4"/>
            <ellipse class="blush" cx="89" cy="222" rx="8" ry="4.5"/><ellipse class="blush" cx="151" cy="222" rx="8" ry="4.5"/>
            <path class="mouth" d="${low ? 'M111 230 Q120 222 129 230' : 'M109 224 Q120 236 131 224'}"/>
          </g>
        </g>
        <rect x="60" y="298" width="120" height="40" rx="13" fill="url(#g-sleeve)"/>
        <rect x="70" y="305" width="100" height="5" rx="2.5" fill="#ffffff" opacity=".45"/>
        <rect x="34" y="334" width="172" height="40" rx="16" fill="url(#g-base)"/>
        <rect x="48" y="338" width="144" height="3" rx="1.5" fill="#ffffff" opacity=".18"/>
        <circle cx="184" cy="354" r="12" fill="url(#g-led)" class="base-glow"/>
        <circle cx="184" cy="354" r="4.5" fill="#9ff3ff"/>
        <path class="sip-drop" d="M120 2 C120 2 112 13 112 18 A8 8 0 0 0 128 18 C128 13 120 2 120 2Z"/>
      </svg>
    </div>
    <div class="bottle-meta">
      <span class="meta-pill"><b>${left === null ? '?' : number(left)}</b> / ${capacity ? number(capacity) : '?'} мл · ${measured ? (devices.online ? 'хэмжилт' : 'сүүлчийн хэмжилт') : 'тооцоолсон'}</span>
      ${measured ? '' : `
      <label class="visually-hidden" for="bottle-capacity">Савны багтаамж</label>
      <select id="bottle-capacity" class="meta-select">${CAPACITIES.map(c => `<option value="${c}" ${c === bottle.capacity ? 'selected' : ''}>${number(c)} мл сав</option>`).join('')}</select>
      <button class="meta-button" id="bottle-refill" type="button">Дүүргэсэн</button>`}
    </div>
  </div>`;
}

// Animate from the previously shown level to the new one; wobble + drop when water went down.
export function bindBottle(onChange: () => void) {
  const card = document.querySelector<HTMLElement>('.bottle-card');
  if (!card) return;
  const frac = Number(card.dataset.frac);
  const water = card.querySelector<SVGGElement>('.water')!;
  const drank = shownFrac !== null && frac < shownFrac - 0.001;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    water.style.transform = `translateY(${levelY(frac)}px)`;
    if (drank) card.classList.add('sip');
  }));
  shownFrac = frac;
  card.querySelector('#bottle-refill')?.addEventListener('click', () => {
    if (writeBottle({ ...readBottle(), refilledAt: new Date().toISOString() })) onChange();
  });
  card.querySelector<HTMLSelectElement>('#bottle-capacity')?.addEventListener('change', event => {
    const capacity = Number((event.target as HTMLSelectElement).value);
    if (writeBottle({ ...readBottle(), capacity })) onChange();
  });
}

export { BOTTLE_KEY };
