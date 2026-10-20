import './style.css';
import './overview.css';
import './pwa';
import { STORAGE_KEY, dayKey, type AppState, type WaterEntry } from './data';
import { load, save, saveMessage } from './storage';
import { BOTTLE_KEY, bottleSection, bindBottle } from './bottle';
import { siteNav } from './nav';
import { CONDITIONS, PROFILE_KEY, calcPlan, readProfile, validProfile, writeProfile, type Profile } from './plan';

const dropIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/></svg>';
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
const liters = (ml: number) => (ml / 1000).toFixed(ml % 100 ? 2 : 1).replace(/0$/, '');
const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const dateLabel = (key: string) => key.replaceAll('-', '.');
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState;
let storageError = '';
let today = dayKey();
let undoId: string | null = null;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

function reload() {
  const loaded = load();
  state = loaded.state;
  storageError = loaded.error;
}

// Only "drink" counts toward the daily total.
function drankOn(events: readonly WaterEntry[], key: string): number {
  return events.reduce((sum, e) => (e.type === 'drink' && dayKey(new Date(e.at)) === key ? sum + e.amount : sum), 0);
}

function status(drink: number): { text: string; tone: 'ok' | 'short' | 'over' } {
  const diff = state.goal - drink;
  if (state.mode === 'goal') {
    return diff > 0 ? { text: `Дахиад ${number(diff)} мл уух`, tone: 'short' } : { text: 'Өнөөдрийн зорилт биеллээ', tone: 'ok' };
  }
  return diff >= 0 ? { text: `Хязгаар хүртэл ${number(diff)} мл`, tone: 'short' } : { text: `Хязгаараас ${number(-diff)} мл хэтэрсэн`, tone: 'over' };
}

function todaySection(): string {
  const drink = drankOn(state.events, today);
  const percent = Math.min(100, Math.round((drink / state.goal) * 100));
  const { text, tone } = status(drink);
  return `<section class="today" aria-labelledby="today-title">
    <h2 id="today-title" class="today-label">Өнөөдөр уусан</h2>
    <p class="today-total"><strong>${number(drink)}</strong> / ${number(state.goal)} мл</p>
    <div class="progress ${tone}" role="progressbar" aria-label="Өнөөдрийн явц" aria-valuemin="0" aria-valuemax="${state.goal}" aria-valuenow="${Math.min(drink, state.goal)}"><span style="width:${percent}%"></span></div>
    <p class="summary-status ${tone}">${tone === 'over' ? '<b aria-hidden="true">!</b>' : ''}${text}</p>
    <div class="drink-buttons" role="group" aria-label="Уусан ус нэмэх">${[150, 250, 500].map(ml => `<button type="button" class="drink-button" data-drink="${ml}">+${ml} мл</button>`).join('')}</div>
    <p class="undo-line" id="undo-line" role="status" ${undoId ? '' : 'hidden'}>Нэмлээ <button type="button" class="text-button" id="undo">Буцаах</button></p>
  </section>`;
}

function planSection(p: Profile): string {
  const plan = calcPlan(p);
  const doctor = p.condition === 'kidney' || p.condition === 'heart';
  return `<section class="plan-card" aria-labelledby="plan-title">
    <h2 id="plan-title">Миний өдрийн хэмжээ</h2>
    <form id="plan-form" novalidate>
      <div class="plan-fields">
        <label>Нас<input id="plan-age" name="age" type="number" inputmode="numeric" min="4" max="110" value="${p.age}"/></label>
        <label>Жин, кг<input id="plan-weight" name="weight" type="number" inputmode="numeric" min="10" max="250" value="${p.weight}"/></label>
        <label>Өндөр, см<input id="plan-height" name="height" type="number" inputmode="numeric" min="90" max="230" value="${p.height}"/></label>
        <label class="wide">Онош<select id="plan-condition" name="condition">${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${p.condition === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="doctor" ${doctor ? '' : 'hidden'}>Эмчийн заасан хязгаар, мл<input id="plan-doctor" name="doctorLimit" type="number" inputmode="numeric" min="500" max="4000" value="${p.doctorLimit}"/></label>
      </div>
      <div class="plan-result" aria-live="polite">
        <p class="plan-amount"><strong id="plan-l">${liters(plan.ml)}</strong> л <span id="plan-kind">${plan.mode === 'limit' ? 'өдөрт хамгийн ихдээ' : 'өдөрт'}</span></p>
        <p class="plan-how" id="plan-how">${escape(plan.how)}</p>
      </div>
      <p class="form-error" id="plan-error" role="alert" hidden></p>
      <button type="submit" class="primary-button plan-save">Үүнийг зорилт болгох</button>
      <p class="plan-saved" id="plan-saved" role="status"></p>
    </form>
    <p class="plan-note">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана.</p>
  </section>`;
}

function readForm(form: HTMLFormElement): Partial<Profile> {
  const d = new FormData(form);
  const n = (k: string) => Number(d.get(k));
  return { age: n('age'), weight: n('weight'), height: n('height'), condition: String(d.get('condition')) as Profile['condition'], doctorLimit: n('doctorLimit') };
}

function bindPlan() {
  const form = document.querySelector<HTMLFormElement>('#plan-form')!;
  const error = form.querySelector<HTMLElement>('#plan-error')!;
  const update = () => {
    const p = readForm(form);
    const doctor = p.condition === 'kidney' || p.condition === 'heart';
    form.querySelector<HTMLElement>('.doctor')!.hidden = !doctor;
    if (!validProfile(p)) {
      error.textContent = 'Нас 4–110, жин 10–250 кг, өндөр 90–230 см байна.';
      error.hidden = false;
      return null;
    }
    error.hidden = true;
    writeProfile(p);
    const plan = calcPlan(p);
    form.querySelector('#plan-l')!.textContent = liters(plan.ml);
    form.querySelector('#plan-kind')!.textContent = plan.mode === 'limit' ? 'өдөрт хамгийн ихдээ' : 'өдөрт';
    form.querySelector('#plan-how')!.textContent = plan.how;
    return plan;
  };
  form.addEventListener('input', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const plan = update();
    if (!plan) return;
    const result = save({ ...state, goal: plan.ml, mode: plan.mode });
    if (result !== 'saved') { error.textContent = saveMessage[result]; error.hidden = false; reload(); return; }
    reload();
    render();
    document.querySelector('#plan-saved')!.textContent = `Хадгаллаа: өдөрт ${liters(plan.ml)} л`;
  });
}

function addDrink(ml: number) {
  const entry: WaterEntry = { id: crypto.randomUUID(), amount: ml, type: 'drink', at: new Date().toISOString() };
  const result = save({ ...state, events: [...state.events, entry] });
  reload();
  if (result !== 'saved') { storageError = saveMessage[result]; render(); return; }
  undoId = entry.id;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoId = null; document.querySelector<HTMLElement>('#undo-line')?.toggleAttribute('hidden', true); }, 10_000);
  render();
}

function undo() {
  if (!undoId) return;
  const id = undoId;
  undoId = null;
  const result = save({ ...state, events: state.events.filter(e => e.id !== id) });
  reload();
  if (result !== 'saved') storageError = saveMessage[result];
  render();
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

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

function chartWidth(): number {
  const gutter = window.innerWidth <= 760 ? 20 : 40;
  return Math.round(Math.min(1000, Math.max(300, window.innerWidth - gutter * 2)));
}

function weekSection(): string {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6)).map(key => ({ key, drink: drankOn(state.events, key) }));
  const total = days.reduce((sum, day) => sum + day.drink, 0);
  // Draw at the real content width so text stays at its CSS size on phones.
  const W = chartWidth(), H = 220, left = 40, right = 8, top = 18, bottom = 40;
  const plotW = W - left - right, plotH = H - top - bottom;
  const peak = Math.max(state.goal, ...days.map(day => day.drink)) * 1.1;
  const step = niceStep(peak);
  const yMax = Math.ceil(peak / step) * step;
  const y = (value: number) => top + plotH - (value / yMax) * plotH;
  const slot = plotW / 7, barW = Math.min(24, slot * 0.5);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
  const goalLabel = state.mode === 'goal' ? 'Зорилт' : 'Хязгаар';
  const grid = ticks.map(t => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('');
  const bars = days.map((day, i) => {
    const cx = left + slot * i + slot / 2;
    const h = (day.drink / yMax) * plotH;
    const date = new Date(`${day.key}T12:00`);
    const isToday = day.key === today;
    return `<g class="day${isToday ? ' selected' : ''}">
      ${h > 0 ? `<path class="bar" d="${barPath(cx - barW / 2, y(day.drink), barW, h)}"/>` : ''}
      ${isToday && day.drink > 0 ? `<text class="value" x="${cx}" y="${y(day.drink) - 8}" text-anchor="middle">${number(day.drink)}</text>` : ''}
      <text class="axis${isToday ? ' strong' : ''}" x="${cx}" y="${H - bottom + 18}" text-anchor="middle">${WEEKDAYS[date.getDay()]}</text>
      <text class="axis" x="${cx}" y="${H - bottom + 33}" text-anchor="middle">${date.getDate()}</text>
      <rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH + bottom}" tabindex="0" data-day="${day.key}" data-cx="${cx / W}" data-cy="${y(day.drink) / H}" aria-label="${dateLabel(day.key)}: ${number(day.drink)} мл"/>
    </g>`;
  }).join('');
  return `<section class="week" aria-labelledby="week-title">
    <div class="section-heading"><h2 id="week-title">Сүүлийн 7 хоног</h2><span>Өдөрт дунджаар ${number(Math.round(total / 7))} мл</span></div>
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сүүлийн 7 хоногийн уусан ус, өдөр бүрээр">
        ${grid}
        <line class="goal-line" x1="${left}" x2="${W - right}" y1="${y(state.goal)}" y2="${y(state.goal)}"/>
        <text class="goal-label" x="${W - right}" y="${y(state.goal) - 6}" text-anchor="end">${goalLabel} ${number(state.goal)}</text>
        ${bars}
      </svg>
      <div class="chart-tip" role="status" hidden></div>
    </div>
  </section>`;
}

function bindChart() {
  const chart = document.querySelector<HTMLDivElement>('.chart');
  const tip = chart?.querySelector<HTMLDivElement>('.chart-tip');
  if (!chart || !tip) return;
  chart.querySelectorAll<SVGRectElement>('.hit').forEach(hit => {
    const key = hit.dataset.day!;
    const show = () => {
      tip.innerHTML = `<span>${dateLabel(key)}</span><strong>${number(drankOn(state.events, key))} мл</strong>`;
      tip.style.left = `${Number(hit.dataset.cx) * 100}%`;
      tip.style.top = `${Number(hit.dataset.cy) * 100}%`;
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
  });
}

function render() {
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="Дусал нүүр">${dropIcon}Дусал</a>${siteNav('home')}</div></header><main id="main" tabindex="-1"><p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p><div class="home-grid"><div class="home-left">${bottleSection(state.events)}${todaySection()}</div>${planSection(readProfile())}</div>${weekSection()}<footer><span>Дусал</span><p><a href="/entries.html">Бүх бүртгэл</a> · <a href="/settings.html">Нөөц ба тохиргоо</a></p></footer></main>`;
  document.querySelectorAll<HTMLButtonElement>('[data-drink]').forEach(b => b.addEventListener('click', () => addDrink(Number(b.dataset.drink))));
  document.querySelector('#undo')?.addEventListener('click', undo);
  bindPlan();
  bindChart();
  bindBottle(render);
}

window.addEventListener('storage', event => {
  if ([STORAGE_KEY, BOTTLE_KEY, PROFILE_KEY, null].includes(event.key)) { reload(); render(); }
});
let lastWidth = chartWidth();
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (chartWidth() !== lastWidth) { lastWidth = chartWidth(); render(); } }, 150);
});
// Roll over to the new day at midnight without a reload.
setInterval(() => { if (dayKey() !== today) { today = dayKey(); render(); } }, 60_000);
reload();
render();
