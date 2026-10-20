import './style.css';
import './overview.css';
import { STORAGE_KEY, defaults, dayKey, validateState, type AppState, type WaterEntry } from './data';

const dropIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/></svg>';
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const dateLabel = (key: string) => key.replaceAll('-', '.');
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let today = dayKey();

interface DaySummary { drink: number; drinkCount: number; spill: number; pending: number }

// Read-only: this part never writes to storage.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? validateState(JSON.parse(raw)) : defaults();
    storageError = '';
  } catch {
    state = defaults();
    storageError = 'Хадгалсан өгөгдлийг нээж чадсангүй. Тойм харуулах боломжгүй байна.';
  }
}

// Only "drink" counts toward the daily total; spill and pending are shown separately.
function summarize(events: readonly WaterEntry[], key: string): DaySummary {
  const summary: DaySummary = { drink: 0, drinkCount: 0, spill: 0, pending: 0 };
  for (const event of events) {
    if (dayKey(new Date(event.at)) !== key) continue;
    if (event.type === 'drink') { summary.drink += event.amount; summary.drinkCount += 1; }
    else if (event.type === 'spill') summary.spill += event.amount;
    else summary.pending += 1;
  }
  return summary;
}

function summarySection(key: string): string {
  const day = summarize(state.events, key);
  const percent = Math.round((day.drink / state.goal) * 100);
  const target = state.mode === 'goal' ? 'Өдрийн зорилт' : 'Өдрийн дээд хязгаар';
  return `<section class="summary" aria-labelledby="summary-title">
    <h2 id="summary-title" class="visually-hidden">Өдрийн дүн</h2>
    <p class="summary-label">Уусан</p>
    <p class="summary-total"><strong>${number(day.drink)}</strong> мл</p>
    <p class="summary-target">${target} <strong>${number(state.goal)} мл</strong> · ${percent}%</p>
    <dl class="facts">
      <div><dt>Уусан бүртгэл</dt><dd>${day.drinkCount}</dd></div>
      <div><dt>Асгасан</dt><dd>${number(day.spill)} мл <small>дүнд ороогүй</small></dd></div>
      <div><dt>Тодорхойгүй</dt><dd>${day.pending} бүртгэл ${day.pending ? '<a href="/">шийдэх</a>' : '<small>дүнд ороогүй</small>'}</dd></div>
    </dl>
  </section>`;
}

function render() {
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="Дусал нүүр">${dropIcon}Дусал<span>/ өдрийн тойм</span></a><nav class="site-nav" aria-label="Хэсгүүд"><a href="/overview.html" aria-current="page">Өдрийн тойм</a><a href="/">Ус бүртгэх</a></nav></div></header><main id="main" tabindex="-1"><div class="page-heading"><div><p class="page-kicker">ӨДРИЙН ТОЙМ</p><h1>Өнөөдөр</h1><p class="page-date">${dateLabel(today)}</p></div></div><p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>${summarySection(today)}<footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer></main>`;
}

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) { load(); render(); }
});
// Roll over to the new day at midnight without a reload.
setInterval(() => { if (dayKey() !== today) { today = dayKey(); render(); } }, 60_000);
load();
render();
