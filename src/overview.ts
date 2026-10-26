import './style.css';
import './shell.css';
import './overview.css';
import './pwa';
import { dayKey, defaults, type AppState, type WaterEntry } from './data';
import { load, save, saveMessage, onExternalChange } from './storage';
import { buddySection, drinkTiles, streakParts, bindStreakCalendar, bindHydration, deviceDrop, thirstSection } from './hydration';
import { pace } from './pace';
import { startSync } from './sync';
import { startDevices } from './devices';
import { pushWidget } from './widget';
import { siteNav } from './nav';
import { CONDITIONS, PROFILE_KEY, calcPlan, readProfile, validProfile, writeProfile, type Profile } from './plan';
import { askAi, checkAi } from './api';
import { guardPlan } from '../shared/plan';
import { needsOnboarding, showOnboarding } from './onboarding';
import { bindSchedule, scheduleChip, startReminders } from './schedule';
import { startAppIcon } from './app-icon';
import { dateLabel, escape, number } from './format';
import { brandMark, mdIcon } from './components/Icon';

// 2000 → "2", 2150 → "2.15", 2500 → "2.5" (the old regex left "2.", which a number input rejects).
const liters = (ml: number) => String(Number((ml / 1000).toFixed(2)));
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let storageError = '';
let today = dayKey();
let undoId: string | null = null;
let undoAmount = 0;
// Today's drinks removed by the demo reset, kept so «Буцаах» can put them back.
let undoReset: WaterEntry[] | null = null;
let undoTimer: ReturnType<typeof setTimeout> | undefined;
// Secondary panels stay folded so the home shows only today's water; remember if the user opened them.
let planOpen = false;

async function reload() {
  const loaded = await load();
  state = loaded.state;
  storageError = loaded.error;
}

// Sips the base counted today, so a sync that brings in a new one can show it arriving.
let deviceSeen: Set<string> | null = null;
function newDeviceSips(): number {
  const sips = state.events.filter(e => e.deviceId && e.type === 'drink' && dayKey(new Date(e.at)) === today);
  const fresh = deviceSeen ? sips.filter(e => !deviceSeen!.has(e.id)) : [];
  deviceSeen = new Set(sips.map(e => e.id));
  return fresh.reduce((sum, e) => sum + e.amount, 0);
}

function amountOn(events: readonly WaterEntry[], key: string, type: 'drink' | 'spill'): number {
  return events.reduce((sum, e) => (e.type === type && dayKey(new Date(e.at)) === key ? sum + e.amount : sum), 0);
}

// Only "drink" counts toward the daily total.
const drankOn = (events: readonly WaterEntry[], key: string) => amountOn(events, key, 'drink');

// Server sync and the bottle picker, folded into one line above the stage.
type Source = 'calc' | 'doctor' | 'ai';
const SOURCES: Record<Source, string> = { calc: 'Тооцоолсон', doctor: 'Эмчийн заавар', ai: 'AI зөвлөгөө' };
type Draft = { ml: number; mode: 'goal' | 'limit'; how: string; warning: string };
// All three suggestions sit on one screen; `source` is the one picked, and `draft` its amount,
// which the user may adjust before saving.
let source: Source = 'calc';
let draft: Draft | null = null;
// The AI answer is kept apart so picking another option and coming back doesn't lose it.
let aiPlan: Draft | null = null;
// aiReady is null until /api/health answers.
let aiAsking = false;
let aiError = '';
let aiReady: boolean | null = null;

const kindLabel = (mode: 'goal' | 'limit') => (mode === 'limit' ? 'хамгийн ихдээ' : 'дор хаяж');

function suggestion(p: Profile, s: Source): Draft | null {
  if (s === 'ai') return aiPlan;
  if (s === 'doctor') return { ml: p.doctorLimit, mode: p.doctorMode, how: 'Эмчийн заасан хэмжээ', warning: '' };
  const plan = calcPlan(p);
  const warning = plan.mode === 'limit' ? 'Хязгаарыг эмч тогтооно. «Эмчийн заавар»-т оруулна уу.'
    : p.condition === 'other' ? 'Таны оношид тохирох хэмжээг эмчээсээ асуугаарай.' : '';
  return { ...plan, warning };
}

// Compare the suggestion with the saved goal so it's clear what saving would change.
function versusGoal(d: { ml: number; mode: 'goal' | 'limit' }): { text: string; same: boolean } {
  const label = state.mode === 'limit' ? 'хязгаар' : 'зорилт';
  if (d.ml === state.goal && d.mode === state.mode) return { text: `${mdIcon('check')} Энэ таны одоогийн ${label}`, same: true };
  const diff = d.ml - state.goal;
  return { text: `Одоогийн ${label}: ${number(state.goal)} мл${diff ? ` · ${diff > 0 ? '+' : '−'}${number(Math.abs(diff))} мл` : ''}`, same: false };
}

// One card per source; AI stays unselectable until it has answered.
function optionCard(s: Source, p: Profile): string {
  const d = suggestion(p, s);
  const empty = aiAsking ? 'Бодож байна…' : aiReady === false ? 'Идэвхгүй' : aiError ? 'Хариу ирсэнгүй'
    : p.condition === 'other' && p.conditionNote.trim().length < 3 ? 'Оношоо бичнэ үү' : 'Асуугаагүй';
  return `<button type="button" class="plan-option" role="radio" aria-checked="${s === source}" data-source="${s}" ${d ? '' : 'disabled'} ${s === 'doctor' && p.condition === 'none' ? 'hidden' : ''}>
    <span class="opt-name">${SOURCES[s]}</span>
    ${d ? `<span class="opt-amount" data-opt-amount="${s}">${liters(d.ml)} л</span><span class="opt-kind" data-opt-kind="${s}">${kindLabel(d.mode)}</span>` : `<span class="opt-empty">${empty}</span>`}
  </button>`;
}

function planSection(p: Profile): string {
  // With no diagnosis there is no doctor's amount to pick, so its fields and card are hidden.
  const noDoctor = p.condition === 'none';
  if (noDoctor && source === 'doctor') { source = 'calc'; draft = null; }
  // Keep the user's own edits across re-renders; recompute only after a source or profile change.
  if (!draft) draft = suggestion(p, source);
  const d = draft;
  const vs = d && versusGoal(d);
  const aiOff = aiReady === false;
  const result = d ? `<div class="plan-result" aria-live="polite">
        <p class="plan-picked">${SOURCES[source]}</p>
        <div class="plan-amount">
          <button type="button" class="step" id="plan-minus" aria-label="50 мл хасах">−</button>
          <label class="visually-hidden" for="plan-l">Өдрийн хэмжээ, литр</label>
          <input id="plan-l" type="number" inputmode="decimal" min="0.5" max="4" step="0.05" value="${liters(d.ml)}"/>
          <span>л</span>
          <button type="button" class="step" id="plan-plus" aria-label="50 мл нэмэх">+</button>
        </div>
        <p class="plan-kind" id="plan-kind">өдөрт ${kindLabel(d.mode)}</p>
        <p class="plan-vs${vs!.same ? ' same' : ''}" id="plan-vs">${vs!.text}</p>
        <p class="plan-how" id="plan-how">${escape(d.how)}</p>
        <p class="plan-warning" id="plan-warning" ${d.warning ? '' : 'hidden'}>${escape(d.warning)}</p>
      </div>` : '';
  return `<section class="plan-card" aria-labelledby="plan-title">
    <h2 id="plan-title">Миний өдрийн хэмжээ</h2>
    <form id="plan-form" novalidate>
      <p class="plan-step">Таны мэдээлэл</p>
      <div class="plan-fields">
        <label>Нас<input id="plan-age" name="age" type="number" inputmode="numeric" min="4" max="110" value="${p.age}"/></label>
        <label>Жин, кг<input id="plan-weight" name="weight" type="number" inputmode="numeric" min="10" max="250" value="${p.weight}"/></label>
        <label>Өндөр, см<input id="plan-height" name="height" type="number" inputmode="numeric" min="90" max="230" value="${p.height}"/></label>
        <label class="wide">Онош<select id="plan-condition" name="condition">${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${p.condition === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${p.condition === 'other' ? `<label class="wide">Ямар онош вэ?<input id="plan-condition-note" name="conditionNote" type="text" maxlength="60" placeholder="Оношоо энд бичнэ үү" aria-describedby="plan-condition-hint" value="${escape(p.conditionNote)}"/>
          <small id="plan-condition-hint">${aiReady === false ? 'AI идэвхгүй байна. Энэ оношид тохирох хэмжээг эмчээсээ асуугаарай.' : 'Бичээд түр хүлээхэд AI таны оношийг харгалзан тооцно. «Тооцоолсон» хэмжээ өөрчлөгдөхгүй.'}</small></label>` : ''}
      </div>
      <div class="plan-doctor" ${noDoctor ? 'hidden' : ''}>
      <p class="plan-step">Эмчийн заавар <small>байвал</small></p>
      <div class="plan-fields">
        <label>Хэмжээ, мл<input id="plan-doctor" name="doctorLimit" type="number" inputmode="numeric" min="500" max="4000" value="${p.doctorLimit}"/></label>
        <label class="span2">Эмч юу гэж заасан бэ?<select id="plan-doctor-mode" name="doctorMode"><option value="goal" ${p.doctorMode === 'goal' ? 'selected' : ''}>Дор хаяж ийм хэмжээ уух</option><option value="limit" ${p.doctorMode === 'limit' ? 'selected' : ''}>Үүнээс хэтрүүлэхгүй</option></select></label>
      </div>
      </div>
      <p class="plan-step">AI-аас асуух <small>заавал биш</small></p>
      ${aiOff ? '<p class="ai-off">AI одоогоор идэвхжээгүй байна.</p>' : `<div class="ai-row">
        <label class="visually-hidden" for="plan-note">Нэмэлт мэдээлэл</label>
        <input id="plan-note" name="note" type="text" maxlength="200" placeholder="Жишээ: гүйдэг, халуун" value="${escape(aiNote)}"/>
        <button type="button" class="ai-button" id="ask-ai" ${aiAsking ? 'disabled' : ''}>${aiAsking ? 'Бодож байна…' : aiPlan ? 'Дахин асуух' : 'Асуух'}</button>
      </div>`}
      <p class="plan-step">Аль хэмжээг сонгох вэ?</p>
      <div class="plan-options" role="radiogroup" aria-label="Хэмжээ сонгох">${(Object.keys(SOURCES) as Source[]).map(s => optionCard(s, p)).join('')}</div>
      ${result}
      <p class="form-error" id="plan-error" role="alert" ${aiError ? '' : 'hidden'}>${escape(aiError)}</p>
      <button type="submit" class="primary-button plan-save" ${d && !vs!.same ? '' : 'disabled'}>${vs?.same ? 'Зорилт болгосон' : 'Үүнийг зорилт болгох'}</button>
      <p class="plan-saved" id="plan-saved" role="status"></p>
    </form>
    <p class="plan-note">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана.</p>
  </section>`;
}

let aiNote = '';

// Activity is chosen in onboarding and has no field here, so it comes from the saved profile;
// so does the condition note while its field is hidden.
function readForm(form: HTMLFormElement): Partial<Profile> {
  const d = new FormData(form);
  const n = (k: string) => Number(d.get(k));
  const saved = readProfile();
  return { age: n('age'), weight: n('weight'), height: n('height'), activity: saved.activity, condition: String(d.get('condition')) as Profile['condition'], doctorLimit: n('doctorLimit'), doctorMode: d.get('doctorMode') === 'goal' ? 'goal' : 'limit', conditionNote: d.has('conditionNote') ? String(d.get('conditionNote')) : saved.conditionNote };
}

// Each question gets a number, so an answer that comes back after a newer question (or a diagnosis change) is ignored.
let aiRequest = 0;
let autoAskTimer: ReturnType<typeof setTimeout> | undefined;

// Redraw without taking the cursor out of the field the user is typing in, scrolling the sheet
// or playing its opening animation again.
function renderKeepingFocus() {
  const field = document.activeElement as HTMLInputElement | null;
  const id = field?.id;
  const at = field?.type === 'text' ? [field.selectionStart, field.selectionEnd] : null;
  const scroll = document.querySelector('#plan-wrap')?.scrollTop ?? 0;
  render();
  const wrap = document.querySelector<HTMLElement>('#plan-wrap')!;
  wrap.classList.add('still');
  wrap.scrollTop = scroll;
  const again = id ? document.getElementById(id) as HTMLInputElement | null : null;
  again?.focus();
  if (again && at) again.setSelectionRange(at[0], at[1]);
}

async function askAiFor(p: Profile) {
  clearTimeout(autoAskTimer);
  const id = ++aiRequest;
  const picked = source;
  aiAsking = true;
  aiError = '';
  renderKeepingFocus();
  try {
    // Check the answer again: an older Worker may still pass the AI's number through for kidney/heart failure
    // or one far from the formula.
    const ai = guardPlan(p, await askAi({ age: p.age, weight: p.weight, height: p.height, activity: p.activity, condition: p.condition, doctorLimit: p.doctorLimit, conditionNote: p.conditionNote.trim(), note: aiNote }));
    if (id !== aiRequest) return;
    aiPlan = { ml: ai.ml, mode: ai.mode, how: ai.reason, warning: ai.warning };
    // If the user picked another card while the AI was thinking, keep their pick; the AI card still fills in.
    if (source === picked) { source = 'ai'; draft = aiPlan; }
  } catch (err) {
    if (id !== aiRequest) return;
    aiError = (err as Error).message;
  }
  aiAsking = false;
  renderKeepingFocus();
}

// Typing an unlisted diagnosis, or editing the profile while the AI's answer is picked, asks the AI again
// once typing pauses, so the amount below follows without pressing «Асуух».
function scheduleAsk(p: Profile) {
  clearTimeout(autoAskTimer);
  if (!aiReady || (p.condition === 'other' && p.conditionNote.trim().length < 3)) return;
  autoAskTimer = setTimeout(() => {
    const form = document.querySelector<HTMLFormElement>('#plan-form');
    const latest = form && readForm(form);
    if (latest && validProfile(latest)) void askAiFor(latest);
  }, 1200);
}

function bindPlan() {
  const form = document.querySelector<HTMLFormElement>('#plan-form')!;
  const error = form.querySelector<HTMLElement>('#plan-error')!;
  const amount = form.querySelector<HTMLInputElement>('#plan-l');
  const showError = (text: string) => { error.textContent = text; error.hidden = !text; };
  const show = () => {
    if (!draft || !amount) return;
    form.querySelector('#plan-kind')!.textContent = `өдөрт ${kindLabel(draft!.mode)}`;
    form.querySelector('#plan-how')!.textContent = draft!.how;
    const warning = form.querySelector<HTMLElement>('#plan-warning')!;
    warning.textContent = draft!.warning;
    warning.hidden = !draft!.warning;
    amount.value = liters(draft!.ml);
    const vs = versusGoal(draft!);
    const line = form.querySelector<HTMLElement>('#plan-vs')!;
    line.innerHTML = vs.text;
    line.classList.toggle('same', vs.same);
    const button = form.querySelector<HTMLButtonElement>('.plan-save')!;
    button.disabled = vs.same;
    button.textContent = vs.same ? 'Зорилт болгосон' : 'Үүнийг зорилт болгох';
  };
  // Profile and doctor fields feed the "calculated" and "doctor" cards live.
  const refreshCards = (p: Profile) => {
    (['calc', 'doctor'] as Source[]).forEach(s => {
      const d = suggestion(p, s)!;
      form.querySelector(`[data-opt-amount="${s}"]`)!.textContent = `${liters(d.ml)} л`;
      form.querySelector(`[data-opt-kind="${s}"]`)!.textContent = kindLabel(d.mode);
    });
  };
  form.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b => b.addEventListener('click', () => {
    clearTimeout(autoAskTimer);
    source = b.dataset.source as Source;
    draft = suggestion(readProfile(), source);
    aiError = '';
    render();
  }));
  // Profile edits recompute the suggestions; the AI is asked again after a pause (see scheduleAsk).
  form.addEventListener('input', event => {
    const target = event.target as HTMLElement;
    if (target === amount) return;
    if (target.id === 'plan-note') { aiNote = (target as HTMLInputElement).value; return; }
    const p = readForm(form);
    if (!validProfile(p)) { showError('Нас 4–110, жин 10–250 кг, өндөр 90–230 см, эмчийн хэмжээ 500–4,000 мл байна.'); return; }
    showError('');
    writeProfile(p);
    // Picking or clearing a diagnosis shows or hides the doctor's part, so redraw the form. The amount below
    // follows the new diagnosis, and an AI answer given for the old one is dropped (it may be unsafe now).
    if (target.id === 'plan-condition') {
      clearTimeout(autoAskTimer);
      aiRequest++;
      aiAsking = false;
      aiPlan = null;
      if (source === 'ai') source = 'calc';
      draft = suggestion(p, source);
      render();
      document.querySelector<HTMLElement>('#plan-condition-note')?.focus();
      return;
    }
    refreshCards(p);
    if (source !== 'ai') { draft = suggestion(p, source); show(); }
    if (source === 'ai' || target.id === 'plan-condition-note') scheduleAsk(p);
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
    await askAiFor(p);
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
  undoAmount = ml;
  undoReset = null;
  offerUndo();
  render();
}

// Demo helper: empty today's ring by removing today's drinks, so the fill can be shown again.
async function resetToday() {
  const removed = state.events.filter(e => e.type === 'drink' && dayKey(new Date(e.at)) === today);
  if (!removed.length) return;
  const ids = new Set(removed.map(e => e.id));
  const result = await save({ ...state, events: state.events.filter(e => !ids.has(e.id)) });
  await reload();
  if (result !== 'saved') { storageError = saveMessage[result]; render(); return; }
  undoReset = removed;
  undoId = null;
  offerUndo();
  render();
}

function offerUndo() {
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoId = null;
    undoReset = null;
    document.querySelector<HTMLElement>('#undo-line')?.toggleAttribute('hidden', true);
  }, 10_000);
}

async function undo() {
  let events: WaterEntry[];
  if (undoReset) {
    const known = new Set(state.events.map(e => e.id));
    events = [...state.events, ...undoReset.filter(e => !known.has(e.id))];
  } else if (undoId) {
    const id = undoId;
    events = state.events.filter(e => e.id !== id);
  } else return;
  undoId = null;
  undoReset = null;
  const result = await save({ ...state, events });
  await reload();
  if (result !== 'saved') storageError = saveMessage[result];
  render();
}

function render() {
  const drink = drankOn(state.events, today);
  const streak = streakParts(state.events, state.goal, state.mode);
  const dayPace = pace(drink, state.goal, state.mode, new Date());
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><main id="main" class="home home-app" tabindex="-1">
    <div class="app-shell">
      <header class="app-top"><a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${brandMark()}</span>Дусал</a>${siteNav('home')}<span class="app-date">${dateLabel(today)}</span></header>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      <div class="hydro">
        <div class="hydro-head"><h1 class="hydro-title">Өнөөдөр</h1>${streak.chip}</div>
        ${buddySection(drink, state.goal, state.mode, dayPace.kind === 'behind' ? dayPace.face : null)}
        ${thirstSection(state.events, drink, dayPace)}
        <button type="button" class="goal-pill" id="plan-toggle" aria-expanded="${planOpen}" aria-controls="plan-wrap">${state.mode === 'limit' ? 'Эмчийн хязгаар' : 'Зорилт'} <b>${number(state.goal)} мл</b></button>
        ${scheduleChip(state)}
        ${drinkTiles()}
        <p class="undo-line" id="undo-line" role="status" ${undoId || undoReset ? '' : 'hidden'}>${undoReset ? 'Өнөөдрийг тэглэлээ' : `<b>+${number(undoAmount)} мл</b> нэмлээ`} <button type="button" class="text-button" id="undo">Буцаах</button></p>
        ${streak.week}
      </div>
      <footer class="home-footer"><button type="button" class="demo-reset" id="demo-reset" ${drink ? '' : 'disabled'}>Демо: өнөөдрийг тэглэх</button><p><a href="/entries.html">Бүх бүртгэл</a> · <a href="/settings.html">Холболт, нөөц ба тохиргоо</a></p></footer>
    </div>
    <div class="plan-wrap" id="plan-wrap" role="dialog" aria-modal="true" aria-label="Өдрийн хэмжээ" ${planOpen ? '' : 'hidden'}>
      <div class="plan-sheet"><button type="button" class="plan-close" id="plan-close" aria-label="Хаах">${mdIcon('close')}</button>${planSection(readProfile())}</div>
    </div>
  </main>`;
  pushWidget(state, drink);
  bindHydration(drink, addDrink, render);
  bindStreakCalendar(state.events, state.goal, state.mode);
  bindSchedule(() => state, render);
  document.querySelector('#undo')?.addEventListener('click', undo);
  document.querySelector('#demo-reset')?.addEventListener('click', resetToday);
  bindPlan();
  // The goal pill opens the calculator as a glass sheet over the home; the close button, the backdrop or Esc close it.
  const sheet = document.querySelector<HTMLElement>('#plan-wrap')!;
  const pill = document.querySelector<HTMLButtonElement>('#plan-toggle')!;
  const setOpen = (open: boolean) => {
    planOpen = open;
    pill.setAttribute('aria-expanded', String(open));
    sheet.hidden = !open;
    if (open) sheet.classList.remove('still');
    if (open) sheet.querySelector<HTMLElement>('.plan-close')!.focus(); else pill.focus();
  };
  document.querySelector('#plan-close')!.addEventListener('click', () => setOpen(false));
  sheet.addEventListener('click', event => { if (event.target === sheet) setOpen(false); });
  sheet.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  pill.addEventListener('click', () => {
    setOpen(!planOpen);
  });
}

// The streak and today's total may change while the app is away; send them as it leaves.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pushWidget(state, drankOn(state.events, dayKey()));
});

onExternalChange(async () => {
  await reload();
  render();
  const ml = newDeviceSips();
  if (ml) void deviceDrop(ml);
});
window.addEventListener('storage', event => {
  if ([PROFILE_KEY, null].includes(event.key)) render();
});
// Roll over to the new day at midnight without a reload.
setInterval(() => { if (dayKey() !== today) { today = dayKey(); render(); } }, 60_000);
void reload().then(() => {
  newDeviceSips();
  render();
  // Keep pulling while home is open so a sip on the base shows up here within seconds.
  startSync();
  startDevices();
  startReminders(() => state);
  startAppIcon(() => state);
  // First visit: ask a few questions and start with the computed daily amount.
  if (needsOnboarding()) showOnboarding(async plan => {
    const result = await save({ ...state, goal: plan.ml, mode: plan.mode });
    await reload();
    if (result !== 'saved') storageError = saveMessage[result];
    render();
  });
});
// The AI option and its button depend on whether the backend has AI turned on.
checkAi().then(ready => { aiReady = ready; render(); });
