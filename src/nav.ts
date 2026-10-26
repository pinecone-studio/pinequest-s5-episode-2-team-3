type Page = 'home' | 'history' | 'family' | 'settings';

const ICONS: Record<Page, string> = {
  home: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  history: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 15v-3M12 15V9M15 15v-5"/>',
  family: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.6 14.1c2.6-.2 4.5 1.4 5 4.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.5"/>',
};

// One menu for every page: the places people actually go. On phones it becomes a bottom tab bar (shell.css).
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Page) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg><span>${label}</span></a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/family.html', 'Гэр бүл', 'family')}${link('/settings.html', 'Тохиргоо', 'settings')}</nav>`;
}
