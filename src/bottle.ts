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

// Body geometry inside the 200×300 viewBox; water level moves within it.
const BODY_TOP = 92, BODY_BOTTOM = 284;
let shownFrac: number | null = null;

const levelY = (frac: number) => (BODY_BOTTOM - BODY_TOP) * (1 - frac);

export function bottleSection(events: readonly WaterEntry[]): string {
  const bottle = readBottle();
  const left = remaining(events, bottle);
  const frac = left / bottle.capacity;
  const low = frac <= 0.15;
  const startFrac = shownFrac ?? frac;
  return `<section class="bottle-card${low ? ' low' : ''}" aria-labelledby="bottle-title" data-frac="${frac}">
    <div class="bottle-art" aria-hidden="true">
      <svg viewBox="0 0 200 300">
        <defs>
          <clipPath id="bottle-clip"><path d="M72 72 V60 H128 V72 C128 84 168 88 168 122 V256 A28 28 0 0 1 140 284 H60 A28 28 0 0 1 32 256 V122 C32 88 72 84 72 72Z"/></clipPath>
        </defs>
        <g class="bottle-body">
          <path class="glass" d="M72 72 V60 H128 V72 C128 84 168 88 168 122 V256 A28 28 0 0 1 140 284 H60 A28 28 0 0 1 32 256 V122 C32 88 72 84 72 72Z"/>
          <g clip-path="url(#bottle-clip)">
            <g class="water" style="transform: translateY(${levelY(startFrac)}px)">
              <path class="wave back" d="M-200 ${BODY_TOP} q25 -10 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V400 H-200Z"/>
              <path class="wave front" d="M-200 ${BODY_TOP + 4} q25 -9 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V400 H-200Z"/>
              <circle class="bubble b1" cx="70" cy="270" r="4"/><circle class="bubble b2" cx="120" cy="276" r="3"/><circle class="bubble b3" cx="96" cy="280" r="5"/>
            </g>
          </g>
          <path class="outline" d="M72 72 V60 H128 V72 C128 84 168 88 168 122 V256 A28 28 0 0 1 140 284 H60 A28 28 0 0 1 32 256 V122 C32 88 72 84 72 72Z"/>
          <rect class="shine" x="46" y="128" width="8" height="70" rx="4"/>
          <rect class="cap" x="64" y="30" width="72" height="32" rx="10"/>
          <circle class="cap-light" cx="100" cy="46" r="7"/>
          <g class="face">
            <g class="eyes"><circle cx="80" cy="168" r="7"/><circle cx="120" cy="168" r="7"/></g>
            <circle class="glint" cx="82" cy="166" r="2.4"/><circle class="glint" cx="122" cy="166" r="2.4"/>
            <ellipse class="blush" cx="66" cy="184" rx="9" ry="5"/><ellipse class="blush" cx="134" cy="184" rx="9" ry="5"/>
            <path class="mouth" d="${low ? 'M90 192 Q100 184 110 192' : 'M88 186 Q100 198 112 186'}"/>
          </g>
        </g>
        <path class="sip-drop" d="M100 4 C100 4 92 15 92 20 A8 8 0 0 0 108 20 C108 15 100 4 100 4Z"/>
      </svg>
    </div>
    <div class="bottle-info">
      <h2 id="bottle-title" class="bottle-label">Савандаа одоо</h2>
      <p class="bottle-amount"><strong>${number(left)}</strong> мл <span>/ ${number(bottle.capacity)} мл</span></p>
      <p class="bottle-weight">≈ ${number(left)} г ус · ${Math.round(frac * 100)}%</p>
      <p class="bottle-status" role="status">${low ? 'Сав хоосорч байна — дүүргээрэй' : 'Уух бүрт ус багасна'}</p>
      <div class="bottle-actions">
        <button class="primary-button" id="bottle-refill" type="button">Дүүргэсэн</button>
        <label class="visually-hidden" for="bottle-capacity">Савны багтаамж</label>
        <select id="bottle-capacity">${CAPACITIES.map(c => `<option value="${c}" ${c === bottle.capacity ? 'selected' : ''}>${number(c)} мл сав</option>`).join('')}</select>
      </div>
      <p class="bottle-note">${bottle.refilledAt ? `Сүүлд ${new Date(bottle.refilledAt).toTimeString().slice(0, 5)}-д дүүргэсэн` : 'Хоосрох бүрт дахин дүүргэсэн гэж тооцно'}</p>
    </div>
  </section>`;
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
  card.querySelector('#bottle-refill')!.addEventListener('click', () => {
    if (writeBottle({ ...readBottle(), refilledAt: new Date().toISOString() })) onChange();
  });
  card.querySelector<HTMLSelectElement>('#bottle-capacity')!.addEventListener('change', event => {
    const capacity = Number((event.target as HTMLSelectElement).value);
    if (writeBottle({ ...readBottle(), capacity })) onChange();
  });
}

export { BOTTLE_KEY };
