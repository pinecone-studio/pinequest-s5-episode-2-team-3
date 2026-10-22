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
