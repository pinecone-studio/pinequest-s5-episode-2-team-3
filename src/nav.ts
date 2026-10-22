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

// Page-to-page slide. Pages are separate documents, so the old one slides out before the link is
// followed and the new one slides in when it first renders; the header and tab bar stay put.
// Going right in the tab order slides left, going back slides right.
const ORDER = ['/', '/history', '/settings'];
const DIR_KEY = 'dusal-page-dir';
const rank = (path: string) => {
  const i = ORDER.indexOf(path.replace(/\.html$/, '').replace(/\/index$/, '/'));
  return i < 0 ? 1 : i;
};
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('click', event => {
  const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target || link.hasAttribute('download') || link.origin !== location.origin || link.pathname === location.pathname || still()) return;
  event.preventDefault();
  const dir = rank(link.pathname) >= rank(location.pathname) ? 'forward' : 'back';
  try { sessionStorage.setItem(DIR_KEY, dir); } catch { /* the new page just appears */ }
  document.documentElement.classList.add(`page-leave-${dir}`);
  setTimeout(() => { location.href = link.href; }, 170);
});

(() => {
  let dir: string | null = null;
  try { dir = sessionStorage.getItem(DIR_KEY); sessionStorage.removeItem(DIR_KEY); } catch { /* no slide */ }
  if (!dir || still()) return;
  const root = document.documentElement;
  root.classList.add(`page-enter-${dir}`);
  setTimeout(() => root.classList.remove(`page-enter-${dir}`), 600);
})();
// Coming back through the browser's back/forward cache shows the page as it was left.
window.addEventListener('pageshow', event => {
  if (event.persisted) document.documentElement.classList.remove('page-leave-forward', 'page-leave-back');
});
