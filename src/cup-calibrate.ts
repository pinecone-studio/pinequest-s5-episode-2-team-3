import { escape, number } from './format';
import { defaultIcon, readCups, writeCups, type Cup } from './hydrify';
import { scale } from './scale';
import { notify } from './components/Toast';

// «Аяга хэмжих» on «Суурь холбох» once linked (base-connect.ts): a cup the person drinks from, measured on the base.
// 1) the empty cup goes on and its weight is taken as zero (here in the app: the base's own bottle is left
// alone), 2) filled as usual and put back, «Хэмжих» takes the water (1 g = 1 ml, to the gram the base sends),
// 3) it gets a name. The main cup is what «1 аяга» means everywhere (cupsText, the quick-add tiles, the drink
// sheet); cups typed in by hand are on Profile › «Миний аяганууд».
// 4: all three done and the cup saved; every step shows its check until «Өөр аяга хэмжих».
let step: 1 | 2 | 3 | 4 = 1;
let savedName = '';
let tare: number | null = null;
let measured: number | null = null;

const liveMl = () => (tare === null || !scale.status ? null : Math.max(0, scale.status.weightG - tare));
// «Хэмжих» waits for some water on the cup: MIN_ML is the base's own «something is there» (PRESENT_MIN_G),
// so a light cup's few grams count too.
const MIN_ML = 2;
const canMeasure = () => { const ml = liveMl(); return ml !== null && ml >= MIN_ML; };
function resetCalibration(): void { step = 1; tare = null; measured = null; savedName = ''; }

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// The big number: what is on the base before the tare, the water in the cup after it.
function liveText(): string {
  if (step >= 3) return `${number(measured ?? 0)} мл`;
  if (step === 2) { const ml = liveMl(); return ml === null ? '—' : `${number(ml)} мл`; }
  return scale.status ? `${number(scale.status.weightG)} г` : '—';
}

function save(ml: number, name: string, redraw: () => void): void {
  const cups = readCups();
  const cup: Cup = { ml, icon: defaultIcon(ml), ...(name.trim() ? { name: name.trim().slice(0, 24) } : {}), ...(cups.some(c => c.main) ? {} : { main: true }) };
  writeCups([...cups, cup]);
  notify(`«${cup.name ?? 'Аяга'}» ${number(ml)} мл хадгалагдлаа.`);
  step = 4; savedName = cup.name ?? 'Аяга';
  redraw();
}

// The live number over the steps; only the current step has its button. The base is linked there, so
// «Тэглэх» waits only for a reading.
export function cupCard(): string {
  const row = (n: 1 | 2 | 3, title: string, sub: string, extra = '') => {
    const state = step > n ? 'done' : step === n ? 'now' : 'later';
    return `<li class="bc-step ${state}"><span class="bc-num" aria-hidden="true">${state === 'done' ? CHECK : n}</span>
      <span class="bc-step-text"><b>${title}</b><small>${sub}</small>${state === 'now' ? extra : ''}</span>
      <span class="visually-hidden">${state === 'done' ? 'хийгдсэн' : state === 'now' ? 'одоо' : 'дараа'}</span></li>`;
  };
  return `<h3 class="bc-title">Аяга хэмжих</h3>
    <div class="bc-cup-live" aria-live="off"><b data-cup-live>${liveText()}</b><small>${step === 1 ? 'Суурин дээрх жин' : 'Аяган дахь ус'}</small></div>
    <ol class="bc-steps">
      ${row(1, 'Хоосон аягаа тавь', step > 1 ? 'Жинг нь тэглэлээ' : 'Тавиад «Тэглэх»-ийг дарна', `<button type="button" class="wt-ghost" data-cup-act="tare" ${scale.status ? '' : 'disabled'}>Тэглэх</button>`)}
      ${row(2, 'Дүүргээд буцааж тавь', step > 2 ? `${number(measured ?? 0)} мл` : 'Тогтвортой болмогц «Хэмжих»-ийг дарна', `<button type="button" class="wt-ghost" data-cup-act="measure" ${canMeasure() ? '' : 'disabled'}>Хэмжих</button>`)}
      ${row(3, 'Нэр өгөөд хадгал', step > 3 ? `«${escape(savedName)}» хадгалагдлаа` : 'Жишээ: «Миний аяга»', `<form class="bc-cup-name" data-cup-name data-transient>
        <label class="visually-hidden" for="bc-cup-name">Аяганы нэр</label><input id="bc-cup-name" maxlength="24" placeholder="Миний аяга" autocomplete="off">
        <button type="submit" class="wt-ghost">Хадгалах</button></form>`)}
    </ol>
    ${step === 4 ? '<p class="bc-result" role="status">Аяга хадгалагдлаа ✓</p>' : ''}
    ${step > 1 ? `<button type="button" class="bc-link" data-cup-act="again">${step === 4 ? 'Өөр аяга хэмжих' : 'Дахин эхлэх'}</button>` : ''}`;
}
// Each reading: the number and whether «Тэглэх» and «Хэмжих» can be pressed, in place.
export function cupCardLive(root: HTMLElement): void {
  const live = root.querySelector('[data-cup-live]');
  if (live && step <= 2) live.textContent = liveText();
  const measure = root.querySelector<HTMLButtonElement>('[data-cup-act="measure"]');
  if (measure) measure.disabled = !canMeasure();
  const tareButton = root.querySelector<HTMLButtonElement>('[data-cup-act="tare"]');
  if (tareButton) tareButton.disabled = !scale.status;
}
export function bindCupCard(root: HTMLElement, redraw: () => void): void {
  root.querySelector('[data-cup-act="tare"]')?.addEventListener('click', () => {
    if (!scale.status) return;
    tare = scale.status.weightG; step = 2;
    redraw();
  });
  root.querySelector('[data-cup-act="measure"]')?.addEventListener('click', () => {
    if (!canMeasure()) return;
    measured = liveMl(); step = 3;
    redraw();
    root.querySelector<HTMLInputElement>('#bc-cup-name')?.focus();
  });
  root.querySelector('[data-cup-act="again"]')?.addEventListener('click', () => { resetCalibration(); redraw(); });
  root.querySelector<HTMLFormElement>('[data-cup-name]')?.addEventListener('submit', e => {
    e.preventDefault();
    if (measured) save(measured, root.querySelector<HTMLInputElement>('#bc-cup-name')!.value, redraw);
  });
}
