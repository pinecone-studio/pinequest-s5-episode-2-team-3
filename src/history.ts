import { load as readState, save, saveMessage, onExternalChange } from './storage';
import './style.css';
import './shell.css';
import './history.css';
import './pwa';
import { TYPES, defaults, dayKey, sortedEvents, type AppState, type WaterEntry } from './data';
import { escape, number, time } from './format';
import { Toast, notify } from './components/Toast';
import { siteNav } from './nav';
import { cupIcon, hxHeader } from './hydrify';
import { openEditSheet, openRowMenu } from './hx-edit';
import { entryIcon, entryName } from './drinks';
import './theme.css';

// "Түүх" page, Hydrify layout (kit screens 38–46): a week of goal rings that opens into a month,
// then the entries by day, each with a ⋮ menu to edit (amount, date, time) or delete (with undo).
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let committing = false;

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

// The ⋮ menu's "edit": the Hydrify sheet (amount, date, time); undo puts the old entry back.
function openEdit(id: string | undefined) {
  const entry = state.events.find(item => item.id === id);
  if (!entry) return;
  const previous = structuredClone(entry);
  openEditSheet(entry, async item => {
    if (!await commit(next => { next.events[next.events.findIndex(row => row.id === item.id)] = item; })) return false;
    changed('Бүртгэлийг шинэчиллээ.', async () => {
      if (await commit(next => { next.events = next.events.filter(row => row.id !== item.id).concat(previous); })) changed('Үйлдлийг буцаалаа.');
    });
    return true;
  });
}

async function remove(id: string | undefined) {
  const entry = state.events.find(item => item.id === id);
  if (!entry) return;
  const previous = structuredClone(entry);
  if (!await commit(next => { next.events = next.events.filter(row => row.id !== entry.id); })) return;
  changed('Түүх устгагдлаа!', async () => {
    if (await commit(next => next.events.push(previous))) changed('Бүртгэлийг сэргээв.');
  });
}

// A picked calendar day shows only that day; otherwise every day.
let picked = '';
const matches = (event: WaterEntry) => !picked || dayKey(new Date(event.at)) === picked;

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

// "Өнөөдөр, 10-р сарын 26" / "Өчигдөр, …" / "10-р сарын 24, 2026".
function dayTitle(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = `${m}-р сарын ${d}`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey()) return `Өнөөдөр, ${date}`;
  if (key === dayKey(yesterday)) return `Өчигдөр, ${date}`;
  return `${date}, ${y}`;
}

function row(event: WaterEntry): string {
  const label = `${time(event.at)} цагийн ${number(event.amount)} мл`;
  return `<li class="${event.type}">
    <span class="hx-icon">${entryIcon(event)}</span>
    <span class="hx-what"><b>${escape(entryName(event))}${event.type === 'drink' ? '' : ` · ${TYPES[event.type]}`}</b><small>${time(event.at)}</small></span>
    <span class="hx-ml">${number(event.amount)} мл</span>
    <button type="button" class="hx-row-more" data-menu="${event.id}" aria-haspopup="menu" aria-label="${label}: цэс"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
  </li>`;
}

function results(events: readonly WaterEntry[]): string {
  if (!events.length) {
    return `<section class="hx-card hx-empty-card">
      <span aria-hidden="true">${cupIcon(300)}</span>
      <p>${picked ? 'Энэ өдөр бүртгэл алга.' : 'Одоогоор усны түүх алга.'}</p>
    </section>`;
  }
  return groupByDay(events).map(([key, items]) => `
    <section class="hx-card hx-day-card" aria-labelledby="day-${key}">
      <div class="hx-card-head"><h2 id="day-${key}">${dayTitle(key)}</h2></div>
      <ul class="hx-list">${items.map(row).join('')}</ul>
    </section>
  `).join('');
}

function renderResults() {
  app.querySelector<HTMLDivElement>('#results')!.innerHTML = results(state.events.filter(matches));
  app.querySelector<HTMLDivElement>('#hx-cal')!.innerHTML = calendar();
}

// Hydrify's week strip (screen 38) that opens into a month (screen 46): each day a ring filled to
// that day's share of the goal. Tapping a day shows only its entries; tapping it again shows all.
const WEEK = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня']; // Monday first, as in the kit
const MONTHS = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
let expanded = false;
let monthOffset = 0;

function dayRing(d: Date, totals: Map<string, number>): string {
  const C = 2 * Math.PI * 17;
  const key = dayKey(d);
  const frac = Math.min(1, (totals.get(key) ?? 0) / state.goal);
  return `<button type="button" class="hx-day${key === dayKey() ? ' today' : ''}${key === picked ? ' on' : ''}" data-day="${key}" ${key > dayKey() ? 'disabled' : ''} aria-pressed="${key === picked}" aria-label="${d.getMonth() + 1}/${d.getDate()}: ${Math.round(frac * 100)}%">
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="bg"/>${frac > 0 ? `<circle cx="20" cy="20" r="17" class="fg" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>` : ''}</svg><b>${d.getDate()}</b></button>`;
}

function calendar(): string {
  const totals = new Map<string, number>();
  for (const e of state.events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); totals.set(k, (totals.get(k) ?? 0) + e.amount); }
  const toggle = `<button type="button" class="hx-cal-toggle" data-expand aria-expanded="${expanded}" aria-label="${expanded ? 'Хураах' : 'Сарын хуанли'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
  const head = `<div class="hx-cal-week" aria-hidden="true">${WEEK.map(w => `<small>${w}</small>`).join('')}</div>`;
  if (!expanded) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i); return d; });
    return `<section class="hx-card hx-cal" aria-label="Энэ долоо хоног">${head}<div class="hx-cal-grid">${days.map(d => dayRing(d, totals)).join('')}</div>${toggle}</section>`;
  }
  const first = new Date(); first.setHours(12, 0, 0, 0); first.setDate(1); first.setMonth(first.getMonth() + monthOffset);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: (first.getDay() + 6) % 7 }, () => '<span></span>')
    .concat(Array.from({ length: count }, (_, i) => { const d = new Date(first); d.setDate(i + 1); return dayRing(d, totals); }));
  return `<section class="hx-card hx-cal" aria-label="Сарын хуанли">
    <div class="hx-cal-month"><button type="button" data-month="-1" aria-label="Өмнөх сар">‹</button><b>${first.getFullYear()} оны ${MONTHS[first.getMonth()]}</b><button type="button" data-month="1" aria-label="Дараах сар" ${monthOffset >= 0 ? 'disabled' : ''}>›</button></div>
    ${head}<div class="hx-cal-grid">${cells.join('')}</div>${toggle}</section>`;
}

function render() {
  app.innerHTML = `
    <a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1">
      <div class="app-shell">
        <header class="app-top">${siteNav('history')}</header>
        <div class="hydro hx-page">
          ${hxHeader('Түүх')}
          <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
          <div id="hx-cal"></div>
          <div id="results" class="hx-results"></div>
        </div>
      </div>
    </main>
    ${Toast()}
  `;
  app.querySelector<HTMLDivElement>('.hx-page')!.onclick = event => {
    const target = event.target as Element;
    const menu = target.closest<HTMLButtonElement>('[data-menu]');
    if (menu) openRowMenu(menu, () => openEdit(menu.dataset.menu), () => void remove(menu.dataset.menu));
    if (target.closest('[data-expand]')) { expanded = !expanded; monthOffset = 0; renderResults(); app.querySelector<HTMLButtonElement>('[data-expand]')!.focus(); }
    const month = target.closest<HTMLButtonElement>('[data-month]');
    if (month) { monthOffset = Math.min(0, monthOffset + Number(month.dataset.month)); renderResults(); }
    const day = target.closest<HTMLButtonElement>('[data-day]');
    if (day) { picked = picked === day.dataset.day ? '' : day.dataset.day!; renderResults(); }
  };
  renderResults();
}

onExternalChange(async () => { await load(); render(); });
void load().then(render);
