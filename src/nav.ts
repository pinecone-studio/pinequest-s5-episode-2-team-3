type Page = 'home' | 'history' | 'settings';

// One menu for every page: the places people actually go.
export function siteNav(current?: Page): string {
  const link = (href: string, label: string, key: Page) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}${link('/settings.html', 'Тохиргоо', 'settings')}</nav>`;
}
