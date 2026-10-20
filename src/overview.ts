import { DevicePanel, bindDevicePanel } from './components/DevicePanel';
import { deviceSummary, devices } from './devices';
import { SyncStatus, bindSyncStatus } from './components/SyncStatus';
import './style.css';
import './shell.css';
import './overview.css';
import './pwa';
import { dayKey, defaults, type AppState, type WaterEntry } from './data';
import { load, save, saveMessage, onExternalChange } from './storage';
import { BOTTLE_KEY, bottleSection, bottleStatus, bindBottle } from './bottle';
import { siteNav } from './nav';
import { CONDITIONS, PROFILE_KEY, calcPlan, readProfile, validProfile, writeProfile, type Profile } from './plan';
import { askAi, checkAi } from './api';
import { dateLabel, escape, number } from './format';
import { icon } from './components/Icon';

// 2000 → "2", 2150 → "2.15", 2500 → "2.5" (the old regex left "2.", which a number input rejects).
const liters = (ml: number) => String(Number((ml / 1000).toFixed(2)));
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let today = dayKey();
let undoId: string | null = null;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

async function reload() {
  const loaded = await load();
  state = loaded.state;
  storageError = loaded.error;
}

function amountOn(events: readonly WaterEntry[], key: string, type: 'drink' | 'spill'): number {
  return events.reduce((sum, e) => (e.type === type && dayKey(new Date(e.at)) === key ? sum + e.amount : sum), 0);
}

// Only "drink" counts toward the daily total.
const drankOn = (events: readonly WaterEntry[], key: string) => amountOn(events, key, 'drink');

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

// Centre of the page: greeting, the quick drink chips (kept above the fold), then the bottle on its base.
function stageSection(): string {
  const drink = drankOn(state.events, today);
  const { text, tone } = status(drink);
  return `<section class="stage" aria-labelledby="stage-title">
    <p class="stage-chip"><i aria-hidden="true"></i>${escape(deviceSummary())}</p>
    <h1 id="stage-title">${greeting()}</h1>
    <p class="stage-sub">Өнөөдөр <b>${number(drink)}</b> / ${number(state.goal)} мл уусан · <span class="${tone}">${tone === 'over' ? '! ' : ''}${text}</span></p>
    <p class="stage-sub" data-device-note ${devices.cache.selectedId ? '' : 'hidden'}>Суурин дээрх савнаас уусныг суурь өөрөө тоолж бүртгэнэ; асгасан бол бүртгэлээс «Асгасан» болгоно. Доорх товчоор өөр аяга, савнаас уусан усаа нэмнэ.</p>
    <div class="drink-chips" role="group" aria-label="Уусан ус нэмэх">${[150, 250, 500].map(ml => `<button type="button" class="drink-chip" data-drink="${ml}"><span aria-hidden="true">+</span>${ml} мл</button>`).join('')}</div>
    <p class="undo-line" id="undo-line" role="status" ${undoId ? '' : 'hidden'}>Нэмлээ <button type="button" class="text-button" id="undo">Буцаах</button></p>
    ${bottleSection(state.events)}
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
    { name: 'Савандаа', value: bottle.left === null ? '?' : `${number(bottle.left)} мл`, h: pct(bottle.frac), cls: 'b-bottle' },
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

// Compare the suggestion with the saved goal so it's clear what saving would change.
function versusGoal(d: { ml: number; mode: 'goal' | 'limit' }): { text: string; same: boolean } {
  const label = state.mode === 'limit' ? 'хязгаар' : 'зорилт';
  if (d.ml === state.goal && d.mode === state.mode) return { text: `✓ Энэ таны одоогийн ${label}`, same: true };
  const diff = d.ml - state.goal;
  return { text: `Одоогийн ${label}: ${number(state.goal)} мл${diff ? ` · ${diff > 0 ? '+' : '−'}${number(Math.abs(diff))} мл` : ''}`, same: false };
}

function planSection(p: Profile): string {
  // Keep the user's own edits across re-renders; recompute only after a source or profile change.
  if (!draft && source !== 'ai') draft = suggestion(p);
  const d = draft;
  const vs = d && versusGoal(d);
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
        <p class="plan-vs${vs!.same ? ' same' : ''}" id="plan-vs">${vs!.text}</p>
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
      <button type="submit" class="primary-button plan-save" ${d && !vs!.same ? '' : 'disabled'}>${vs?.same ? 'Зорилт болгосон' : 'Үүнийг зорилт болгох'}</button>
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
    const vs = versusGoal(draft!);
    const line = form.querySelector<HTMLElement>('#plan-vs')!;
    line.textContent = vs.text;
    line.classList.toggle('same', vs.same);
    const button = form.querySelector<HTMLButtonElement>('.plan-save')!;
    button.disabled = vs.same;
    button.textContent = vs.same ? 'Зорилт болгосон' : 'Үүнийг зорилт болгох';
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!draft) return;
    const result = await save({ ...state, goal: draft!.ml, mode: draft!.mode });
    if (result !== 'saved') { showError(saveMessage[result]); await reload(); return; }
    await reload();
    render();
    document.querySelector('#plan-saved')!.textContent = `Хадгаллаа: ${draft!.mode === 'limit' ? 'хамгийн ихдээ' : 'өдөрт'} ${liters(draft!.ml)} л`;
  });
}

async function addDrink(ml: number) {
  const entry: WaterEntry = { id: crypto.randomUUID(), amount: ml, type: 'drink', at: new Date().toISOString() };
  const result = await save({ ...state, events: [...state.events, entry] });
  await reload();
  if (result !== 'saved') { storageError = saveMessage[result]; render(); return; }
  undoId = entry.id;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoId = null; document.querySelector<HTMLElement>('#undo-line')?.toggleAttribute('hidden', true); }, 10_000);
  render();
}

async function undo() {
  if (!undoId) return;
  const id = undoId;
  undoId = null;
  const result = await save({ ...state, events: state.events.filter(e => e.id !== id) });
  await reload();
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

// Width inside main.home's gutter and the glass card's padding and border.
function chartWidth(): number {
  const inset = window.innerWidth <= 560 ? 34 : 54;
  return Math.round(Math.max(260, Math.min(1200, window.innerWidth - 40) - inset));
}

function weekSection(): string {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
    .map(key => ({ key, drink: amountOn(state.events, key, 'drink'), spill: amountOn(state.events, key, 'spill') }));
  const avg = (type: 'drink' | 'spill') => number(Math.round(days.reduce((sum, day) => sum + day[type], 0) / 7));
  // Draw at the real content width so text stays at its CSS size on phones.
  const W = chartWidth(), H = 230, left = 40, right = 8, top = 18, bottom = 44;
  const plotW = W - left - right, plotH = H - top - bottom;
  const peak = Math.max(state.goal, ...days.map(day => Math.max(day.drink, day.spill))) * 1.1;
  const step = niceStep(peak);
  const yMax = Math.ceil(peak / step) * step;
  const y = (value: number) => top + plotH - (value / yMax) * plotH;
  const slot = plotW / 7, barW = Math.min(20, slot * 0.28), gap = 4;
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
  const goalLabel = state.mode === 'goal' ? 'Зорилт' : 'Хязгаар';
  const grid = ticks.map(t => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('');
  const bar = (type: 'drink' | 'spill', x: number, value: number) =>
    value > 0 ? `<path class="bar ${type}" d="${barPath(x, y(value), barW, (value / yMax) * plotH)}"/>` : '';
  const bars = days.map((day, i) => {
    const cx = left + slot * i + slot / 2;
    const date = new Date(`${day.key}T12:00`);
    const isToday = day.key === today;
    return `<g class="day">
      <rect class="band" x="${left + slot * i + 4}" y="${top - 8}" width="${slot - 8}" height="${plotH + 8}" rx="10"/>
      ${bar('drink', cx - gap / 2 - barW, day.drink)}
      ${bar('spill', cx + gap / 2, day.spill)}
      <text class="axis${isToday ? ' strong' : ''}" x="${cx}" y="${H - bottom + 20}" text-anchor="middle">${WEEKDAYS[date.getDay()]}</text>
      <text class="axis" x="${cx}" y="${H - bottom + 36}" text-anchor="middle">${date.getDate()}</text>
      <rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH + bottom}" tabindex="0" data-day="${day.key}" data-cx="${cx / W}" data-cy="${(y(Math.max(day.drink, day.spill)) - 8) / H}" aria-label="${dateLabel(day.key)}: уусан ${number(day.drink)} мл, асгасан ${number(day.spill)} мл"/>
    </g>`;
  }).join('');
  return `<section class="week" aria-labelledby="week-title">
    <div class="week-head">
      <div>
        <p class="panel-label">Сүүлийн 7 хоног</p>
        <h2 id="week-title">Уусан ба асгасан ус</h2>
        <p class="week-avg">Өдөрт дунджаар ${avg('drink')} мл уусан · ${avg('spill')} мл асгасан</p>
      </div>
      <ul class="legend" aria-label="Тайлбар">
        <li><i class="key drink"></i>Уусан</li>
        <li><i class="key spill"></i>Асгасан</li>
      </ul>
    </div>
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сүүлийн 7 хоногийн уусан болон асгасан ус, өдөр бүрээр">
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
      const row = (type: 'drink' | 'spill', label: string) =>
        `<span class="tip-row"><i class="key ${type}"></i><strong>${number(amountOn(state.events, key, type))} мл</strong>${label}</span>`;
      tip.innerHTML = `<span class="tip-date">${dateLabel(key)}</span>${row('drink', 'Уусан')}${row('spill', 'Асгасан')}`;
      tip.style.top = `${Number(hit.dataset.cy) * 100}%`;
      tip.hidden = false;
      // Keep the tooltip inside the card near the edge days.
      const half = tip.offsetWidth / 2, width = chart.offsetWidth;
      tip.style.left = `${Math.min(Math.max(Number(hit.dataset.cx) * width, half), width - half)}px`;
    };
    const hide = () => { tip.hidden = true; };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
  });
}

function refreshMeasurement(): void {
  const bottle = document.querySelector('.bottle-card');
  if (bottle) { bottle.outerHTML = bottleSection(state.events); bindBottle(render); }
  const metrics = document.querySelector('.metrics');
  if (metrics) metrics.outerHTML = metricsSection();
  document.querySelector<HTMLElement>('[data-device-note]')?.toggleAttribute('hidden', !devices.cache.selectedId);
  const chip = document.querySelector('.stage-chip');
  if (chip) chip.textContent = deviceSummary();
}

function render() {
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><main id="main" class="home" tabindex="-1">
    <div class="app-shell">
      <header class="app-top"><a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${icon('drop')}</span>Дусал</a>${siteNav('home')}<span class="app-date">${dateLabel(today)}</span></header>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      ${SyncStatus()}
      ${DevicePanel()}
      <div class="app-body">${stageSection()}<aside class="side">${planSection(readProfile())}${metricsSection()}</aside></div>
    </div>
    <div class="glass-card">${weekSection()}</div>
    <footer class="home-footer"><span>Дусал</span><p><a href="/entries.html">Бүх бүртгэл</a> · <a href="/settings.html">Нөөц ба тохиргоо</a></p></footer>
  </main>`;
  document.querySelectorAll<HTMLButtonElement>('[data-drink]').forEach(b => b.addEventListener('click', () => addDrink(Number(b.dataset.drink))));
  document.querySelector('#undo')?.addEventListener('click', undo);
  bindPlan();
  bindChart();
  bindBottle(render);
  bindDevicePanel(refreshMeasurement);
  bindSyncStatus();
}

onExternalChange(async () => { await reload(); render(); });
window.addEventListener('storage', event => {
  if ([BOTTLE_KEY, PROFILE_KEY, null].includes(event.key)) render();
});
let lastWidth = chartWidth();
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (chartWidth() !== lastWidth) { lastWidth = chartWidth(); render(); } }, 150);
});
// Roll over to the new day at midnight without a reload.
setInterval(() => { if (dayKey() !== today) { today = dayKey(); render(); } }, 60_000);
void reload().then(render);
checkAi().then(ready => { aiReady = ready; if (source === 'ai') render(); });
