import './tabs.css';
import { NAV_ICONS, TABS } from './nav';
// Created here first, so every tab frame shares this one Bluetooth link to the base (src/scale.ts).
import './scale';

// Phone app start page (capacitor.config.ts → server.appStartPath). Home, history, progress and the account each
// load once in their own frame, side by side; switching tabs slides the strip instead of loading a
// page, so it never stalls. Pages hand swipes and tab links over with postMessage (nav.ts).
const KEYS = ['home', 'history', 'achievements', 'settings'] as const;
const LABELS = ['Нүүр', 'Түүх', 'Явц', 'Профайл'];
const LAST_TAB = 'dusal-tab-v2'; // 'dusal-tab' held an index into the old 5-tab bar (with «Тайлан»)

// A row of small cartoon waves along the bottom: one after another they rise, curl over, crash
// with a little splash and flatten, over a rippling water surface. Played on every tab switch,
// starting from the side the new tab comes in. Each wave is one fixed drawing that is only moved
// and skewed (tabs.css): drift, rise and lean are separate eased animations on nested elements, so the phone animates it on the GPU without redrawing every frame.
// Three shapes and uneven sizes, gaps, timing and lean keep the row from looking stamped out.
const SHAPES = [
  // tall curl
  `<path class="breaker-body" fill="url(#breaker-water)" d="M0 300 C60 296 130 230 160 150 C185 70 250 40 300 70 C335 92 330 140 290 150 C265 156 262 130 280 120 C250 140 270 230 400 296 L400 300 Z"/>
   <path class="breaker-shade" d="M190 210 C205 150 240 110 280 120 C255 140 265 210 330 270 C280 265 220 250 190 210 Z"/>
   <path class="breaker-foam" d="M150 175 C175 90 240 45 295 72 C325 88 322 128 292 138"/>`,
  // low roller
  `<path class="breaker-body" fill="url(#breaker-water)" d="M0 300 C70 298 120 250 170 215 C215 185 275 180 315 205 C340 222 330 250 305 248 C290 246 292 232 300 228 C290 250 330 290 400 298 L400 300 Z"/>
   <path class="breaker-shade" d="M200 262 C220 230 260 215 300 228 C290 245 300 270 340 290 C290 292 230 285 200 262 Z"/>
   <path class="breaker-foam" d="M150 240 C190 200 250 185 305 205 C328 215 326 240 306 242"/>`,
  // wide breaking crest
  `<path class="breaker-body" fill="url(#breaker-water)" d="M0 300 C40 296 80 250 110 190 C140 120 210 95 270 105 C330 115 360 160 335 185 C318 200 300 186 310 172 C290 200 300 260 400 296 L400 300 Z"/>
   <path class="breaker-shade" d="M150 240 C170 180 230 150 290 165 C300 190 300 240 345 280 C280 282 190 275 150 240 Z"/>
   <path class="breaker-foam" d="M100 220 C130 140 200 105 268 110 C320 116 352 150 336 176"/>`,
];
// left %, width vw, height vh, shape, start delay ms, duration ms, lean
const WAVES = [
  [-4, 14, 8, 2, 0, 900, 1],
  [6, 10, 5, 1, 140, 760, .6],
  [13, 13, 9, 0, 50, 960, 1.2],
  [22, 9, 5, 1, 260, 700, .7],
  [29, 15, 7, 2, 110, 880, .9],
  [39, 11, 8, 0, 330, 820, 1.1],
  [46, 8, 4, 1, 200, 680, .5],
  [53, 14, 9, 2, 70, 940, 1.2],
  [63, 10, 6, 0, 290, 780, .8],
  [70, 13, 7, 1, 160, 860, .7],
  [79, 9, 5, 2, 380, 720, .9],
  [86, 14, 8, 0, 240, 900, 1.1],
] as const;
const BREAKER = `<svg class="sea" viewBox="0 0 800 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 Q25 6 50 18 T100 18 T150 18 T200 18 T250 18 T300 18 T350 18 T400 18 T450 18 T500 18 T550 18 T600 18 T650 18 T700 18 T750 18 T800 18 V40 H0Z"/></svg>
  ${WAVES.map(([left, w, h, shape, delay, dur, lean]) => `<div class="w" style="left:${left}%;--w:${w}vw;--h:${h}vh;--delay:${delay}ms;--dur:${Math.round(dur * 1.3)}ms;--lean:${lean}"><div class="rise"><svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">${SHAPES[shape]}</svg><i class="spray"></i></div></div>`).join('')}
  <svg width="0" height="0" aria-hidden="true"><defs><linearGradient id="breaker-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe3f5"/><stop offset=".55" stop-color="#2fbde0"/><stop offset="1" stop-color="#1596c4"/></linearGradient></defs></svg>`;

const root = document.querySelector<HTMLDivElement>('#tabs')!;
let index = 0;
try { index = Math.min(TABS.length - 1, Math.max(0, Number(sessionStorage.getItem(LAST_TAB)) || 0)); } catch { /* first tab */ }

root.innerHTML = `
  <div class="tabs-track">${TABS.map((tab, i) => `<iframe title="${LABELS[i]}" data-src="${tab}?embed=1"></iframe>`).join('')}</div>
  <div class="breaker">${BREAKER}</div>
  <nav class="tabs-bar" aria-label="Хэсгүүд" style="--i:${index}">
    ${TABS.map((tab, i) => `<a href="${tab}" data-tab="${i}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[KEYS[i]]}</svg><span>${LABELS[i]}</span></a>`).join('')}
  </nav>`;

const track = root.querySelector<HTMLDivElement>('.tabs-track')!;
const bar = root.querySelector<HTMLElement>('.tabs-bar')!;
const breaker = root.querySelector<HTMLDivElement>('.breaker')!;
const frames = [...track.querySelectorAll<HTMLIFrameElement>('iframe')];
const width = () => track.clientWidth / TABS.length;
const load = (i: number) => { if (!frames[i].src) frames[i].src = frames[i].dataset.src!; };

function place(dx = 0, animate = false): void {
  track.classList.toggle('animate', animate);
  track.style.transform = `translateX(${-index * width() + dx}px)`;
}

// The tab bar steps aside while the shown tab has a full-screen dialog open, so its buttons can be tapped.
function showBar(): void {
  bar.classList.toggle('away', frames[index]?.hasAttribute('data-dialog') ?? false);
}

function mark(): void {
  showBar();
  bar.style.setProperty('--i', String(index));
  bar.querySelectorAll('a').forEach((a, i) => a.toggleAttribute('aria-current', i === index));
  frames.forEach((frame, i) => frame.toggleAttribute('inert', i !== index));
  try { sessionStorage.setItem(LAST_TAB, String(index)); } catch { /* starts on home next time */ }
}

// Moving to a tab on the right, the wave comes from the right and breaks leftwards, and vice versa.
function crash(forward: boolean): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  breaker.classList.remove('play', 'forward', 'back');
  void breaker.getBoundingClientRect();
  breaker.classList.add('play', forward ? 'forward' : 'back');
}
// Done once the last little wave has flattened.
// Done once the whole row has faded out (the container's own fade is the last thing to end).
breaker.addEventListener('animationend', event => { if (event.target === breaker) breaker.classList.remove('play'); });

function go(next: number): void {
  next = Math.max(0, Math.min(TABS.length - 1, next));
  const moved = next !== index;
  const forward = next > index;
  index = next;
  load(index);
  place(0, true);
  mark();
  if (moved) crash(forward);
}

bar.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-tab]');
  if (!link) return;
  event.preventDefault();
  go(Number(link.dataset.tab));
});

// Messages from the pages: follow the finger while dragging, then settle on a tab.
window.addEventListener('message', event => {
  const data = event.data as { dusal?: boolean; type?: string; dx?: number; speed?: number; tab?: number; open?: boolean } | null;
  if (event.origin !== location.origin || !data?.dusal) return;
  if (data.type === 'dialog') {
    const from = frames.findIndex(frame => frame.contentWindow === event.source);
    if (from >= 0) frames[from].toggleAttribute('data-dialog', !!data.open);
    showBar();
    return;
  }
  const dx = data.dx ?? 0;
  const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === TABS.length - 1);
  if (data.type === 'drag') {
    // Peek at the neighbour as soon as a drag starts toward it.
    const neighbour = index + (dx < 0 ? 1 : -1);
    if (neighbour >= 0 && neighbour < TABS.length) load(neighbour);
    place(atEdge ? dx * 0.2 : dx);
  } else if (data.type === 'release') {
    const far = Math.abs(dx) > width() * 0.25 || (Math.abs(data.speed ?? 0) > 0.45 && Math.abs(dx) > 30);
    go(!atEdge && far ? index + (dx < 0 ? 1 : -1) : index);
  } else if (data.type === 'go' && typeof data.tab === 'number') {
    go(data.tab);
  }
});

addEventListener('resize', () => place());
load(index);
place();
mark();
// The other tabs load quietly once the first one is up, so the first switch is instant too.
frames[index].addEventListener('load', () => setTimeout(() => TABS.forEach((_, i) => load(i)), 300), { once: true });
// Draw the waves once, invisibly, so the first switch does not pay for rasterising them.
breaker.classList.add('warm');
requestAnimationFrame(() => requestAnimationFrame(() => breaker.classList.remove('warm')));
