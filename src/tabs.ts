import './tabs.css';
import { NAV_ICONS, TABS } from './nav';

// Phone app start page (capacitor.config.ts → server.appStartPath). Home, history and settings each
// load once in their own frame, side by side; switching tabs slides the strip instead of loading a
// page, so it never stalls. Pages hand swipes and tab links over with postMessage (nav.ts).
const KEYS = ['home', 'history', 'settings'] as const;
const LABELS = ['Нүүр', 'Түүх', 'Тохиргоо'];
const LAST_TAB = 'dusal-tab';

// A stream of water running down the edge between two tabs; it shows while the strip moves, so the
// water appears on the side the next tab is coming from. Soft wavy banks, gliding highlights and a
// few bubbles make it read as water. The shape is twice the screen tall and slides by whole waves,
// so the flow loops without a jump.
const SEAM = (() => {
  // One wave every 250 units; the 1000-unit slide is exactly four waves.
  const bank = (x: number, amp: number, phase: number) => Array.from({ length: 201 }, (_, k) => [x + Math.sin((k * Math.PI) / 12.5 + phase) * amp, k * 10] as const);
  const left = bank(9, 4, 0), right = bank(31, 4, Math.PI * 0.6).reverse();
  const body = `M${[...left, ...right].map(([x, y]) => `${x.toFixed(1)} ${y}`).join(' L')} Z`;
  const line = (x: number, amp: number, phase: number) => `M${bank(x, amp, phase).map(([px, y]) => `${px.toFixed(1)} ${y}`).join(' L')}`;
  const bubbles = Array.from({ length: 7 }, (_, i) => `<i class="bubble" style="--x:${30 + ((i * 37) % 40)}%;--d:${(i * 0.37).toFixed(2)}s;--s:${(0.55 + (i % 3) * 0.25).toFixed(2)}"></i>`).join('');
  return `<div class="stream"><svg viewBox="0 0 40 2000" preserveAspectRatio="none"><defs><linearGradient id="seam-water" x1="0" x2="1"><stop offset="0" stop-color="#a8e9f6" stop-opacity=".75"/><stop offset=".5" stop-color="#29bfe0" stop-opacity=".85"/><stop offset="1" stop-color="#a8e9f6" stop-opacity=".75"/></linearGradient></defs>
    <path class="body" d="${body}" fill="url(#seam-water)"/><path class="shine" d="${line(17, 3, 0.8)}"/><path class="shine soft" d="${line(24, 3, 2.1)}"/></svg>${bubbles}</div>`;
})();

const root = document.querySelector<HTMLDivElement>('#tabs')!;
let index = 0;
try { index = Math.min(TABS.length - 1, Math.max(0, Number(sessionStorage.getItem(LAST_TAB)) || 0)); } catch { /* first tab */ }

root.innerHTML = `
  <div class="tabs-track">${TABS.map((tab, i) => `<iframe title="${LABELS[i]}" data-src="${tab}?embed=1"></iframe>`).join('')}${TABS.slice(1).map((_, i) => `<div class="seam" style="left:${((i + 1) / TABS.length) * 100}%" aria-hidden="true">${SEAM}</div>`).join('')}</div>
  <svg class="tabs-wave" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14 Q25 4 50 14 T100 14 T150 14 T200 14 T250 14 T300 14 T350 14 T400 14 V24 H0Z"/></svg>
  <nav class="tabs-bar" aria-label="Хэсгүүд" style="--i:${index}">
    ${TABS.map((tab, i) => `<a href="${tab}" data-tab="${i}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[KEYS[i]]}</svg><span>${LABELS[i]}</span></a>`).join('')}
  </nav>`;

const track = root.querySelector<HTMLDivElement>('.tabs-track')!;
const bar = root.querySelector<HTMLElement>('.tabs-bar')!;
const wave = root.querySelector<SVGElement>('.tabs-wave')!;
const frames = [...track.querySelectorAll<HTMLIFrameElement>('iframe')];
const width = () => track.clientWidth / TABS.length;
const load = (i: number) => { if (!frames[i].src) frames[i].src = frames[i].dataset.src!; };

// Water strength and how fast it changes: instant while following a finger, quick to appear, slow to fade.
function setFlow(flow: number, seconds: number): void {
  track.style.setProperty('--fade', `${seconds}s`);
  track.style.setProperty('--flow', String(flow));
}

function place(dx = 0, animate = false): void {
  track.classList.toggle('animate', animate);
  track.style.transform = `translateX(${-index * width() + dx}px)`;
  // Water shows in proportion to the drag; while gliding it keeps its strength and fades at the end.
  if (!animate) setFlow(Math.min(1, Math.abs(dx) / 120), 0);
}
track.addEventListener('transitionend', event => { if (event.target === track && event.propertyName === 'transform') setFlow(0, 0.4); });

function mark(): void {
  bar.style.setProperty('--i', String(index));
  bar.querySelectorAll('a').forEach((a, i) => a.toggleAttribute('aria-current', i === index));
  frames.forEach((frame, i) => frame.toggleAttribute('inert', i !== index));
  try { sessionStorage.setItem(LAST_TAB, String(index)); } catch { /* starts on home next time */ }
}

function go(next: number): void {
  next = Math.max(0, Math.min(TABS.length - 1, next));
  const moved = next !== index;
  index = next;
  load(index);
  if (moved) setFlow(1, 0.12);
  place(0, true);
  mark();
  if (moved && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    wave.classList.remove('lap');
    void wave.getBoundingClientRect();
    wave.classList.add('lap');
  }
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
