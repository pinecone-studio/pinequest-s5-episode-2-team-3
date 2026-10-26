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

// One menu for every page, Hydrify style: home, history, report, achievements and the account
// (settings). On phones it becomes a bottom tab bar (shell.css, theme.css).
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Item) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg><span>${label}</span></a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/report.html', 'Тайлан', 'report')}${link('/achievements.html', 'Амжилт', 'achievements')}${link('/settings.html', 'Профайл', 'settings')}</nav>`;
}

// Every page imports the nav, so the theme is applied here once per page.
applyTheme();
