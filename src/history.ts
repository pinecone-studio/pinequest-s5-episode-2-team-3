import { load as readState, save, saveMessage, onExternalChange } from './storage';
import { SyncStatus, bindSyncStatus } from './components/SyncStatus';
import './style.css';
import './shell.css';
import './history.css';
import './pwa';
import { TYPES, defaults, dayKey, isEntryType, sortedEvents, type AppState, type EntryType, type WaterEntry } from './data';
import { dateLabel, escape, number, time } from './format';
import { brandMark } from './components/Icon';
import { openEntryDialog } from './components/EntryDialog';
import { Toast, notify } from './components/Toast';
import { closeTypeMenu, openTypeMenu, typeTrigger } from './components/TypeMenu';
import { siteNav } from './nav';
import { downloadCsv, entriesCsv } from './csv';
import { bindChart } from './history-chart';

interface Filter { from: string; to: string; type: EntryType | 'all' }

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let committing = false;
let filter: Filter = { from: '', to: '', type: 'all' };

async function load() {
  const loaded = await readState();
  state = loaded.state;
  storageError = loaded.error;
}

// Same write path as app.ts: storage refuses unreadable data and saves based on a stale read.
async function commit(change: (next: AppState) => void): Promise<boolean> {
  if (committing) return false;
  committing = true;
  try {
    const next = structuredClone(state);
    change(next);
    const result = await save(next);
    if (result === 'saved') { await load(); return true; }
    if (result === 'conflict') { await load(); render(); }
    notify(saveMessage[result]);
    return false;
  } finally { committing = false; }
}

function changed(message: string, undo?: () => void) { renderResults(); notify(message, undo); }

// Drink and spill are the only final types; a pending entry gets resolved here too.
async function setType(id: string | undefined, type: unknown) {
  const previous = state.events.find(event => event.id === id)?.type;
  if (!previous || type === previous || (type !== 'drink' && type !== 'spill')) return;
  if (!await commit(next => { next.events.find(event => event.id === id)!.type = type; })) return;
  changed(`${TYPES[type]} болгож өөрчиллөө.`, async () => {
    if (await commit(next => { const event = next.events.find(item => item.id === id); if (event) event.type = previous; })) changed('Өөрчлөлтийг буцаалаа.');
  });
  app.querySelector<HTMLButtonElement>(`[data-type-menu="${id}"]`)?.focus();
}

function openEdit(id: string | undefined) {
  const entry = state.events.find(item => item.id === id);
  if (!entry) return;
  const previous = structuredClone(entry);
  openEntryDialog({
    entry,
    async onSave(item) {
      if (!await commit(next => { next.events[next.events.findIndex(row => row.id === item.id)] = item; })) return false;
      changed('Бүртгэлийг шинэчиллээ.', async () => {
        if (await commit(next => { next.events = next.events.filter(row => row.id !== item.id).concat(previous); })) changed('Үйлдлийг буцаалаа.');
      });
      return true;
    },
    async onDelete() {
      if (!await commit(next => { next.events = next.events.filter(row => row.id !== entry.id); })) return false;
      changed('Бүртгэлийг устгалаа.', async () => {
        if (await commit(next => next.events.push(previous))) changed('Бүртгэлийг сэргээв.');
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
    <div class="type-cell">${typeTrigger(event.id, event.type, `${time(event.at)} цагийн ${event.amount} мл`)}</div>
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

// Pending entries only come from the smart bottle; offer that filter once one exists (or it's selected).
const hasPending = () => filter.type === 'pending' || state.events.some(event => event.type === 'pending');

function filters(): string {
  const today = dayKey();
  return `<form class="history-filters" id="filters" aria-label="Шүүлтүүр" data-transient>
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
        ${Object.entries(TYPES).filter(([type]) => type !== 'pending' || hasPending()).map(([type, label]) => `<option value="${type}" ${filter.type === type ? 'selected' : ''}>${label}</option>`).join('')}
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
    <main id="main" class="home home-app" tabindex="-1">
      <div class="app-shell">
        <header class="app-top">
          <a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${brandMark()}</span>Дусал</a>
          ${siteNav('history')}
          <span class="app-date">${dateLabel(dayKey())}</span>
        </header>
        <div class="history-body">
          <div class="history-head">
            <div><p class="panel-label">Хэрэглээний түүх</p><h1>Бүх бүртгэл</h1></div>
            <button type="button" class="dark-button" id="export-csv">CSV татах</button>
          </div>
          <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
          <div id="history-chart"></div>
          ${SyncStatus()}
          ${filters()}
          <p class="history-summary" id="summary" aria-live="polite"></p>
          <div id="results"></div>
        </div>
        <footer class="history-footer"><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
      </div>
    </main>
    <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
    ${Toast()}
  `;
  bindFilters();
  app.querySelector<HTMLButtonElement>('#export-csv')!.onclick = exportCsv;
  app.querySelector<HTMLDivElement>('#results')!.onclick = event => {
    const target = event.target as Element;
    const trigger = target.closest<HTMLButtonElement>('[data-type-menu]');
    if (trigger) toggleTypeMenu(trigger);
    const edit = target.closest<HTMLButtonElement>('[data-edit]');
    if (edit) openEdit(edit.dataset.edit);
  };
  app.querySelector<HTMLDivElement>('#results')!.onkeydown = event => {
    const trigger = (event.target as Element).closest<HTMLButtonElement>('[data-type-menu]');
    if (trigger && event.key === 'ArrowDown') { event.preventDefault(); toggleTypeMenu(trigger); }
  };
  renderResults();
  bindChart(app.querySelector<HTMLElement>('#history-chart')!, () => state);
  bindSyncStatus();
}

function toggleTypeMenu(trigger: HTMLButtonElement) {
  if (trigger.getAttribute('aria-expanded') === 'true') { closeTypeMenu(true); return; }
  const id = trigger.dataset.typeMenu;
  const entry = state.events.find(item => item.id === id);
  if (entry) openTypeMenu(trigger, entry.type, type => setType(id, type));
}

onExternalChange(async () => { await load(); render(); });
void load().then(render);
