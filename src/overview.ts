import './style.css';
import './shell.css';
import './overview.css';
import './pwa';
import { dayKey, defaults, type AppState, type WaterEntry } from './data';
import { load, save, saveMessage, onExternalChange } from './storage';
import { bindStreakCalendar, bindHydration, deviceDrop } from './hydration';
import { bindGaugeDrag, hxGauge, hxHeader, mainCup, readCup, readCupKind, writeCup, writeCupKind } from './hydrify';
import { openDrinkSheet } from './drink-sheet';
import { limitGauge, openThirst, type AddCtx } from './home-limit';
import { homeActions } from './home-actions';
import { openHomeMenu } from './home-menu';
import { Toast } from './components/Toast';
import type { Kind } from './drinks';
import { setKind, setSalty } from './drinks';
import { bindWatchCard, loadInsight, watchCard } from './watch-card';
import { health } from './health';
import { startSync } from './sync';
import { startDevices } from './devices';
import { bindWeatherChip, loadWeather, todayFeels, todayGoal, weatherChip } from './weather';
import { pushWidget } from './widget';
import { scale } from './scale';
import { ScalePanel, bindDevicePanel } from './components/DevicePanel';
import { familyBoard, leaveFamily, readFamily, reportFamily, startFamily } from './family';
import { familyCard, familyJoinCard } from './family-view';
import { readMember, saveMember } from './member';
import { siteNav } from './nav';
import { CONDITIONS, PROFILE_KEY, calcPlan, readProfile, validProfile, writeProfile, type Profile } from './plan';
import { askAi, checkAi } from './api';
import { guardPlan } from '../shared/plan';
import { needsOnboarding, showOnboarding } from './onboarding';
import { bindSchedule, openSchedule, startReminders } from './schedule';
import { bindDoctorCard, doctorCard } from './doctor-card';
import { startAppIcon } from './app-icon';
import { dateLabel, escape, number } from './format';
import { brandMark, mdIcon } from './components/Icon';
import './theme.css';

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

const GLASS_ML = 250;
const GOAL_TEMPLATES = [
  { name: 'Халуун өдөр', ml: 2500, icon: 'local_fire_department' },
  { name: 'Спорттой өдөр', ml: 1750, icon: 'directions_run' },
  { name: 'Хүйтэн өдөр', ml: 1250, icon: 'water_drop' },
  { name: 'Хүүхэд', ml: 1000, icon: 'woman' },
] as const;

// A plain button under the gauge for the same sheet as the goal pill, easier to find and to hit;
// under a doctor's limit it is the only way in.

// «Дэлгэрэнгүй тохиргоо» stays open across redraws once opened.
let planMore = false;
const glassesText = (d: Draft) => `өдөрт ${kindLabel(d.mode)} · ${Math.round(d.ml / GLASS_ML)} аяга`;

function planSection(p: Profile): string {
  // With no diagnosis there is no doctor's amount to pick, so its fields and card are hidden.
  const noDoctor = p.condition === 'none';
  if (noDoctor && source === 'doctor') { source = 'calc'; draft = null; }
  // A goal that is the doctor's amount opens with the doctor's card picked.
  if (!draft && !noDoctor && state.goal === p.doctorLimit && state.mode === p.doctorMode) source = 'doctor';
  // Keep the user's own edits across re-renders; recompute only after a source or profile change.
  if (!draft) draft = suggestion(p, source);
  const d = draft;
  const vs = d && versusGoal(d);
  const aiOff = aiReady === false;
  // The amount being set comes first, with − and + either side of it.
  const hero = d ? `<div class="plan-hero" aria-live="polite">
      <div class="plan-stepper">
        <button type="button" class="step" id="plan-minus" aria-label="50 мл хасах">−</button>
        <label class="visually-hidden" for="plan-l">Өдрийн хэмжээ, литр</label>
        <p class="plan-l"><input id="plan-l" type="number" inputmode="decimal" min="0.5" max="4" step="0.05" value="${liters(d.ml)}"/><span>л</span></p>
        <button type="button" class="step" id="plan-plus" aria-label="50 мл нэмэх">+</button>
      </div>
      <p class="plan-kind" id="plan-kind">${glassesText(d)}</p>
      <p class="plan-vs${vs!.same ? ' same' : ''}" id="plan-vs">${vs!.text}</p>
      <p class="plan-how"><span class="plan-picked">${SOURCES[source]}</span> · <span id="plan-how">${escape(d.how)}</span></p>
      <p class="plan-warning" id="plan-warning" ${d.warning ? '' : 'hidden'}>${escape(d.warning)}</p>
    </div>` : '';
  // Ready-made days only without a diagnosis: with one, the amount comes from the doctor or the calculator.
  const templates = p.condition === 'none' && d?.mode === 'goal';
  // The AI's doctor card lives here on both homes, right under the diagnosis it depends on.
  const doctorHere = !noDoctor;
  return `<section class="plan-card" aria-labelledby="plan-title">
    <h2 id="plan-title">Зорилтоо тохируулах</h2>
    <form id="plan-form" novalidate>
      ${hero}
      <p class="plan-step">Таны мэдээлэл</p>
      <div class="plan-fields two">
        <label>Нас<input id="plan-age" name="age" type="number" inputmode="numeric" min="4" max="110" value="${p.age}"/></label>
        <label>Жин, кг<input id="plan-weight" name="weight" type="number" inputmode="numeric" min="10" max="250" value="${p.weight}"/></label>
        <label class="wide">Онош<select id="plan-condition" name="condition">${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${p.condition === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${p.condition === 'other' ? `<label class="wide">Ямар онош вэ?<input id="plan-condition-note" name="conditionNote" type="text" maxlength="60" placeholder="Оношоо энд бичнэ үү" aria-describedby="plan-condition-hint" value="${escape(p.conditionNote)}"/>
          <small id="plan-condition-hint">${aiReady === false ? 'AI идэвхгүй байна. Энэ оношид тохирох хэмжээг эмчээсээ асуугаарай.' : 'Бичээд түр хүлээхэд AI таны оношийг харгалзан тооцно. «Тооцоолсон» хэмжээ өөрчлөгдөхгүй.'}</small></label>` : ''}
      </div>
      ${doctorHere ? doctorCard() : ''}
      <details class="plan-more" id="plan-more" ${planMore ? 'open' : ''}>
        <summary>Дэлгэрэнгүй тохиргоо</summary>
        <div class="plan-fields">
          <label>Өндөр, см<input id="plan-height" name="height" type="number" inputmode="numeric" min="90" max="230" value="${p.height}"/></label>
        </div>
        ${templates ? `<p class="plan-step">Бэлэн загварууд</p>
        <div class="goal-templates">${GOAL_TEMPLATES.map(t => `<button type="button" class="goal-template" data-template="${t.ml}" data-name="${t.name}">
          <small>${t.name}</small><b>${t.ml / GLASS_ML} аяга</b><span aria-hidden="true">${mdIcon(t.icon)}</span></button>`).join('')}</div>` : ''}
        <div class="plan-doctor" ${noDoctor ? 'hidden' : ''}>
        <p class="plan-step">Эмчийн заасан хэмжээ <small>гараар</small></p>
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
      </details>
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
    form.querySelector('#plan-kind')!.textContent = glassesText(draft!);
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
  form.querySelector('#plan-more')!.addEventListener('toggle', event => { planMore = (event.target as HTMLDetailsElement).open; });
  form.addEventListener('input', event => {
    const target = event.target as HTMLElement;
    // The doctor card keeps its own text and photo (doctor-card.ts); it is not part of the profile.
    if (target === amount || target.closest('.doctor-card')) return;
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
  form.querySelectorAll<HTMLButtonElement>('[data-template]').forEach(b => b.addEventListener('click', () => {
    if (!draft) return;
    draft = { ...draft, ml: Number(b.dataset.template), how: `Бэлэн загвар: ${b.dataset.name}` };
    show();
  }));
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
  // Entering the doctor's amount makes it the goal right away, so the home shows it instead of the calculated one.
  form.querySelectorAll('#plan-doctor, #plan-doctor-mode').forEach(field => field.addEventListener('change', () => {
    const p = readForm(form);
    if (!validProfile(p)) return;
    clearTimeout(autoAskTimer);
    source = 'doctor';
    draft = suggestion(p, 'doctor');
    form.requestSubmit();
  }));
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

let drinking = false;
// The limit home names the drink itself; elsewhere it is the drink the cup button pours.
async function addDrink(ml: number, kind: Kind | undefined = readCupKind(), salty = false) {
  const entry: WaterEntry = { id: crypto.randomUUID(), amount: ml, type: 'drink', at: new Date().toISOString() };
  setKind(entry.id, kind);
  setSalty(entry.id, salty);
  drinking = true; render(); // "Ууж байна..." while it saves and the gauge fills (kit screen 30)
  const result = await save({ ...state, events: [...state.events, entry] });
  setTimeout(() => { drinking = false; render(); }, 900);
  await reload();
  if (result !== 'saved') { storageError = saveMessage[result]; render(); return; }
  undoId = entry.id;
  undoAmount = ml;
  undoReset = null;
  offerUndo();
  render();
}

// The demo reset shows in a dev build or with ?demo=1; under a limit only then.
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo');

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

// The family board once this phone has a base; a name prompt first if onboarding's name step was skipped.
function familySection(): string {
  if (!readFamily()) return '';
  if (!readMember()) return familyJoinCard();
  const board = familyBoard();
  return board ? familyCard(board) : '';
}
function bindFamily() {
  document.querySelector('[data-family-leave]')?.addEventListener('click', () => {
    if (confirm('Гэр бүлийн жагсаалтаас гарах уу? Суурьтай дахин холбогдоход буцаж нэгдэнэ.')) void leaveFamily();
  });
  document.querySelector<HTMLFormElement>('[data-family-join]')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('#fam-name')!;
    if (!saveMember(input.value)) { input.focus(); return; }
    render();
  });
}

// "Good morning, Сараа": the time of day and the name from the profile (src/member.ts), or just today.
function greeting(): string {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Өглөөний мэнд' : hour < 18 ? 'Өдрийн мэнд' : 'Оройн мэнд';
  const name = readMember()?.name;
  return `<div class="greet"><p>${hello}${name ? ',' : ''}</p><h1 class="hydro-title">${name ? escape(name) : 'Өнөөдөр'}</h1></div>`;
}

function render() {
  loadInsight({ drink: drankOn(state.events, today), goal: state.goal, mode: state.mode, feels: todayFeels() }, aiReady, render);
  const drink = drankOn(state.events, today);
  // Today's weather may raise today's target; the saved goal (and so past days) stays as it is.
  const goal = todayGoal(state.goal, state.mode);
  // Under a doctor's limit the home only shows what is left; no weather advice, AI card or watch.
  const limit = state.mode === 'limit', cup = mainCup();
  homeCtx = { drink, goal, limit, cup, add: (ml, kind, salty) => void addDrink(ml, kind, salty) };
  const undoLine = `<p class="undo-line" id="undo-line" role="status" ${undoId || undoReset ? '' : 'hidden'}>${undoReset ? 'Өнөөдрийг тэглэлээ' : `<b>+${number(undoAmount)} мл</b> нэмлээ`} <button type="button" class="text-button" id="undo-entry">Буцаах</button></p>`;
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><main id="main" class="home home-app" tabindex="-1">
    <div class="app-shell">
      <header class="app-top"><a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${brandMark()}</span>Дусал</a>${siteNav('home')}<span class="app-date">${dateLabel(today)}</span></header>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      <div class="hydro">
        ${hxHeader('Нүүр')}
        ${limit ? '' : weatherChip(state.mode)}
        ${limit ? limitGauge(drink, goal, cup) : hxGauge(drink, goal, state.mode, readCup(), drinking)}${undoLine}
        ${watchCard()}
        ${familySection()}
        ${ScalePanel(limit)}
      </div>
      <footer class="home-footer hx-footer">${limit && !demo ? '' : `<button type="button" class="demo-reset" id="demo-reset" ${drink ? '' : 'disabled'}>Демо: өнөөдрийг тэглэх</button>`}<p><a href="/history.html">Бүх бүртгэл</a> · <a href="/settings.html#linked">Холболт, нөөц ба тохиргоо</a></p></footer>
    </div>
    <div class="plan-wrap" id="plan-wrap" role="dialog" aria-modal="true" aria-label="Өдрийн хэмжээ" ${planOpen ? '' : 'hidden'}>
      <div class="plan-sheet"><button type="button" class="plan-close" id="plan-close" aria-label="Хаах">${mdIcon('close')}</button>${planSection(readProfile())}</div>
    </div>
  </main>
  ${limit ? Toast() : ''}`;
  pushWidget(state, drink);
  void reportFamily(state, drink);
  bindFamily();
  bindHydration(drink, addDrink, render);
  if (!limit) bindGaugeDrag(addDrink);
  // The goal home's cup button opens the drink sheet; what it adds becomes what «Уух» pours next
  // (not the quick tiles on top, which add once).
  document.querySelector<HTMLButtonElement>('#hx-cup')?.addEventListener('click', () => openDrinkSheet({
    drink, goal, limit: false, cup: readCup(),
    add: (ml, kind, salty) => { writeCup(ml); writeCupKind(kind); void addDrink(ml, kind, salty); },
    addOnce: (ml, kind, salty) => void addDrink(ml, kind, salty),
  }, { kind: readCupKind() }));
  bindStreakCalendar(state.events, state.goal, state.mode);
  bindWatchCard();
  // The doctor card is inside the open goal sheet, which must redraw without replaying its opening
  // or losing its scroll.
  bindDoctorCard(renderKeepingFocus, async (ml, mode) => {
    const result = await save({ ...state, goal: ml, mode });
    await reload();
    source = 'doctor'; draft = null;
    renderKeepingFocus();
    return result === 'saved';
  });
  bindWeatherChip();
  scale.shareToday(drink, false, { goal, mode: state.mode });  // the base's screen shows the same total
  bindDevicePanel(() => {});  // the base panel redraws itself on each reading
  bindSchedule(() => state, render);
  // The tab bar's middle button ("/#reminders") opens today's schedule here.
  if (location.hash === '#reminders') { history.replaceState(null, '', '/'); openSchedule(() => state, render); }
  document.querySelector('#undo-entry')?.addEventListener('click', undo);
  document.querySelector('#demo-reset')?.addEventListener('click', resetToday);
  bindPlan();
  // The close button, the backdrop or Esc close the sheet; the openers are bound once, below.
  const sheet = document.querySelector<HTMLElement>('#plan-wrap')!;
  document.querySelector('#plan-close')!.addEventListener('click', () => setPlanOpen(false));
  sheet.addEventListener('click', event => { if (event.target === sheet) setPlanOpen(false); });
  sheet.addEventListener('keydown', event => { if (event.key === 'Escape') setPlanOpen(false); });
}

// The goal pill on the goal-mode gauge and «Зорилтоо тохируулах» in the «⋯» menu open the calculator
// as a glass sheet over the home.
let planOpener = '';
function setPlanOpen(open: boolean) {
  const sheet = document.querySelector<HTMLElement>('#plan-wrap');
  if (!sheet) return;
  planOpen = open;
  document.querySelectorAll('[data-plan-open]').forEach(b => b.setAttribute('aria-expanded', String(open)));
  sheet.hidden = !open;
  if (open) sheet.classList.remove('still');
  if (open) sheet.querySelector<HTMLElement>('.plan-close')?.focus();
  else document.getElementById(planOpener)?.focus();
}
// Bound once on the document rather than in render(), so the openers work even if a later part of a
// redraw fails.
document.addEventListener('click', event => {
  const opener = (event.target as Element).closest<HTMLElement>('[data-plan-open]');
  if (!opener) return;
  planOpener = opener.id;
  setPlanOpen(!planOpen);
});

// «Уух» on the limit home (the drink sheet) and «⋯» on both homes, bound once like the plan openers.
// homeCtx is today's, set by each render.
let homeCtx: AddCtx | null = null;
document.addEventListener('click', event => {
  const target = event.target as Element;
  if (!homeCtx) return;
  if (target.closest('[data-drink-sheet]')) openDrinkSheet(homeCtx);
  else if (target.closest('#hx-more')) {
    const ctx = homeCtx;
    openHomeMenu(homeActions(readProfile().condition, state.mode), ctx.goal, {
      thirst: () => openThirst(ctx),
      plan: () => { planOpener = 'hx-more'; setPlanOpen(true); },
      reminder: () => openSchedule(() => state, render),
    });
  }
});

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
  void loadWeather(state.goal, render);
  // Connecting to a base joins its family; the board redraws when the server answers.
  startFamily();
  window.addEventListener('dusal-health', render);
  void health.start();
  window.addEventListener('dusal-family', render);
  startReminders(() => state);
  startAppIcon(() => state);
  // First visit: ask a few questions and start with the computed daily amount.
  // "/?onboard" shows it again from the start (for demos); the water log is kept.
  const again = new URLSearchParams(location.search).has('onboard');
  if (again) history.replaceState(null, '', location.pathname + location.hash);
  if (again || needsOnboarding()) showOnboarding(async plan => {
    const result = await save({ ...state, goal: plan.ml, mode: plan.mode });
    await reload();
    if (result !== 'saved') storageError = saveMessage[result];
    render();
  });
});
// The AI option and its button depend on whether the backend has AI turned on.
checkAi().then(ready => { aiReady = ready; render(); });
