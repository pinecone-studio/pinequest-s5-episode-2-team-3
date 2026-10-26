type Page = 'home' | 'history' | 'settings';

const ICONS: Record<Page, string> = {
  home: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  history: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 15v-3M12 15V9M15 15v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.5"/>',
};
export { ICONS as NAV_ICONS };

// One menu for every page: the places people actually go. On phones it becomes a bottom tab bar (shell.css).
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Page) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg><span>${label}</span></a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/settings.html', 'Тохиргоо', 'settings')}</nav>`;
}

export const TABS = ['/', '/history.html', '/settings.html'];
const ORDER = ['/', '/history', '/settings'];
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
  document.addEventListener('touchstart', event => {
    swipe = null;
    if (event.touches.length !== 1 || handlesOwnSwipe(event.target as Element)) return;
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
