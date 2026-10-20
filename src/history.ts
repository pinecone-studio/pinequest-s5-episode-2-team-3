import './style.css';
import './history.css';
import { STORAGE_KEY, TYPES, defaults, dayKey, isEntryType, sortedEvents, validateState, type AppState, type EntryType, type WaterEntry } from './data';
import { dateLabel, escape, number, time } from './format';
import { icon } from './components/Icon';

interface Filter { from: string; to: string; type: EntryType | 'all' }

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let filter: Filter = { from: '', to: '', type: 'all' };

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

// Dates compare as YYYY-MM-DD strings; an empty bound means no limit.
function matches(event: WaterEntry): boolean {
  const key = dayKey(new Date(event.at));
  return (filter.type === 'all' || event.type === filter.type) &&
    (!filter.from || key >= filter.from) && (!filter.to || key <= filter.to);
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
  if (!state.events.length) {
    return `<div class="empty-state">
      <p>Бүртгэл алга.</p>
      <span>«Ус бүртгэх» хуудсаас бүртгэл нэмнэ.</span>
    </div>`;
  }
  if (!events.length) {
    return `<div class="empty-state">
      <p>Шүүлтэд тохирох бүртгэл алга.</p>
      <span>Огноо эсвэл төрлөө өөрчилж үзнэ үү.</span>
    </div>`;
  }
  return groupByDay(events).map(([key, items]) => `
    <section class="day-group" aria-labelledby="day-${key}">
      <h2 id="day-${key}">${dateLabel(key)}</h2>
      <ul>${items.map(row).join('')}</ul>
    </section>
  `).join('');
}

// Only "drink" counts toward the total, same as the daily overview.
function summary(events: readonly WaterEntry[]): string {
  const drink = events.reduce((sum, event) => event.type === 'drink' ? sum + event.amount : sum, 0);
  return `<span><strong>${number(events.length)}</strong> бүртгэл</span>
    <span>Уусан нийт <strong>${number(drink)}</strong> мл</span>`;
}

function renderResults() {
  const events = state.events.filter(matches);
  app.querySelector<HTMLParagraphElement>('#summary')!.innerHTML = summary(events);
  app.querySelector<HTMLDivElement>('#results')!.innerHTML = results(events);
}

function filters(): string {
  const today = dayKey();
  return `<form class="history-filters" id="filters" aria-label="Шүүлтүүр">
    <div>
      <label for="filter-from">Эхлэх огноо</label>
      <input id="filter-from" name="from" type="date" max="${filter.to || today}" value="${filter.from}"/>
    </div>
    <div>
      <label for="filter-to">Дуусах огноо</label>
      <input id="filter-to" name="to" type="date" min="${filter.from}" max="${today}" value="${filter.to}"/>
    </div>
    <div>
      <label for="filter-type">Төрөл</label>
      <select id="filter-type" name="type">
        <option value="all">Бүгд</option>
        ${Object.entries(TYPES).map(([type, label]) => `<option value="${type}" ${filter.type === type ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    <button type="button" class="text-button" id="clear-filters">Цэвэрлэх</button>
  </form>`;
}

function bindFilters() {
  const form = app.querySelector<HTMLFormElement>('#filters')!;
  const from = form.querySelector<HTMLInputElement>('#filter-from')!;
  const to = form.querySelector<HTMLInputElement>('#filter-to')!;
  const apply = () => {
    const type = form.querySelector<HTMLSelectElement>('#filter-type')!.value;
    filter = { from: from.value, to: to.value, type: isEntryType(type) ? type : 'all' };
    from.max = filter.to || dayKey();
    to.min = filter.from;
    renderResults();
  };
  form.oninput = apply;
  form.onsubmit = event => event.preventDefault();
  form.querySelector<HTMLButtonElement>('#clear-filters')!.onclick = () => { form.reset(); apply(); };
}

function render() {
  app.innerHTML = `
    <a class="skip-link" href="#main">Агуулга руу очих</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="Дусал нүүр">${icon('drop')}Дусал<span>/ хэрэглээний түүх</span></a>
        <nav class="site-nav" aria-label="Хэсгүүд">
          <a href="/overview.html">Өдрийн тойм</a><a href="/">Ус бүртгэх</a><a href="/history.html" aria-current="page">Түүх</a>
        </nav>
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div class="page-heading">
        <div><p class="page-kicker">ХЭРЭГЛЭЭНИЙ ТҮҮХ</p><h1>Бүх бүртгэл</h1></div>
      </div>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      ${filters()}
      <p class="history-summary" id="summary" aria-live="polite"></p>
      <div id="results"></div>
      <footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
  `;
  bindFilters();
  renderResults();
}

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) { load(); render(); }
});
load();
render();
