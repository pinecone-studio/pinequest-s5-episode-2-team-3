import './tabs.css';
import { NAV_ICONS, TABS } from './nav';

// Phone app start page (capacitor.config.ts → server.appStartPath). Home, history and settings each
// load once in their own frame, side by side; switching tabs slides the strip instead of loading a
// page, so it never stalls. Pages hand swipes and tab links over with postMessage (nav.ts).
const KEYS = ['home', 'history', 'settings'] as const;
const LABELS = ['Нүүр', 'Түүх', 'Тохиргоо'];
const LAST_TAB = 'dusal-tab';

// A row of small cartoon waves along the bottom: one after another they rise, curl over, crash
// with a little splash and flatten, over a rippling water surface. Played on every tab switch,
// starting from the side the new tab comes in. Each wave is one fixed drawing that is only scaled,
// skewed and moved (tabs.css), so the phone animates it on the GPU without redrawing every frame.
const WAVES = [[-4, .85], [18, 1], [40, .8], [62, .95], [84, .85]] as const;
const WAVE = `<path class="breaker-body" fill="url(#breaker-water)" d="M0 300 C60 296 130 230 160 150 C185 70 250 40 300 70 C335 92 330 140 290 150 C265 156 262 130 280 120 C250 140 270 230 400 296 L400 300 Z"/>
  <path class="breaker-shade" d="M190 210 C205 150 240 110 280 120 C255 140 265 210 330 270 C280 265 220 250 190 210 Z"/>
  <path class="breaker-foam" d="M150 175 C175 90 240 45 295 72 C325 88 322 128 292 138"/>`;
const BREAKER = `<svg class="sea" viewBox="0 0 800 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 Q25 6 50 18 T100 18 T150 18 T200 18 T250 18 T300 18 T350 18 T400 18 T450 18 T500 18 T550 18 T600 18 T650 18 T700 18 T750 18 T800 18 V40 H0Z"/></svg>
  ${WAVES.map(([left, size], i) => `<div class="w" style="--i:${i};--s:${size};left:${left}%"><svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">${WAVE}</svg><i class="spray"></i><i class="spray"></i></div>`).join('')}
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

function mark(): void {
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
const lastWave = [...breaker.querySelectorAll('.w')].pop();
breaker.addEventListener('animationend', event => { if (event.target === lastWave) breaker.classList.remove('play'); });

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
  const data = event.data as { dusal?: boolean; type?: string; dx?: number; speed?: number; tab?: number } | null;
  if (event.origin !== location.origin || !data?.dusal) return;
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
