import './style.css';
import './overview.css';
import './pwa';
import { STORAGE_KEY, dayKey, type AppState, type WaterEntry } from './data';
import { load, save, saveMessage } from './storage';
import { BOTTLE_KEY, bottleSection, bottleStatus, bindBottle } from './bottle';
import { siteNav } from './nav';
import { CONDITIONS, PROFILE_KEY, calcPlan, readProfile, validProfile, writeProfile, type Profile } from './plan';
import { askAi, checkAi } from './api';

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

function greeting(): string {
  const h = new Date().getHours();
  return h >= 5 && h < 11 ? 'Өглөөний мэнд!' : h >= 11 && h < 18 ? 'Өдрийн мэнд!' : 'Оройн мэнд!';
}

// Centre of the page: greeting, the bottle on its base, and the quick drink chips.
function stageSection(): string {
  const drink = drankOn(state.events, today);
  const { text, tone } = status(drink);
  return `<section class="stage" aria-labelledby="stage-title">
    <p class="stage-chip"><i aria-hidden="true"></i>Гараар бүртгэж байна</p>
    <h1 id="stage-title">${greeting()}</h1>
    <p class="stage-sub">Өнөөдөр <b>${number(drink)}</b> / ${number(state.goal)} мл уусан · <span class="${tone}">${tone === 'over' ? '! ' : ''}${text}</span></p>
    ${bottleSection(state.events)}
    <div class="drink-chips" role="group" aria-label="Уусан ус нэмэх">${[150, 250, 500].map(ml => `<button type="button" class="drink-chip" data-drink="${ml}"><span aria-hidden="true">+</span>${ml} мл</button>`).join('')}</div>
    <p class="undo-line" id="undo-line" role="status" ${undoId ? '' : 'hidden'}>Нэмлээ <button type="button" class="text-button" id="undo">Буцаах</button></p>
  </section>`;
}

// Four vertical bars summarising today, in the side panel.
function metricsSection(): string {
  const drink = drankOn(state.events, today);
  const bottle = bottleStatus(state.events);
  const week = Array.from({ length: 7 }, (_, i) => drankOn(state.events, shiftDay(today, -i))).reduce((a, b) => a + b, 0) / 7;
  const pct = (n: number) => Math.max(4, Math.min(100, Math.round(n * 100)));
  const bars = [
    { name: 'Уусан', value: `${Math.round((drink / state.goal) * 100)}%`, h: pct(drink / state.goal), cls: 'b-drink' },
    { name: 'Савандаа', value: `${number(bottle.left)} мл`, h: pct(bottle.frac), cls: 'b-bottle' },
    { name: 'Үлдсэн', value: `${number(Math.max(0, state.goal - drink))} мл`, h: pct(Math.max(0, state.goal - drink) / state.goal), cls: 'b-left' },
    { name: '7 хоног', value: `${number(Math.round(week))} мл`, h: pct(week / state.goal), cls: 'b-week' },
  ];
  return `<section class="metrics" aria-labelledby="metrics-title">
    <h2 id="metrics-title" class="panel-label">Өнөөдөр</h2>
    <div class="bars">${bars.map(b => `<div class="bar-col"><span class="bar-name">${b.name}</span><div class="bar-track"><i class="${b.cls}" style="height:${b.h}%"></i></div><span class="bar-val">${b.value}</span></div>`).join('')}</div>
  </section>`;
}

type Source = 'calc' | 'doctor' | 'ai';
const SOURCES: Record<Source, string> = { calc: 'Тооцоолох', doctor: 'Эмчийн заавар', ai: 'AI зөвлөгөө' };
let source: Source = 'calc';
// The amount shown in the editable result; the user may adjust it before saving.
let draft: { ml: number; mode: 'goal' | 'limit'; how: string; warning: string } | null = null;
// AI tab: nothing is shown until the user asks; aiReady is null until /api/health answers.
let aiAsking = false;
let aiError = '';
let aiReady: boolean | null = null;

function suggestion(p: Profile): { ml: number; mode: 'goal' | 'limit'; how: string; warning: string } {
  if (source === 'doctor') return { ml: p.doctorLimit, mode: p.doctorMode, how: 'Эмчийн заасан хэмжээ', warning: '' };
  const plan = calcPlan(p);
  return { ...plan, warning: plan.mode === 'limit' ? 'Хязгаарыг эмч тогтооно. «Эмчийн заавар» хэсэгт оруулна уу.' : '' };
}

function planSection(p: Profile): string {
  // Keep the user's own edits across re-renders; recompute only after a source or profile change.
  if (!draft && source !== 'ai') draft = suggestion(p);
  const d = draft;
  const aiOff = aiReady === false;
  const aiControls = source !== 'ai' ? '' : `<div class="ai-row wide">
          <label class="visually-hidden" for="plan-note">Нэмэлт мэдээлэл</label>
          <input id="plan-note" name="note" type="text" maxlength="200" placeholder="Жишээ: гүйдэг, халуун" value="${escape(aiNote)}"/>
          <button type="button" class="ai-button" id="ask-ai" ${aiAsking || aiOff ? 'disabled' : ''}>${aiAsking ? 'Бодож байна…' : d ? 'Дахин асуух' : 'AI-аас асуух'}</button>
        </div>`;
  const result = d ? `<div class="plan-result" aria-live="polite">
        ${source === 'ai' ? '<p class="ai-chip">AI-ийн зөвлөгөө</p>' : ''}
        <div class="plan-amount">
          <button type="button" class="step" id="plan-minus" aria-label="50 мл хасах">−</button>
          <label class="visually-hidden" for="plan-l">Өдрийн хэмжээ, литр</label>
          <input id="plan-l" type="number" inputmode="decimal" min="0.5" max="4" step="0.05" value="${liters(d.ml)}"/>
          <span>л</span>
          <button type="button" class="step" id="plan-plus" aria-label="50 мл нэмэх">+</button>
        </div>
        <p class="plan-kind" id="plan-kind">${d.mode === 'limit' ? 'өдөрт хамгийн ихдээ' : 'өдөрт дор хаяж'}</p>
        <p class="plan-how" id="plan-how">${escape(d.how)}</p>
        <p class="plan-warning" id="plan-warning" ${d.warning ? '' : 'hidden'}>${escape(d.warning)}</p>
      </div>` : `<div class="plan-result plan-empty" aria-live="polite">${aiAsking ? '<p><strong>AI бодож байна…</strong></p><p>Хэдэн секунд хүлээнэ үү.</p>' : aiOff ? '<p><strong>AI одоогоор идэвхжээгүй байна.</strong></p><p>«Тооцоолох» эсвэл «Эмчийн заавар»-ыг ашиглаарай.</p>' : '<p><strong>«AI-аас асуух» дарна уу.</strong></p><p>AI өдөрт уух хэмжээг гаргаж, шалтгааныг тайлбарлана.</p>'}</div>`;
  return `<section class="plan-card" aria-labelledby="plan-title">
    <h2 id="plan-title">Миний өдрийн хэмжээ</h2>
    <div class="source-tabs" role="radiogroup" aria-label="Хэрхэн гаргах вэ">${(Object.keys(SOURCES) as Source[]).map(s => `<button type="button" role="radio" aria-checked="${s === source}" data-source="${s}">${SOURCES[s]}</button>`).join('')}</div>
    <form id="plan-form" novalidate>
      <div class="plan-body">
      <div class="plan-fields" ${source === 'doctor' ? 'hidden' : ''}>
        <label>Нас<input id="plan-age" name="age" type="number" inputmode="numeric" min="4" max="110" value="${p.age}"/></label>
        <label>Жин, кг<input id="plan-weight" name="weight" type="number" inputmode="numeric" min="10" max="250" value="${p.weight}"/></label>
        <label>Өндөр, см<input id="plan-height" name="height" type="number" inputmode="numeric" min="90" max="230" value="${p.height}"/></label>
        <label class="wide">Онош<select id="plan-condition" name="condition">${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${p.condition === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${aiControls}
      </div>
      <div class="plan-fields" ${source === 'doctor' ? '' : 'hidden'}>
        <label>Хэмжээ, мл<input id="plan-doctor" name="doctorLimit" type="number" inputmode="numeric" min="500" max="4000" value="${p.doctorLimit}"/></label>
        <label class="span2">Эмч юу гэж заасан бэ?<select id="plan-doctor-mode" name="doctorMode"><option value="goal" ${p.doctorMode === 'goal' ? 'selected' : ''}>Дор хаяж ийм хэмжээ уух</option><option value="limit" ${p.doctorMode === 'limit' ? 'selected' : ''}>Үүнээс хэтрүүлэхгүй</option></select></label>
        <p class="doctor-hint wide">Эмчийн бичсэн хэмжээг оруулна. Бөөр, зүрхний дутагдалтай бол заавал эмчийн хязгаарыг ашиглана.</p>
      </div>
      </div>
      ${result}
      <p class="form-error" id="plan-error" role="alert" ${aiError ? '' : 'hidden'}>${escape(aiError)}</p>
      <button type="submit" class="primary-button plan-save" ${d ? '' : 'disabled'}>Үүнийг зорилт болгох</button>
      <p class="plan-saved" id="plan-saved" role="status"></p>
    </form>
    <p class="plan-note">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана.</p>
  </section>`;
}

let aiNote = '';

function readForm(form: HTMLFormElement): Partial<Profile> {
  const d = new FormData(form);
  const n = (k: string) => Number(d.get(k));
  return { age: n('age'), weight: n('weight'), height: n('height'), condition: String(d.get('condition')) as Profile['condition'], doctorLimit: n('doctorLimit'), doctorMode: d.get('doctorMode') === 'goal' ? 'goal' : 'limit' };
}

function bindPlan() {
  const form = document.querySelector<HTMLFormElement>('#plan-form')!;
  const error = form.querySelector<HTMLElement>('#plan-error')!;
  const amount = form.querySelector<HTMLInputElement>('#plan-l');
  const showError = (text: string) => { error.textContent = text; error.hidden = !text; };
  const show = () => {
    if (!draft || !amount) return;
    form.querySelector('#plan-kind')!.textContent = draft!.mode === 'limit' ? 'өдөрт хамгийн ихдээ' : 'өдөрт дор хаяж';
    form.querySelector('#plan-how')!.textContent = draft!.how;
    const warning = form.querySelector<HTMLElement>('#plan-warning')!;
    warning.textContent = draft!.warning;
    warning.hidden = !draft!.warning;
    amount.value = liters(draft!.ml);
  };
  document.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b => b.addEventListener('click', () => {
    source = b.dataset.source as Source;
    draft = null;
    aiError = '';
    render();
  }));
  // Profile edits recompute the suggestion (AI waits for its button).
  form.addEventListener('input', event => {
    const target = event.target as HTMLElement;
    if (target === amount) return;
    if (target.id === 'plan-note') { aiNote = (target as HTMLTextAreaElement).value; return; }
    const p = readForm(form);
    if (!validProfile(p)) { showError(source === 'doctor' ? 'Хэмжээ 500–4,000 мл байна.' : 'Нас 4–110, жин 10–250 кг, өндөр 90–230 см байна.'); return; }
    showError('');
    writeProfile(p);
    if (source !== 'ai') { draft = suggestion(p); show(); }
  });
  const nudge = (delta: number) => {
    const ml = Math.round(Math.min(4000, Math.max(500, draft!.ml + delta)) / 50) * 50;
    draft = { ...draft!, ml, how: draft!.how.includes('Өөрчилсөн') ? draft!.how : `${draft!.how} · Өөрчилсөн` };
    show();
  };
  form.querySelector('#plan-minus')?.addEventListener('click', () => nudge(-50));
  form.querySelector('#plan-plus')?.addEventListener('click', () => nudge(50));
  amount?.addEventListener('change', () => {
    if (!draft) return;
    const ml = Math.round(Number(amount.value) * 1000 / 50) * 50;
    if (!Number.isFinite(ml) || ml < 500 || ml > 4000) { showError('Хэмжээ 0.5–4 литр байна.'); amount.value = liters(draft.ml); return; }
    showError('');
    nudge(ml - draft!.ml);
  });
  form.querySelector('#ask-ai')?.addEventListener('click', async () => {
    const p = readForm(form);
    if (!validProfile(p)) { showError('Нас 4–110, жин 10–250 кг, өндөр 90–230 см байна.'); return; }
    aiAsking = true;
    aiError = '';
    draft = null;
    render();
    try {
      const ai = await askAi({ age: p.age, weight: p.weight, height: p.height, condition: p.condition, note: aiNote });
      draft = { ml: ai.ml, mode: ai.mode, how: ai.reason, warning: ai.warning };
    } catch (err) {
      aiError = (err as Error).message;
    }
    aiAsking = false;
    if (source === 'ai') render();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!draft) return;
    const result = save({ ...state, goal: draft!.ml, mode: draft!.mode });
    if (result !== 'saved') { showError(saveMessage[result]); reload(); return; }
    reload();
    render();
    document.querySelector('#plan-saved')!.textContent = `Хадгаллаа: ${draft!.mode === 'limit' ? 'хамгийн ихдээ' : 'өдөрт'} ${liters(draft!.ml)} л`;
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
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><main id="main" class="home" tabindex="-1">
    <div class="app-shell">
      <header class="app-top"><a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${dropIcon}</span>Дусал</a>${siteNav('home')}<span class="app-date">${dateLabel(today)}</span></header>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      <div class="app-body"><aside class="side">${planSection(readProfile())}${metricsSection()}</aside>${stageSection()}</div>
    </div>
    <div class="glass-card">${weekSection()}</div>
    <footer class="home-footer"><span>Дусал</span><p><a href="/entries.html">Бүх бүртгэл</a> · <a href="/settings.html">Нөөц ба тохиргоо</a></p></footer>
  </main>`;
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
checkAi().then(ready => { aiReady = ready; if (source === 'ai') render(); });
