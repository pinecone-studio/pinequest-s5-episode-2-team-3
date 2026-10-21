import './hydration.css';
import { number } from './format';

// Home: a progress ring toward the daily goal and four quick-add tiles underneath.
// Tapping a tile sends a drop into the ring before the entry is saved.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const R = 88, CIRC = 2 * Math.PI * R;
// Ring fill as last shown, so the next render sweeps from there (from empty on first paint).
let shownFrac = 0;
let shownDrink: number | null = null;

const ICONS = {
  glass: '<path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8Z"/>',
  mug: '<path d="M5 6h11v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="currentColor" stroke-width="2"/>',
  bottle: '<path d="M10 2h4v3l2 2.5V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7.5L10 5Z"/>',
  jug: '<path d="M9 2h6v2.5l2.5 3V20a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7.5L9 4.5Z"/>',
};
const TILES = [
  { ml: 150, name: 'Бага аяга', tone: 'blue', icon: ICONS.glass },
  { ml: 250, name: 'Аяга', tone: 'green', icon: ICONS.mug },
  { ml: 500, name: 'Сав', tone: 'amber', icon: ICONS.bottle },
  { ml: 750, name: 'Том сав', tone: 'sky', icon: ICONS.jug },
] as const;

export function ringSection(drink: number, goal: number, mode: 'goal' | 'limit'): string {
  const frac = Math.min(1, drink / goal);
  const over = mode === 'limit' && drink > goal;
  const done = mode === 'goal' && drink >= goal;
  const diff = goal - drink;
  const sub = over ? `+${number(-diff)} мл хэтэрсэн` : done ? 'Зорилт биеллээ' : mode === 'limit' ? `${number(diff)} мл үлдсэн` : `−${number(diff)} мл`;
  return `<div class="ring${over ? ' over' : ''}${done ? ' done' : ''}" data-frac="${frac}" role="img" aria-label="Өнөөдөр ${number(drink)} / ${number(goal)} мл, ${Math.round((drink / goal) * 100)}%">
    <svg viewBox="0 0 220 220" aria-hidden="true">
      <circle class="ring-track" cx="110" cy="110" r="${R}"/>
      <circle class="ring-fill" cx="110" cy="110" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - shownFrac)}"/>
    </svg>
    <div class="ring-center">
      <p class="ring-pct">${Math.round((drink / goal) * 100)}%</p>
      <p class="ring-total"><b id="today-drink">${number(drink)}</b><span>мл</span></p>
      <p class="ring-sub">${sub}</p>
    </div>
  </div>`;
}

export function drinkTiles(): string {
  return `<div class="tiles" role="group" aria-label="Уусан ус нэмэх">${TILES.map(t =>
    `<button type="button" class="tile tone-${t.tone}" data-drink="${t.ml}" aria-label="${t.ml} мл ус нэмэх">
      <span class="tile-name">${t.name}</span><span class="tile-ml">${t.ml} мл</span>
      <svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg>
    </button>`).join('')}</div>`;
}

// Sweep the ring to its new value and count today's total up (or down after an undo),
// then wire the tiles. `add` saves the entry and re-renders the page.
export function bindHydration(drink: number, add: (ml: number) => unknown): void {
  const ring = document.querySelector<HTMLElement>('.ring');
  if (ring) {
    const frac = Number(ring.dataset.frac);
    const fill = ring.querySelector<SVGCircleElement>('.ring-fill')!;
    const grew = frac > shownFrac + 0.001;
    // Crossing the goal plays the water filling the ring; afterwards it simply stays full.
    if (frac >= 1 && shownFrac < 1) ring.classList.add('filling');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.strokeDashoffset = String(CIRC * (1 - frac));
      if (grew) ring.classList.add('pulse');
    }));
    shownFrac = frac;
  }
  if (shownDrink !== null) countUp(document.querySelector('#today-drink'), shownDrink, drink);
  shownDrink = drink;

  document.querySelectorAll<HTMLButtonElement>('[data-drink]').forEach(tile => {
    tile.addEventListener('click', async () => {
      const ml = Number(tile.dataset.drink);
      if (reducedMotion()) { add(ml); return; }
      tile.classList.remove('tapped');
      void tile.offsetWidth;
      tile.classList.add('tapped');
      await flyDrop(tile, ml);
      add(ml);
    });
  });
}

function center(element: Element): { x: number; y: number } {
  const r = element.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// A drop arcs from the tile into the ring; "+250 мл" rises from the ring as it lands.
// Both live on <body> so they survive the re-render that follows the save.
async function flyDrop(from: Element, ml: number): Promise<void> {
  const ring = document.querySelector('.ring');
  if (!ring) return;
  const start = center(from), end = center(ring);
  if (end.y < 0 || end.y > innerHeight) return;
  const drop = document.createElement('span');
  drop.className = 'fx-drop';
  drop.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/></svg>';
  document.body.append(drop);
  const dx = end.x - start.x, dy = end.y - start.y;
  const lift = Math.min(80, Math.abs(dx) * 0.5 + 30);
  const at = (t: number, s: number) => `translate(${start.x + dx * t}px, ${start.y + dy * t - lift * 4 * t * (1 - t)}px) scale(${s})`;
  await drop.animate([
    { transform: at(0, 0.4), opacity: 0 },
    { transform: at(0.15, 1.15), opacity: 1, offset: 0.15 },
    { transform: at(1, 0.6), opacity: 0.9 },
  ], { duration: 520, easing: 'cubic-bezier(.45, 0, .55, 1)' }).finished.catch(() => {});
  drop.remove();
  const label = Object.assign(document.createElement('span'), { className: 'fx-float', textContent: `+${number(ml)} мл` });
  label.style.left = `${end.x}px`;
  label.style.top = `${end.y - 54}px`;
  document.body.append(label);
  label.addEventListener('animationend', () => label.remove());
}

function countUp(element: HTMLElement | null, from: number, to: number): void {
  if (!element || from === to || reducedMotion()) return;
  const start = performance.now(), duration = 700;
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    element.textContent = number(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(frame);
  };
  element.textContent = number(from);
  requestAnimationFrame(frame);
}
