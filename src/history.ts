import './style.css';
import './history.css';
import './pwa';
import { STORAGE_KEY, TYPES, defaults, dayKey, sortedEvents, validateState, type AppState, type WaterEntry } from './data';
import { dateLabel, escape, number, time } from './format';
import { icon } from './components/Icon';
import { siteNav } from './nav';

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? validateState(JSON.parse(raw)) : defaults();
    storageError = '';
  } catch {
    state = defaults();
    storageError = 'Хадгалсан өгөгдлийг нээж чадсангүй. Түүх харуулах боломжгүй байна.';
  }
}

// Newest day first; entries inside a day stay newest first.
function groupByDay(events: readonly WaterEntry[]): [string, WaterEntry[]][] {
  const groups = new Map<string, WaterEntry[]>();
  for (const event of sortedEvents(events)) {
    const key = dayKey(new Date(event.at));
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }
  return [...groups];
}

function row(event: WaterEntry): string {
  return `<li class="history-row ${event.type}">
    <time datetime="${event.at}">${time(event.at)}</time>
    <span class="entry-type"><i></i>${TYPES[event.type]}</span>
    <strong>${number(event.amount)} <small>мл</small></strong>
  </li>`;
}

function results(events: readonly WaterEntry[]): string {
  if (!events.length) {
    return `<div class="empty-state">
      <p>Бүртгэл алга.</p>
      <span>«Ус бүртгэх» хуудсаас бүртгэл нэмнэ.</span>
    </div>`;
  }
  return groupByDay(events).map(([key, items]) => `
    <section class="day-group" aria-labelledby="day-${key}">
      <h2 id="day-${key}">${dateLabel(key)}</h2>
      <ul>${items.map(row).join('')}</ul>
    </section>
  `).join('');
}

function renderResults() {
  app.querySelector<HTMLDivElement>('#results')!.innerHTML = results(state.events);
}

function render() {
  app.innerHTML = `
    <a class="skip-link" href="#main">Агуулга руу очих</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="Дусал нүүр">${icon('drop')}Дусал<span>/ хэрэглээний түүх</span></a>
        ${siteNav('history')}
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div class="page-heading">
        <div><p class="page-kicker">ХЭРЭГЛЭЭНИЙ ТҮҮХ</p><h1>Бүх бүртгэл</h1></div>
      </div>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      <div id="results"></div>
      <footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
  `;
  renderResults();
}

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) { load(); render(); }
});
load();
render();
