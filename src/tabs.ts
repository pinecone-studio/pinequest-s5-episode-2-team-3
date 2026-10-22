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
// starting from the side the new tab comes in. Shapes are keyframes in tabs.css (CSS `d`
// animation); every frame uses the same commands so the browser can morph them.
const WAVES = [[-6, .8], [11, 1], [28, .7], [45, .95], [62, .75], [79, 1], [96, .8]] as const;
const SPRAY = [[262, 140, 1], [290, 120, .8], [312, 150, .75], [330, 182, .9]] as const;
const BREAKER = `<svg class="sea" viewBox="0 0 800 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 Q25 6 50 18 T100 18 T150 18 T200 18 T250 18 T300 18 T350 18 T400 18 T450 18 T500 18 T550 18 T600 18 T650 18 T700 18 T750 18 T800 18 V40 H0Z"/></svg>
  ${WAVES.map(([left, size], i) => `<svg class="w" viewBox="0 0 400 300" preserveAspectRatio="none" style="--i:${i};--s:${size};left:${left}%" aria-hidden="true">
    <path class="breaker-body" fill="url(#breaker-water)"/><path class="breaker-shade"/><path class="breaker-foam"/>
    <g class="breaker-spray">${SPRAY.map(([x, y, r], k) => `<circle cx="${x}" cy="${y}" r="${(16 * r).toFixed(1)}" style="--k:${k}"/>`).join('')}</g>
  </svg>`).join('')}
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
const lastWave = [...breaker.querySelectorAll('.w .breaker-body')].pop();
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
