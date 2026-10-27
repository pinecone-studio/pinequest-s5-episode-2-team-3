import { dayKey, type WaterEntry } from './data';
import { escape, number } from './format';
import { pourButton, pourPanel } from './hydration';
import { KINDS, entryIcon, entryName, type Kind } from './drinks';

// Home screen in the "Hydrify" layout (demo): a title bar, a card with an arc gauge around a water
// drop and a "drink" button with the current cup, a card with today's drinks, and a cup picker.
type Mode = 'goal' | 'limit';

// The cup is shared with the old quick-add tiles (hydration.ts uses the same key).
const CUP_KEY = 'dusal-last-pour-v1';
export const CUP_SIZES = [100, 125, 150, 200, 250, 300, 350, 400, 500, 600] as const;
export function readCup(): number {
  try { const v = Number(localStorage.getItem(CUP_KEY)); return v >= 10 && v <= 3000 ? v : 300; } catch { return 300; }
}
function writeCup(ml: number): void {
  try { localStorage.setItem(CUP_KEY, String(ml)); } catch { /* default next time */ }
}

// The drink the button pours: plain water unless a drink was picked in the sheet (kit screen 36).
const KIND_KEY = 'dusal-cup-kind-v1';
export function readCupKind(): Kind | undefined {
  try { const k = localStorage.getItem(KIND_KEY); return k && k in KINDS ? (k as Kind) : undefined; } catch { return undefined; }
}
function writeCupKind(kind: Kind | undefined): void {
  try { if (kind) localStorage.setItem(KIND_KEY, kind); else localStorage.removeItem(KIND_KEY); } catch { /* water next time */ }
}

// Small blue cup drawings: a cup for small amounts, glasses in the middle, a mug for the large ones.
export function cupIcon(ml: number): string {
  if (ml <= 150) return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 11h18l-2 11a3 3 0 0 1-3 2.5h-8A3 3 0 0 1 7 22z" fill="#369fff"/><path d="M23 13h2a3 3 0 0 1 0 6h-2.6" fill="none" stroke="#369fff" stroke-width="2"/><path d="M8 11h12v3H8z" fill="#9fd0fb"/></svg>';
  if (ml <= 350) return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14l-1.6 24H10.6z" fill="#cfe6fd"/><path d="M9.7 12h12.6l-1 16H10.7z" fill="#369fff"/><circle cx="16" cy="20" r="1.2" fill="#fff"/><circle cx="18" cy="24" r="1" fill="#fff"/></svg>';
  return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6h17v18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#369fff"/><path d="M5 10h17M5 15h17M5 20h17" stroke="#9fd0fb" stroke-width="2"/><path d="M22 10h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-3" fill="none" stroke="#369fff" stroke-width="2.4"/></svg>';
}

// "My cups" (kit 59–62): the sizes the cup sheet offers, each with one of the icons below.
// Kept on this phone; until edited, the ten default sizes with their default icons.
const B = '#369fff', L = '#9fd0fb', P = '#cfe6fd';
const i32 = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
export const CUP_ICONS = [
  i32(`<path d="M4 12h24c0 7-5 12-12 12S4 19 4 12z" fill="${B}"/><path d="M4 12h24" stroke="${L}" stroke-width="3"/>`),
  i32(`<path d="M5 10h22l-2 12a3 3 0 0 1-3 2.5H10A3 3 0 0 1 7 22z" fill="${B}"/><path d="M8 10h16v3H8z" fill="${L}"/>`),
  i32(`<path d="M3 10h20v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="${B}"/><path d="M23 12h3a3 3 0 0 1 0 6h-3" fill="none" stroke="${B}" stroke-width="2.4"/><path d="M3 10h20v3H3z" fill="${L}"/>`),
  i32(`<path d="M5 6h17v18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="${B}"/><path d="M22 10h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-3" fill="none" stroke="${B}" stroke-width="2.4"/>`),
  i32(`<path d="M8 10h16l-1.4 16H9.4z" fill="${P}"/><path d="M8.7 16h14.6l-.9 10H9.6z" fill="${B}"/>`),
  i32(`<path d="M9 4h14l-1.6 24H10.6z" fill="${P}"/><path d="M9.7 12h12.6l-1 16H10.7z" fill="${B}"/><circle cx="16" cy="20" r="1.2" fill="#fff"/>`),
  i32(`<path d="M11 2h10l-1 28h-8z" fill="${P}"/><path d="M11.4 9h9.2l-.7 21h-7.8z" fill="${B}"/>`),
  i32(`<rect x="9" y="3" width="14" height="27" rx="2" fill="${B}"/><path d="M9 9h14" stroke="${L}" stroke-width="2"/>`),
  i32(`<path d="M7 6h16l3 4v16a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="${B}"/><path d="M7 12h19M7 17h19M7 22h19" stroke="${L}" stroke-width="2"/>`),
  i32(`<path d="M8 8h14v16a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z" fill="${B}"/><path d="M22 11h2a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-2" fill="none" stroke="${B}" stroke-width="2.4"/><path d="M8 8h14v4H8z" fill="${L}"/>`),
  i32(`<path d="M12 2h8v4l3 4v18a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V10l3-4z" fill="${B}"/><path d="M9 14h14v6H9z" fill="${L}"/>`),
];
export interface Cup { ml: number; icon: number }
const CUPS_KEY = 'dusal-cups-v1';
const defaultIcon = (ml: number) => (ml <= 125 ? 0 : ml <= 150 ? 2 : ml <= 200 ? 1 : ml <= 250 ? 4 : ml <= 350 ? 5 : ml <= 400 ? 7 : ml <= 500 ? 8 : 9);
export function readCups(): Cup[] {
  try {
    const list = JSON.parse(localStorage.getItem(CUPS_KEY) ?? 'null');
    if (Array.isArray(list) && list.every(c => Number.isInteger(c?.ml) && c.ml >= 10 && c.ml <= 3000 && Number.isInteger(c.icon) && c.icon >= 0 && c.icon < CUP_ICONS.length)) return list;
  } catch { /* defaults */ }
  return CUP_SIZES.map(ml => ({ ml, icon: defaultIcon(ml) }));
}
export function writeCups(cups: Cup[]): void {
  try { localStorage.setItem(CUPS_KEY, JSON.stringify(cups)); } catch { /* defaults next time */ }
}
export const iconFor = (ml: number): string => CUP_ICONS[readCups().find(c => c.ml === ml)?.icon ?? defaultIcon(ml)];
export { writeCup };

export function hxHeader(title: string): string {
  return `<div class="hx-header">
    <span class="hx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.2 15.5a3.8 3.8 0 0 0 7.6 0c0-1-.4-1.8-1-2.6-1.2.9-3.4 1.4-6.6 2.6z" fill="currentColor"/></svg></span>
    <h1>${escape(title)}</h1>
    <a class="hx-more" href="/settings.html" aria-label="Тохиргоо"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></a>
  </div>`;
}

// A 270° arc from bottom left round to bottom right, filled to today's share, with ticks inside,
// and a water drop in the middle whose water rises with it.
export function hxGauge(drink: number, goal: number, mode: Mode, cup: number, drinking = false): string {
  const kind = readCupKind();
  const frac = Math.max(0, Math.min(1, drink / goal));
  const over = mode === 'limit' && drink > goal;
  const point = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return `${(150 + r * Math.cos(a)).toFixed(1)} ${(150 + r * Math.sin(a)).toFixed(1)}`; };
  const ticks = Array.from({ length: 11 }, (_, i) => 135 + i * 27).slice(1, -1)
    .map(deg => `<path d="M${point(deg, 94)} L${point(deg, 102)}"/>`).join('');
  const level = 196 - frac * 92; // water top inside the drop (it spans y 104–196)
  return `<section class="hx-card hx-gauge-card" aria-label="Өнөөдрийн ус">
    <div class="hx-gauge${over ? ' over' : ''}" data-goal="${goal}" role="img" aria-label="Өнөөдөр ${number(drink)} / ${number(goal)} мл">
      <svg viewBox="0 0 300 270" aria-hidden="true">
        <path class="hx-track" d="M${point(135, 122)} A122 122 0 1 1 ${point(45, 122)}" pathLength="100"/>
        <path class="hx-progress${frac > 0 ? '' : ' empty'}" d="M${point(135, 122)} A122 122 0 1 1 ${point(45, 122)}" pathLength="100" stroke-dasharray="${(frac * 100).toFixed(1)} 100"/>
        <g class="hx-ticks">${ticks}</g>
        <defs><clipPath id="hx-drop"><path d="M150 72c-26 34-42 54-42 76a42 42 0 0 0 84 0c0-22-16-42-42-76z"/></clipPath></defs>
        <path class="hx-drop-ring" d="M150 62c-31 39-50 62-50 86a50 50 0 0 0 100 0c0-24-19-47-50-86z"/>
        <path class="hx-drop" d="M150 72c-26 34-42 54-42 76a42 42 0 0 0 84 0c0-22-16-42-42-76z"/>
        <g clip-path="url(#hx-drop)"><g class="hx-water" style="transform: translateY(${level.toFixed(1)}px)">
          <path class="hx-wave back" d="M60 0 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V120 H60Z"/>
          <path class="hx-wave" d="M45 6 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V120 H45Z"/>
        </g></g>
      </svg>
      <p class="hx-amount"><b id="today-drink">${number(drink)}</b></p>
      <button type="button" class="hx-goal" id="plan-toggle" aria-controls="plan-wrap" aria-expanded="false">/${number(goal)} мл${mode === 'limit' ? ' хязгаар' : ''}</button>
    </div>
    <div class="hx-actions">
      <button type="button" class="hx-drink${drinking ? ' busy' : ''}" data-drink="${cup}" ${drinking ? 'disabled' : ''}>${drinking ? 'Ууж байна...' : `Уух (${number(cup)} мл)`}</button>
      <button type="button" class="hx-cup" id="hx-cup" aria-label="Аяга солих, одоо ${kind ? `${KINDS[kind].name} ` : ''}${number(cup)} мл">${kind ? KINDS[kind].icon : iconFor(cup)}<span class="hx-swap" aria-hidden="true">⟳</span></button>
      ${pourButton()}
    </div>
    ${pourPanel()}
  </section>`;
}

const clock = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// Today's latest drinks, newest first, as in the history list.
export function hxHistory(events: readonly WaterEntry[], limit = 3): string {
  const today = dayKey();
  const rows = events.filter(e => e.type === 'drink' && dayKey(new Date(e.at)) === today)
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  return `<section class="hx-card hx-history" aria-labelledby="hx-history-title">
    <div class="hx-card-head"><h2 id="hx-history-title">Түүх</h2><a href="/history.html">Бүгдийг харах <span aria-hidden="true">→</span></a></div>
    ${rows.length ? `<ul class="hx-list">${rows.map(e => `<li>
      <span class="hx-icon">${entryIcon(e)}</span>
      <span class="hx-what"><b>${escape(entryName(e))}</b><small>${clock(e.at)}</small></span>
      <span class="hx-ml">${number(e.amount)} мл</span>
      <a class="hx-row-more" href="/history.html" aria-label="Засах"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></a>
    </li>`).join('')}</ul>` : '<p class="hx-empty">Өнөөдөр хараахан уугаагүй байна.</p>'}
  </section>`;
}

// "Аяга солих" (kit screen 28): water cup sizes and "Нэмэх" (own size), then the drinks; a drink
// or "Нэмэх" asks the amount on the keypad (screen 35). Picking sets what the drink button pours.
export function openCupSheet(current: number, onPick: (ml: number) => void): void {
  const kind = readCupKind();
  const box = document.createElement('div');
  box.className = 'hx-sheet';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'hx-sheet-title');
  const opt = (attrs: string, on: boolean, icon: string, label: string) => `<button type="button" role="radio" aria-checked="${on}" class="hx-cup-opt${on ? ' on' : ''}" ${attrs}><span>${icon}</span>${label}</button>`;
  box.innerHTML = `<div class="hx-sheet-top"><button type="button" class="hx-close" aria-label="Хаах">✕</button><h2 id="hx-sheet-title">Аяга солих</h2><span></span></div>
    <div class="hx-cups" role="radiogroup" aria-label="Усны аяга">${readCups().map(c => opt(`data-cup="${c.ml}"`, !kind && c.ml === current, CUP_ICONS[c.icon], `${number(c.ml)} мл`)).join('')}
      ${opt('data-custom', !kind && !readCups().some(c => c.ml === current), '<b class="hx-plus" aria-hidden="true">+</b>', 'Нэмэх')}</div>
    <p class="hx-cups-sep">Эсвэл ундаа</p>
    <div class="hx-cups" role="radiogroup" aria-label="Ундаа">${(Object.keys(KINDS) as Kind[]).map(k => opt(`data-kind="${k}"`, kind === k, KINDS[k].icon, KINDS[k].name)).join('')}</div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.hx-dim')) close(); };
  document.addEventListener('keydown', onKey);
  const done = (ml: number, k: Kind | undefined) => { writeCup(ml); writeCupKind(k); close(); onPick(ml); };
  box.querySelector('.hx-close')!.addEventListener('click', close);
  box.querySelectorAll<HTMLButtonElement>('[data-cup]').forEach(b => b.addEventListener('click', () => done(Number(b.dataset.cup), undefined)));
  box.querySelector('[data-custom]')!.addEventListener('click', () =>
    void import('./hx-edit').then(m => m.openAmountSheet('Өөрийн аяга', cupIcon(current), current, ml => done(ml, undefined))));
  box.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.kind as Kind;
    void import('./hx-edit').then(m => m.openAmountSheet(`${KINDS[k].name} уух`, KINDS[k].icon, 200, ml => done(ml, k)));
  }));
  box.querySelector<HTMLButtonElement>('.hx-cup-opt.on, .hx-cup-opt')!.focus();
}
