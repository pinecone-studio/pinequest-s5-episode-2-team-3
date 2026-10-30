import './tabs.css';
import { NAV_ICONS, TABS } from './nav';
import { onWeekendTap } from './native-reminders';
// Created here first, so every tab frame shares this one Bluetooth link to the base (src/scale.ts).
import './scale';
import { Capacitor } from '@capacitor/core';

// The phone app on a wide screen (a small tablet such as the HSD-215, 847 px across): laid out at a phone's
// width and zoomed up to fill it, not the computer layout with a phone-sized frame in the middle. The zoom
// reaches the tab frames too. (Changing the WebView's scale or viewport from MainActivity was tried first:
// the scale only took when it beat the first page load, and the wide viewport left the page blank.)
const PHONE_WIDTH = 430, WIDE = 560;
if (Capacitor.isNativePlatform() && Math.min(screen.width, screen.height) > WIDE) {
  document.documentElement.style.zoom = String(Math.min(screen.width, screen.height) / PHONE_WIDTH);
}

// Phone app start page (capacitor.config.ts → server.appStartPath). Home, history, progress and the account each
// load once in their own frame, side by side; switching tabs slides the strip instead of loading a
// page, so it never stalls. Pages hand swipes and tab links over with postMessage (nav.ts).
const KEYS = ['home', 'history', 'achievements', 'settings'] as const;
const LABELS = ['Нүүр', 'Түүх', 'Явц', 'Профайл'];
const LAST_TAB = 'dusal-tab-v2'; // 'dusal-tab' held an index into the old 5-tab bar (with «Тайлан»)

const root = document.querySelector<HTMLDivElement>('#tabs')!;
// Where overflow: clip is missing (tabs.css), a page's scrollIntoView can still scroll the strip: put it back.
root.addEventListener('scroll', () => { if (root.scrollLeft || root.scrollTop) root.scrollTo(0, 0); });
let index = 0;
try { index = Math.min(TABS.length - 1, Math.max(0, Number(sessionStorage.getItem(LAST_TAB)) || 0)); } catch { /* first tab */ }

root.innerHTML = `
  <div class="tabs-track">${TABS.map((tab, i) => `<iframe title="${LABELS[i]}" data-src="${tab}?embed=1"></iframe>`).join('')}</div>
  <nav class="tabs-bar" aria-label="Хэсгүүд" style="--i:${index}">
    ${TABS.map((tab, i) => `<a href="${tab}" data-tab="${i}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[KEYS[i]]}</svg><span>${LABELS[i]}</span></a>`).join('')}
  </nav>`;

const track = root.querySelector<HTMLDivElement>('.tabs-track')!;
const bar = root.querySelector<HTMLElement>('.tabs-bar')!;
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

function go(next: number): void {
  next = Math.max(0, Math.min(TABS.length - 1, next));
  index = next;
  load(index);
  place(0, true);
  mark();
}

bar.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-tab]');
  if (!link) return;
  event.preventDefault();
  go(Number(link.dataset.tab));
});

// Messages from the pages: follow the finger while dragging, then settle on a tab.
window.addEventListener('message', event => {
  const data = event.data as { dusal?: boolean; type?: string; dx?: number; speed?: number; tab?: number; open?: boolean; hash?: string } | null;
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
    // A link to a part of a tab (/settings.html#doctor) opens that part in its frame.
    const to = Math.max(0, Math.min(TABS.length - 1, data.tab));
    if (typeof data.hash === 'string' && /^#[\w-]+$/.test(data.hash)) {
      if (frames[to].src) frames[to].contentWindow!.location.hash = data.hash;
      else frames[to].dataset.src = `${TABS[to]}?embed=1${data.hash}`;
    }
    go(to);
  }
});

// A tap on the weekend notice: the home tab, which opens its card (overview.ts, #weekend).
onWeekendTap(() => {
  if (frames[0].src) frames[0].contentWindow!.location.hash = '#weekend';
  else frames[0].dataset.src = `${TABS[0]}?embed=1#weekend`;
  go(0);
});

addEventListener('resize', () => place());
load(index);
place();
mark();
// The other tabs load quietly once the first one is up, so the first switch is instant too.
frames[index].addEventListener('load', () => setTimeout(() => TABS.forEach((_, i) => load(i)), 300), { once: true });
