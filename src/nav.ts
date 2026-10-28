import { applyTheme } from './prefs';
type Page = 'home' | 'history' | 'report' | 'achievements' | 'settings';
type Item = Page;

const ICONS: Record<Item, string> = {
  home: '<path d="M3.5 11 12 4l8.5 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5Z"/>',
  history: '<path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 12h6M9 16h4"/>',
  report: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M7 15l3.5-3.5 2.5 2.5L17 10"/><circle cx="18.5" cy="5.5" r="1.5"/>',
  achievements: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
};
export { ICONS as NAV_ICONS };

// One menu for every page, Hydrify style: home, history, report, achievements and the account
// (settings). On phones it becomes a bottom tab bar (shell.css, theme.css).
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Item) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg><span>${label}</span></a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/report.html', 'Тайлан', 'report')}${link('/achievements.html', 'Амжилт', 'achievements')}${link('/settings.html', 'Профайл', 'settings')}</nav>`;
}

export const TABS = ['/', '/history.html', '/report.html', '/achievements.html', '/settings.html'];
const ORDER = ['/', '/history', '/report', '/achievements', '/settings'];
const DIR_KEY = 'dusal-page-dir';
const clean = (path: string) => path.replace(/\.html$/, '').replace(/\/index$/, '/');
const rank = (path: string) => { const i = ORDER.indexOf(clean(path)); return i < 0 ? 1 : i; };
const isTab = (path: string) => ORDER.includes(clean(path));

// In the phone app every tab lives in its own frame inside tabs.html, which owns the tab bar and the
// slide (tabs.ts). A page that finds itself there hides its own menu and hands tab moves to the host.
export const embedded = window.parent !== window && new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embedded');
const toHost = (message: Record<string, unknown>) => window.parent.postMessage({ dusal: true, ...message }, location.origin);

// Gestures that start on something with its own horizontal or drag handling are left alone.
// Plain inputs and selects don't use horizontal drags, so swipes may start on them; sliders do.
const OWN_GESTURES = 'input[type="range"], textarea, dialog, [role="dialog"], .cups, .week-strip, .big-add, [data-no-swipe]';
function handlesOwnSwipe(start: Element | null): boolean {
  if (!start || start.closest(OWN_GESTURES)) return true;
  for (let el: Element | null = start; el && el !== document.body; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

if (embedded) {
  // Tab links inside a page (e.g. the footer's settings link) switch tabs in the host instead.
  document.addEventListener('click', event => {
    const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || event.defaultPrevented || link.origin !== location.origin || !isTab(link.pathname)) return;
    event.preventDefault();
    toHost({ type: 'go', tab: rank(link.pathname) });
  });
  // Horizontal swipes are passed to the host, which moves the frames with the finger. Screen
  // coordinates, because the frame itself moves under the finger while dragging.
  let swipe: { x: number; y: number; at: number; horizontal: boolean | null } | null = null;
  // A full-screen dialog (day result, onboarding, drink sheet...) keeps its buttons at the bottom, where the
  // host's floating tab bar sits. While one is open the host hides its bar, and swipes do not change tabs.
  const DIALOGS = '.onb, .drink-sheet, .hx-sheet, .hx-dim, .cal, .plan-wrap';
  let dialogOpen = false;
  const watchDialogs = () => {
    const open = [...document.querySelectorAll(DIALOGS)].some(e => !(e as HTMLElement).hidden && e.getClientRects().length > 0);
    if (open === dialogOpen) return;
    dialogOpen = open;
    toHost({ type: 'dialog', open });
  };
  new MutationObserver(watchDialogs).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  document.addEventListener('touchstart', event => {
    swipe = null;
    if (event.touches.length !== 1 || dialogOpen || handlesOwnSwipe(event.target as Element)) return;
    swipe = { x: event.touches[0].screenX, y: event.touches[0].screenY, at: performance.now(), horizontal: null };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!swipe) return;
    const dx = event.touches[0].screenX - swipe.x, dy = event.touches[0].screenY - swipe.y;
    if (swipe.horizontal === null && Math.hypot(dx, dy) > 10) swipe.horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
    if (swipe.horizontal === false) { swipe = null; return; }
    if (swipe.horizontal) toHost({ type: 'drag', dx });
  }, { passive: true });
  const end = (event: TouchEvent) => {
    const s = swipe;
    swipe = null;
    if (!s?.horizontal) return;
    const dx = (event.changedTouches[0]?.screenX ?? s.x) - s.x;
    toHost({ type: 'release', dx, speed: dx / Math.max(1, performance.now() - s.at) });
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
} else {
  // On the web each tab is its own page: the browser's cross-document View Transitions (shell.css)
  // keep the old page until the new one has drawn, then slide in the direction of travel.
  window.addEventListener('pageswap', (event: Event) => {
    const to = (event as Event & { activation?: { entry?: { url?: string } } }).activation?.entry?.url;
    if (!to) return;
    try { sessionStorage.setItem(DIR_KEY, rank(new URL(to).pathname) >= rank(location.pathname) ? 'forward' : 'back'); } catch { /* plain fade */ }
  });
  try {
    const dir = sessionStorage.getItem(DIR_KEY);
    sessionStorage.removeItem(DIR_KEY);
    if (dir) document.documentElement.dataset.nav = dir;
  } catch { /* plain fade */ }
}

// Every page imports the nav, so the theme is applied here once per page.
applyTheme();
