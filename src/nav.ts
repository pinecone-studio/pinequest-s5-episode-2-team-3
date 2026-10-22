type Page = 'home' | 'history' | 'settings';

const ICONS: Record<Page, string> = {
  home: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  history: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 15v-3M12 15V9M15 15v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.5"/>',
};

// One menu for every page: the places people actually go. On phones it becomes a bottom tab bar (shell.css).
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Page) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg><span>${label}</span></a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/settings.html', 'Тохиргоо', 'settings')}</nav>`;
}

// Page-to-page slide with the browser's cross-document View Transitions (shell.css): the old page
// stays on screen until the new one has drawn, then content slides; the header and tab bar stay put.
// Going right in the tab order slides left, going back slides right. Browsers without support just switch.
const ORDER = ['/', '/history', '/settings'];
const DIR_KEY = 'dusal-page-dir';
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rank = (path: string) => {
  const i = ORDER.indexOf(path.replace(/\.html$/, '').replace(/\/index$/, '/'));
  return i < 0 ? 1 : i;
};

// Leaving: note the direction for the next page (the outgoing page knows both ends).
window.addEventListener('pageswap', (event: Event) => {
  const to = (event as Event & { activation?: { entry?: { url?: string } } }).activation?.entry?.url;
  if (!to) return;
  try { sessionStorage.setItem(DIR_KEY, rank(new URL(to).pathname) >= rank(location.pathname) ? 'forward' : 'back'); } catch { /* plain fade */ }
});
// Arriving: mark the direction before the transition animates.
try {
  const dir = sessionStorage.getItem(DIR_KEY);
  sessionStorage.removeItem(DIR_KEY);
  if (dir) document.documentElement.dataset.nav = dir;
} catch { /* plain fade */ }

// The browser drops the slide when the next page still has to download its scripts and styles
// (first visit to a tab). Once this page is idle, fetch the other tabs' files so the cache has them.
const warm = () => {
  const pages = ['/', '/history.html', '/settings.html'].filter(page => rank(page) !== rank(location.pathname));
  pages.forEach(page => {
    fetch(page).then(r => r.text()).then(html => {
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
      assets.forEach(asset => { fetch(asset).catch(() => {}); });
    }).catch(() => {});
  });
};
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
else setTimeout(warm, 1500);

// Swipe between tabs: left goes to the next tab, right to the previous one. While dragging, the
// content follows the finger a little. Gestures that start on something that handles its own
// horizontal or drag gestures (cup row, week strip, the pull-to-add number, forms, dialogs) are left alone.
const TABS = ['/', '/history.html', '/settings.html'];
const tabIndex = () => TABS.findIndex(t => rank(t) === rank(location.pathname) && ORDER.includes(location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/')));
const OWN_GESTURES = 'input, select, textarea, dialog, [role="dialog"], .cups, .week-strip, .big-add, [data-no-swipe]';
function handlesOwnSwipe(start: Element | null): boolean {
  if (!start || start.closest(OWN_GESTURES)) return true;
  for (let el: Element | null = start; el && el !== document.body; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}
let swipe: { x: number; y: number; at: number; horizontal: boolean | null } | null = null;
const resetDrag = () => {
  const root = document.documentElement;
  root.classList.remove('swiping');
  root.style.removeProperty('--swipe');
};
document.addEventListener('touchstart', event => {
  swipe = null;
  if (event.touches.length !== 1 || tabIndex() < 0 || handlesOwnSwipe(event.target as Element)) return;
  const t = event.touches[0];
  swipe = { x: t.clientX, y: t.clientY, at: performance.now(), horizontal: null };
}, { passive: true });
document.addEventListener('touchmove', event => {
  if (!swipe) return;
  const t = event.touches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  if (swipe.horizontal === null && Math.hypot(dx, dy) > 12) swipe.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
  if (!swipe.horizontal) { if (swipe.horizontal === false) swipe = null; return; }
  const next = tabIndex() + (dx < 0 ? 1 : -1);
  // Past the first or last tab the content resists instead of following.
  const pull = next < 0 || next >= TABS.length ? dx * 0.12 : dx * 0.35;
  document.documentElement.classList.add('swiping');
  document.documentElement.style.setProperty('--swipe', `${Math.max(-80, Math.min(80, pull))}px`);
}, { passive: true });
document.addEventListener('touchend', event => {
  const s = swipe;
  swipe = null;
  if (!s?.horizontal) { resetDrag(); return; }
  const dx = event.changedTouches[0].clientX - s.x;
  const fast = Math.abs(dx) / Math.max(1, performance.now() - s.at) > 0.5;
  const next = tabIndex() + (dx < 0 ? 1 : -1);
  if ((Math.abs(dx) > 80 || (fast && Math.abs(dx) > 40)) && next >= 0 && next < TABS.length) {
    try { sessionStorage.setItem(DIR_KEY, dx < 0 ? 'forward' : 'back'); } catch { /* plain fade */ }
    location.href = TABS[next];
    return;
  }
  resetDrag();
});
document.addEventListener('touchcancel', () => { swipe = null; resetDrag(); });

// Arriving on a tab: a wave of water washes across from the side we came from and laps along the
// bottom edge. It is part of the new page, so it plays inside the slide. Skipped for reduced motion.
(() => {
  const dir = document.documentElement.dataset.nav;
  if (!dir || still()) return;
  const wave = document.createElement('div');
  wave.className = `water-wipe ${dir}`;
  wave.setAttribute('aria-hidden', 'true');
  wave.innerHTML = `<svg class="wash" viewBox="0 0 100 800" preserveAspectRatio="none"><path d="M100 0 H30 C8 60 46 110 26 170 S6 290 28 350 S48 470 24 530 S4 650 30 710 S40 780 30 800 H100Z"/><path class="foam" d="M30 0 C8 60 46 110 26 170 S6 290 28 350 S48 470 24 530 S4 650 30 710 S40 780 30 800"/></svg>
    <svg class="lap" viewBox="0 0 400 40" preserveAspectRatio="none"><path d="M0 22 Q25 8 50 22 T100 22 T150 22 T200 22 T250 22 T300 22 T350 22 T400 22 V40 H0Z"/></svg>`;
  document.body.append(wave);
  setTimeout(() => wave.remove(), 1200);
})();
