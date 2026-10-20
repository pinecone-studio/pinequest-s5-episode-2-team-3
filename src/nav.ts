// One menu for every page: keep it to the two places people actually go.
export function siteNav(current?: 'home' | 'history'): string {
  const link = (href: string, label: string, key: 'home' | 'history') =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="site-nav" aria-label="Хэсгүүд">${link('/', 'Нүүр', 'home')}${link('/history.html', 'Түүх', 'history')}</nav>`;
}
