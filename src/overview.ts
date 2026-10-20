import './style.css';
import './overview.css';
import './pwa';
import { STORAGE_KEY, defaults, dayKey, validateState, type AppState, type WaterEntry } from './data';
import { BOTTLE_KEY, bottleSection, bindBottle } from './bottle';

const dropIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/></svg>';
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const dateLabel = (key: string) => key.replaceAll('-', '.');
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let today = dayKey();
let selected = today;

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

function status(drink: number): { text: string; tone: 'ok' | 'short' | 'over' } {
  const { goal, mode } = state;
  const diff = goal - drink;
  if (mode === 'goal') {
    if (diff > 0) return { text: `Зорилтод хүрэхэд ${number(diff)} мл дутуу`, tone: 'short' };
    return { text: diff < 0 ? `Зорилт биеллээ · ${number(-diff)} мл илүү` : 'Зорилт биеллээ', tone: 'ok' };
  }
  if (diff >= 0) return { text: `Хязгаар хүртэл ${number(diff)} мл үлдсэн`, tone: 'short' };
  return { text: `Хязгаараас ${number(-diff)} мл хэтэрсэн`, tone: 'over' };
}

function summarySection(key: string): string {
  const day = summarize(state.events, key);
  const percent = Math.round((day.drink / state.goal) * 100);
  const { text, tone } = status(day.drink);
  const target = state.mode === 'goal' ? 'Өдрийн зорилт' : 'Өдрийн дээд хязгаар';
  return `<section class="summary" aria-labelledby="summary-title">
    <h2 id="summary-title" class="visually-hidden">Өдрийн дүн</h2>
    <p class="summary-label">Уусан</p>
    <p class="summary-total"><strong>${number(day.drink)}</strong> мл</p>
    <p class="summary-target">${target} <strong>${number(state.goal)} мл</strong> · ${percent}%</p>
    <div class="progress ${tone}" role="progressbar" aria-label="${target}" aria-valuemin="0" aria-valuemax="${state.goal}" aria-valuenow="${Math.min(day.drink, state.goal)}" aria-valuetext="${number(day.drink)} / ${number(state.goal)} мл"><span style="width:${Math.min(percent, 100)}%"></span></div>
    <p class="summary-status ${tone}">${tone === 'over' ? '<b aria-hidden="true">!</b>' : ''}${text}</p>
    <dl class="facts">
      <div><dt>Уусан бүртгэл</dt><dd>${day.drinkCount}</dd></div>
      <div><dt>Асгасан</dt><dd>${number(day.spill)} мл <small>дүнд ороогүй</small></dd></div>
      <div><dt>Тодорхойгүй</dt><dd>${day.pending} бүртгэл ${day.pending ? '<a href="/">шийдэх</a>' : '<small>дүнд ороогүй</small>'}</dd></div>
    </dl>
  </section>`;
}

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

function select(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key > today) return;
  selected = key;
  render();
}

function dayPicker(): string {
  return `<div class="day-picker"><button class="icon-button" id="prev-day" aria-label="Өмнөх өдөр">‹</button><label class="visually-hidden" for="day-input">Өдөр сонгох</label><input id="day-input" type="date" max="${today}" value="${selected}"/><button class="icon-button" id="next-day" aria-label="Дараах өдөр" ${selected >= today ? 'disabled' : ''}>›</button>${selected !== today ? '<button class="text-button" id="go-today">Өнөөдөр</button>' : ''}</div>`;
}

function bind() {
  document.querySelector('#prev-day')?.addEventListener('click', () => select(shiftDay(selected, -1)));
  document.querySelector('#next-day')?.addEventListener('click', () => select(shiftDay(selected, 1)));
  document.querySelector('#go-today')?.addEventListener('click', () => select(today));
  document.querySelector<HTMLInputElement>('#day-input')?.addEventListener('change', event => select((event.target as HTMLInputElement).value));
}

const WEEKDAYS = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
const compact = (n: number) => n >= 1000 ? `${Number((n / 1000).toFixed(1))}K` : String(n);

function niceStep(max: number): number {
  return [100, 250, 500, 1000, 2000, 5000].find(step => max / step <= 5) ?? 10000;
}

// Bar with a 4px rounded top and a square base on the baseline.
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function chartWidth(): number {
  const gutter = window.innerWidth <= 760 ? 20 : 40;
  return Math.round(Math.min(1000, Math.max(300, window.innerWidth - gutter * 2)));
}

function weekSection(): string {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(selected, i - 6)).map(key => ({ key, drink: summarize(state.events, key).drink }));
  const total = days.reduce((sum, day) => sum + day.drink, 0);
  // Draw at the real content width so text stays at its CSS size on phones.
  const W = chartWidth(), H = 220, left = 40, right = 8, top = 18, bottom = 40;
  const plotW = W - left - right, plotH = H - top - bottom;
  const step = niceStep(Math.max(state.goal, ...days.map(day => day.drink)) * 1.1);
  const yMax = Math.ceil((Math.max(state.goal, ...days.map(day => day.drink)) * 1.1) / step) * step;
  const y = (value: number) => top + plotH - (value / yMax) * plotH;
  const slot = plotW / 7, barW = Math.min(24, slot * 0.5);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
  const goalLabel = state.mode === 'goal' ? 'Зорилт' : 'Хязгаар';
  const grid = ticks.map(t => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('');
  const bars = days.map((day, i) => {
    const cx = left + slot * i + slot / 2;
    const h = (day.drink / yMax) * plotH;
    const date = new Date(`${day.key}T12:00`);
    const isSelected = day.key === selected;
    return `<g class="day${isSelected ? ' selected' : ''}">
      ${h > 0 ? `<path class="bar" d="${barPath(cx - barW / 2, y(day.drink), barW, h)}"/>` : ''}
      ${isSelected && day.drink > 0 ? `<text class="value" x="${cx}" y="${y(day.drink) - 8}" text-anchor="middle">${number(day.drink)}</text>` : ''}
      <text class="axis${isSelected ? ' strong' : ''}" x="${cx}" y="${H - bottom + 18}" text-anchor="middle">${WEEKDAYS[date.getDay()]}</text>
      <text class="axis" x="${cx}" y="${H - bottom + 33}" text-anchor="middle">${date.getDate()}</text>
      <rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH + bottom}" tabindex="0" role="button" data-day="${day.key}" data-cx="${cx / W}" data-cy="${y(day.drink) / H}" aria-label="${dateLabel(day.key)}: ${number(day.drink)} мл"/>
    </g>`;
  }).join('');
  const rows = days.map(day => `<tr${day.key === selected ? ' class="selected"' : ''}><td>${dateLabel(day.key)}</td><td>${WEEKDAYS[new Date(`${day.key}T12:00`).getDay()]}</td><td>${number(day.drink)} мл</td><td>${Math.round((day.drink / state.goal) * 100)}%</td></tr>`).join('');
  return `<section class="week" aria-labelledby="week-title">
    <div class="section-heading"><h2 id="week-title">Сүүлийн 7 хоног</h2><span>${dateLabel(days[0].key)} – ${dateLabel(days[6].key)}</span></div>
    <p class="week-total">Нийт <strong>${number(total)} мл</strong> · өдөрт дунджаар <strong>${number(Math.round(total / 7))} мл</strong></p>
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сүүлийн 7 хоногийн уусан ус, өдөр бүрээр">
        ${grid}
        <line class="goal-line" x1="${left}" x2="${W - right}" y1="${y(state.goal)}" y2="${y(state.goal)}"/>
        <text class="goal-label" x="${W - right}" y="${y(state.goal) - 6}" text-anchor="end">${goalLabel} ${number(state.goal)}</text>
        ${bars}
      </svg>
      <div class="chart-tip" role="status" hidden></div>
    </div>
    <details class="chart-table"><summary>Хүснэгтээр харах</summary><div class="table-wrap"><table><thead><tr><th>Огноо</th><th>Гараг</th><th>Уусан</th><th>${goalLabel}ын</th></tr></thead><tbody>${rows}</tbody></table></div></details>
  </section>`;
}

function bindChart() {
  const chart = document.querySelector<HTMLDivElement>('.chart');
  const tip = chart?.querySelector<HTMLDivElement>('.chart-tip');
  if (!chart || !tip) return;
  chart.querySelectorAll<SVGRectElement>('.hit').forEach(hit => {
    const key = hit.dataset.day!;
    const show = () => {
      const drink = summarize(state.events, key).drink;
      tip.innerHTML = `<span>${dateLabel(key)}</span><strong>${number(drink)} мл</strong>`;
      tip.style.left = `${Number(hit.dataset.cx) * 100}%`;
      tip.style.top = `${Number(hit.dataset.cy) * 100}%`;
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    hit.addEventListener('click', () => select(key));
    hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(key); } });
  });
}

function render() {
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="Дусал нүүр">${dropIcon}Дусал<span>/ өдрийн тойм</span></a><nav class="site-nav" aria-label="Хэсгүүд"><a href="/overview.html" aria-current="page">Өдрийн тойм</a><a href="/">Ус бүртгэх</a><a href="/settings.html">Тохиргоо</a></nav></div></header><main id="main" tabindex="-1"><div class="page-heading"><div><p class="page-kicker">ӨДРИЙН ТОЙМ</p><h1>${selected === today ? 'Өнөөдөр' : dateLabel(selected)}</h1>${selected === today ? `<p class="page-date">${dateLabel(today)}</p>` : ''}</div>${dayPicker()}</div><p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>${selected === today ? bottleSection(state.events) : ''}${summarySection(selected)}${weekSection()}<footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer></main>`;
  bind();
  bindChart();
  bindBottle(render);
}

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === BOTTLE_KEY || event.key === null) { load(); render(); }
});
// Roll over to the new day at midnight without a reload.
let lastWidth = chartWidth();
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (chartWidth() !== lastWidth) { lastWidth = chartWidth(); render(); } }, 150);
});
setInterval(() => {
  if (dayKey() === today) return;
  if (selected === today) selected = dayKey();
  today = dayKey();
  render();
}, 60_000);
load();
render();
