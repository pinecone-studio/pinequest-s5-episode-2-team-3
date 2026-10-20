import './style.css';
import './history.css';
import './pwa';
import { STORAGE_KEY, TYPES, defaults, dayKey, isEntryType, sortedEvents, validateState, type AppState, type EntryType, type WaterEntry } from './data';
import { dateLabel, escape, number, time } from './format';
import { icon } from './components/Icon';
import { openEntryDialog } from './components/EntryDialog';
import { Toast, notify } from './components/Toast';
import { siteNav } from './nav';
import { downloadCsv, entriesCsv } from './csv';

interface Filter { from: string; to: string; type: EntryType | 'all' }

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let savedRaw: string | null = null;
let storageError = '';
let corruptStorage = false;
let filter: Filter = { from: '', to: '', type: 'all' };

function load() {
  try {
    savedRaw = localStorage.getItem(STORAGE_KEY);
    state = savedRaw ? validateState(JSON.parse(savedRaw)) : defaults();
    storageError = '';
    corruptStorage = false;
  } catch {
    state = defaults();
    storageError = 'Хадгалсан өгөгдлийг нээж чадсангүй. Түүх харуулах боломжгүй байна.';
    corruptStorage = true;
  }
}

// Same write guard as app.ts: never overwrite unreadable data or a newer save from another tab.
function commit(change: (next: AppState) => void): boolean {
  if (corruptStorage) { notify('Хадгалсан өгөгдөл уншигдахгүй байна. Өөрчлөлт оруулаагүй.'); return false; }
  try {
    if (localStorage.getItem(STORAGE_KEY) !== savedRaw) {
      load(); render(); notify('Өөр цонхонд мэдээлэл өөрчлөгдсөн тул шинэчиллээ. Үйлдлээ дахин хийнэ үү.');
      return false;
    }
    const next = structuredClone(state);
    change(next);
    const valid = validateState(next);
    const raw = JSON.stringify(valid);
    localStorage.setItem(STORAGE_KEY, raw);
    state = valid;
    savedRaw = raw;
    return true;
  } catch {
    const dialogError = document.querySelector<HTMLElement>('#dialog-error');
    if (dialogError) {
      dialogError.textContent = 'Өөрчлөлтийг хадгалж чадсангүй. Браузерын хадгалах эрх, сул зайг шалгаад дахин оролдоно уу.';
      dialogError.hidden = false;
    }
    notify('Хадгалалт амжилтгүй. Өөрчлөлт ороогүй.');
    return false;
  }
}

function changed(message: string, undo?: () => void) { renderResults(); notify(message, undo); }

function openEdit(id: string | undefined) {
  const entry = state.events.find(item => item.id === id);
  if (!entry) return;
  const previous = structuredClone(entry);
  openEntryDialog({
    entry,
    onSave(item) {
      if (!commit(next => { next.events[next.events.findIndex(row => row.id === item.id)] = item; })) return false;
      changed('Бүртгэлийг шинэчиллээ.', () => {
        if (commit(next => { next.events = next.events.filter(row => row.id !== item.id).concat(previous); })) changed('Үйлдлийг буцаалаа.');
      });
      return true;
    },
    onDelete() {
      if (!commit(next => { next.events = next.events.filter(row => row.id !== entry.id); })) return false;
      changed('Бүртгэлийг устгалаа.', () => {
        if (commit(next => next.events.push(previous))) changed('Бүртгэлийг сэргээв.');
      });
      return true;
    },
  });
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
    <button class="text-button subdued" data-edit="${event.id}"
      aria-label="${dateLabel(dayKey(new Date(event.at)))} ${time(event.at)} цагийн ${event.amount} мл бүртгэл засах">Засах</button>
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
  app.querySelector<HTMLButtonElement>('#export-csv')!.disabled = !events.length;
}

// Exports exactly what the filters show.
function exportCsv() {
  const events = state.events.filter(matches);
  if (events.length) downloadCsv(`dusal-history-${dayKey()}.csv`, entriesCsv(events));
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
        ${siteNav('history')}
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div class="page-heading">
        <div><p class="page-kicker">ХЭРЭГЛЭЭНИЙ ТҮҮХ</p><h1>Бүх бүртгэл</h1></div>
        <button class="primary-button" id="export-csv">CSV татах</button>
      </div>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      ${filters()}
      <p class="history-summary" id="summary" aria-live="polite"></p>
      <div id="results"></div>
      <footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
    <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
    ${Toast()}
  `;
  bindFilters();
  app.querySelector<HTMLButtonElement>('#export-csv')!.onclick = exportCsv;
  app.querySelector<HTMLDivElement>('#results')!.onclick = event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-edit]');
    if (button) openEdit(button.dataset.edit);
  };
  renderResults();
}

window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY || event.key === null) && !document.querySelector('dialog[open]')) { load(); render(); }
});
load();
render();
