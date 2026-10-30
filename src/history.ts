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

// "Түүх" page, Hydrify layout: week / month / year tabs with a period stepper, one bar chart of the
// water drunk against the goal (or the doctor's limit), then the period's entries by day, each with
// a ⋮ menu to edit (amount, date, time) or delete (with undo). Tapping a bar shows only that day.
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

// The period on screen: seven days, the days of a month, or twelve months. Each bucket covers the
// day keys from..to; `days` counts only days up to today, so averages and "N/M" skip the future.
type Span = 'week' | 'month' | 'year';
interface Bucket { label: string; name: string; ml: number; days: number; from: string; to: string }
let span: Span = 'week';
let offset = 0; // 0 = this period, -1 = the one before …
let picked = -1; // the tapped bar; -1 shows the whole period

const MONTHS = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];

function totals(): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of state.events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); m.set(k, (m.get(k) ?? 0) + e.amount); }
  return m;
}

function buckets(): { list: Bucket[]; title: string } {
  const t = totals();
  const today = dayKey();
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const day = (d: Date): Bucket => {
    const k = dayKey(d);
    return { label: String(d.getDate()), name: `${MONTHS[d.getMonth()]} сарын ${d.getDate()}`, ml: t.get(k) ?? 0, days: k > today ? 0 : 1, from: k, to: k };
  };
  if (span === 'week') {
    const end = new Date(now); end.setDate(end.getDate() + offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - 6 + i); return d; });
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return { list: days.map(day), title: `${fmt(days[0])} – ${fmt(days[6])}, ${days[6].getFullYear()}` };
  }
  if (span === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const list = Array.from({ length: count }, (_, i) => day(new Date(first.getFullYear(), first.getMonth(), i + 1, 12)));
    return { list, title: `${first.getFullYear()} оны ${MONTHS[first.getMonth()]} сар` };
  }
  const year = now.getFullYear() + offset;
  const list = MONTHS.map((m, i) => {
    const count = new Date(year, i + 1, 0).getDate();
    let ml = 0, days = 0;
    for (let d = 1; d <= count; d++) {
      const k = dayKey(new Date(year, i, d, 12));
      ml += t.get(k) ?? 0;
      if (k <= today) days++;
    }
    return { label: String(i + 1), name: `${m} сар`, ml, days, from: dayKey(new Date(year, i, 1, 12)), to: dayKey(new Date(year, i, count, 12)) };
  });
  return { list, title: `${year} он` };
}

const limitMode = () => state.mode === 'limit';
// A bar's value: ml that day, or in the year view the month's daily average so far.
const value = (b: Bucket) => (span === 'year' ? (b.days ? Math.round(b.ml / b.days) : 0) : b.ml);
// Met the goal, or stayed within the doctor's limit.
const kept = (b: Bucket) => (limitMode() ? value(b) <= state.goal : value(b) >= state.goal);
const liters = (ml: number) => `${(ml / 1000).toFixed(1).replace(/\.0$/, '')}L`;

// One bar chart against a dashed goal / limit line. Bars are never capped, so overuse shows: the
// scale grows past the goal. The tapped bar (or, before a tap, today) gets a ring; a tap adds its value.
function chart(list: Bucket[]): string {
  const goal = state.goal;
  const values = list.map(value);
  const top = Math.max(goal * 1.25, ...values) * 1.08;
  const pct = (v: number) => ((v / top) * 100).toFixed(2);
  const today = dayKey();
  const mark = picked >= 0 ? picked : list.findIndex(b => b.from <= today && today <= b.to);
  const each = span === 'year' ? 'өдөрт дунджаар ' : '';
  const bars = list.map((b, i) => {
    const v = values[i];
    const tone = (limitMode() ? (v > goal ? ' over' : '') : (v >= goal ? ' met' : '')) + (v ? '' : ' empty');
    const tip = i === picked ? `<span class="rp-tip">${number(v)} <small>мл</small></span>` : '';
    return `<button type="button" class="rp-bar${tone}${i === mark ? ' on' : ''}" data-pick="${i}" aria-pressed="${i === picked}" aria-label="${escape(b.name)}: ${each}${number(v)} мл" ${b.days ? '' : 'disabled'}><i style="height: ${pct(v)}%">${tip}</i></button>`;
  }).join('');
  // A month has room for every fifth day and the last, plus today / the tapped day without its close neighbours.
  const near = (i: number) => mark >= 0 && i !== mark && Math.abs(i - mark) < 3;
  const shows = (i: number) => list.length <= 12 || i === mark || ((i % 5 === 0 || i === list.length - 1) && !near(i));
  const labels = list.map((b, i) => `<span${i === mark ? ' class="on"' : ''}>${shows(i) ? escape(b.label) : ''}</span>`).join('');
  // The tapped bar's value wins over the goal label (both px from the bottom of the 180px plot,
  // theme.css): the label moves under the line, or hides when there is no room there either.
  let room = '';
  if (picked >= 0 && (picked + .5) / list.length > .3) {
    const line = (goal / top) * 180, lo = Math.max(4, (values[picked] / top) * 180) + 10, hi = lo + 38;
    const hits = (a: number, b: number) => a < hi && b > lo;
    if (hits(line + 2, line + 22)) room = hits(line - 22, line - 2) ? ' hide' : ' below';
  }
  const axis = [1, .75, .5, .25, 0].map(f => `<span style="bottom: ${f * 100}%">${liters(top * f)}</span>`).join('');
  return `<div class="rp-bars${list.length > 12 ? ' dense' : ''}">
      <div class="rp-axis" aria-hidden="true">${axis}</div>
      <div class="rp-plot">${bars}<div class="hx-goal-line${room}" style="bottom: ${pct(goal)}%" aria-hidden="true"><span>${limitMode() ? 'Хязгаар' : 'Зорилт'} ${number(goal)} мл</span></div></div>
      <div class="rp-labels" aria-hidden="true">${labels}</div>
    </div>`;
}

// Under the chart: the daily average so far, how many days (months) kept the goal or limit, the
// total, and where the water was logged (by the smart base, or by hand).
function stats(list: Bucket[], events: readonly WaterEntry[]): string {
  const days = list.reduce((sum, b) => sum + b.days, 0);
  const total = list.reduce((sum, b) => sum + b.ml, 0);
  // Finished days only, as «Явц» counts them: today is still open, so it is neither kept nor missed yet.
  const today = dayKey();
  const counted = list.filter(b => b.days && (span === 'year' || b.to < today));
  const good = counted.filter(kept).length;
  let base = 0, hand = 0;
  for (const e of events) if (e.type === 'drink') { if (e.deviceId) base += e.amount; else hand += e.amount; }
  const share = (ml: number) => Math.round((ml / (base + hand)) * 100);
  return `<div class="hx-stats">
      <p><b>${number(days ? Math.round(total / days) : 0)}</b><small>мл / өдөр</small></p>
      <p><b${limitMode() && good < counted.length ? ' class="bad"' : ''}>${good}/${counted.length}</b><small>${limitMode() ? 'хязгаарт багтсан' : 'зорилт биелсэн'}</small></p>
      <p><b>${liters(total)}</b><small>нийт</small></p>
    </div>
    ${base + hand ? `<p class="hx-src"><span><i class="base"></i>Ухаалаг суурь ${share(base)}%</span><span><i class="hand"></i>Гараар ${share(hand)}%</span></p>` : ''}`;
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

// Each day shows its newest few entries; «Бүгдийг харах» opens the rest. Opened days are kept here so
// a re-render (edit, delete, undo, chart) leaves them open. A tapped day always shows all.
const PREVIEW = 4;
const opened = new Set<string>();
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function dayCard(key: string, items: WaterEntry[]): string {
  const drinks = items.filter(e => e.type === 'drink');
  const total = drinks.reduce((sum, e) => sum + e.amount, 0);
  const folds = (picked < 0 || span === 'year') && items.length > PREVIEW;
  const open = !folds || opened.has(key);
  const over = limitMode() && total > state.goal;
  return `
    <section class="hx-card hx-day-card" aria-labelledby="day-${key}">
      <div class="hx-card-head"><h2 id="day-${key}">${dayTitle(key)}</h2><span class="hx-day-sum">${number(total)} мл · ${drinks.length} удаа</span></div>
      ${over ? `<p class="hx-over">Хязгаараас ${number(total - state.goal)} мл хэтэрсэн</p>` : ''}
      <ul class="hx-list" id="list-${key}">${(open ? items : items.slice(0, PREVIEW)).map(row).join('')}</ul>
      ${folds ? `<button type="button" class="hx-more-rows" data-more="${key}" aria-expanded="${open}" aria-controls="list-${key}">${open ? 'Хураах' : `Бүгдийг харах (+${items.length - PREVIEW})`}${CHEVRON}</button>` : ''}
    </section>`;
}

// A tapped day without entries keeps the day card's head, so the list does not jump to a big empty card.
function emptyDay(key: string): string {
  return `
    <section class="hx-card hx-day-card" aria-labelledby="day-${key}">
      <div class="hx-card-head"><h2 id="day-${key}">${dayTitle(key)}</h2><span class="hx-day-sum">0 мл · 0 удаа</span></div>
      <p class="hx-day-empty">Энэ өдөр ус уусан бүртгэл алга.</p>
    </section>`;
}

function results(events: readonly WaterEntry[], day: string): string {
  if (!events.length) {
    if (day) return emptyDay(day);
    const empty = picked < 0 ? 'Энэ хугацаанд бүртгэл алга.' : 'Энэ сард бүртгэл алга.';
    return `<section class="hx-card hx-empty-card">
      <span aria-hidden="true">${cupIcon(300)}</span>
      <p>${empty}</p>
    </section>`;
  }
  return groupByDay(events).map(([key, items]) => dayCard(key, items)).join('');
}

// Tabs, stepper and chart, then the entries of the tapped bar or of the whole period.
function renderResults() {
  const { list, title } = buckets();
  if (picked >= list.length) picked = -1;
  const within = (from: string, to: string) => (e: WaterEntry) => { const k = dayKey(new Date(e.at)); return k >= from && k <= to; };
  const period = state.events.filter(within(list[0].from, list[list.length - 1].to));
  const shown = picked < 0 ? period : period.filter(within(list[picked].from, list[picked].to));
  const tab = (key: Span, label: string) => `<button type="button" role="tab" aria-selected="${span === key}" data-span="${key}">${label}</button>`;
  app.querySelector<HTMLDivElement>('#hx-top')!.innerHTML = `
    <div class="rp-tabs" role="tablist" aria-label="Хугацаа">${tab('week', '7 хоног')}${tab('month', 'Сар')}${tab('year', 'Жил')}</div>
    <div class="rp-range"><button type="button" data-step="-1" aria-label="Өмнөх">‹</button><b>${escape(title)}</b><button type="button" data-step="1" aria-label="Дараах" ${offset >= 0 ? 'disabled' : ''}>›</button></div>
    <section class="hx-card hx-chart" aria-label="Уусан ус">${chart(list)}${stats(list, period)}</section>`;
  app.querySelector<HTMLDivElement>('#results')!.innerHTML = results(shown, picked >= 0 && span !== 'year' ? list[picked].from : '');
}

// Re-render; after a key press, put focus back on the control that was used, so keyboard users keep
// their place (after a tap that would draw the focus ring around it).
let byKey = false;
function refresh(focus: string) {
  renderResults();
  if (byKey) app.querySelector<HTMLButtonElement>(`${focus}:not(:disabled)`)?.focus();
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
          <div id="hx-top" class="hx-top"></div>
          <div id="results" class="hx-results"></div>
        </div>
      </div>
    </main>
    ${Toast()}
  `;
  app.querySelector<HTMLDivElement>('.hx-page')!.onclick = event => {
    const target = event.target as Element;
    byKey = event.detail === 0;
    const menu = target.closest<HTMLButtonElement>('[data-menu]');
    if (menu) openRowMenu(menu, () => openEdit(menu.dataset.menu), () => void remove(menu.dataset.menu));
    const tab = target.closest<HTMLButtonElement>('[data-span]');
    if (tab) { span = tab.dataset.span as Span; offset = 0; picked = -1; refresh(`[data-span="${span}"]`); }
    const step = target.closest<HTMLButtonElement>('[data-step]');
    if (step) { offset = Math.min(0, offset + Number(step.dataset.step)); picked = -1; refresh(`[data-step="${step.dataset.step}"]`); }
    const bar = target.closest<HTMLButtonElement>('[data-pick]');
    if (bar) { const i = Number(bar.dataset.pick); picked = picked === i ? -1 : i; refresh(`[data-pick="${i}"]`); }
    const more = target.closest<HTMLButtonElement>('[data-more]');
    if (more) {
      const key = more.dataset.more!;
      if (!opened.delete(key)) opened.add(key);
      refresh(`[data-more="${key}"]`);
    }
  };
  renderResults();
}

onExternalChange(async () => { await load(); render(); });
void load().then(render);
