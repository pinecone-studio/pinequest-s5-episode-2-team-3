import { escape, number } from './format';
import { CUP_ICONS, defaultIcon, readCups, writeCups, type Cup } from './hydrify';
import { savedBottles, scale } from './scale';
import { confirmSheet } from './hx-edit';
import { notify } from './components/Toast';
import { BasePanel } from './components/DevicePanel';
import { openBaseConnect } from './base-connect';

// «Аягаа хэмжүүлэх», the window the «Ухаалаг суурь» tile opens (device-tiles.ts): the cups the person drinks from,
// measured on the base.
// 1) the empty cup goes on and its weight is taken as zero (here in the app: the base's own bottle is
// left alone), 2) filled as usual and put back, «Хэмжих» takes the water (1 g = 1 ml, to the gram the base sends), 3) it gets a name. Without the base the ml is typed in. The main cup is what «1 аяга»
// means everywhere (cupsText, the quick-add tiles, the drink sheet). The base itself is linked from here
// too, and its bottles, tare and resets fold under «Суурийн тохиргоо» (DevicePanel.ts).
// 4: all three done and the cup saved; every step shows its check until «Өөр аяга хэмжих».
let step: 1 | 2 | 3 | 4 = 1;
let savedName = '';
let tare: number | null = null;
let measured: number | null = null;

const linked = () => scale.phase === 'connected';
// «Тэглэх» pressed before the base was linked or had sent a reading: the tare is taken on the first one.
let pendingTare = false;
const liveMl = () => (tare === null || !scale.status ? null : Math.max(0, scale.status.weightG - tare));
// «Хэмжих» waits for some water on the cup: MIN_ML is the base's own «something is there» (PRESENT_MIN_G),
// so a light cup's few grams count too.
const MIN_ML = 2;
const canMeasure = () => { const ml = liveMl(); return ml !== null && ml >= MIN_ML; };
export function resetCalibration(): void { step = 1; tare = null; measured = null; pendingTare = false; savedName = ''; }

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
function steps(): string {
  const row = (n: 1 | 2 | 3, title: string, sub: string, extra = '') => {
    const state = step > n ? 'done' : step === n ? 'now' : 'later';
    return `<li class="cc-step ${state}"><span class="cc-num" aria-hidden="true">${state === 'done' ? CHECK : n}</span><span class="cc-text"><b>${title}</b><small>${sub}</small>${state === 'now' ? extra : ''}</span>
      <span class="visually-hidden">${state === 'done' ? 'хийгдсэн' : state === 'now' ? 'одоо' : 'дараа'}</span></li>`;
  };
  return `<section class="hx-card cc-steps" aria-label="Алхмууд"><ol>
      ${row(1, 'Хоосон аягаа суурин дээр тавь', step > 1 ? 'Жинг нь тэглэлээ' : linked() || scale.phase === 'unsupported' ? 'Тавиад «Тэглэх»-ийг дарна' : 'Тавиад «Тэглэх»-ийг дарна, суурь холбогдоно', `<button type="button" class="hx-blue cc-act" data-act="tare" ${scale.phase === 'unsupported' || pendingTare ? 'disabled' : ''}>${pendingTare ? 'Тэглэж байна…' : 'Тэглэх'}</button>`)}
      ${row(2, 'Аягаа ердийнхөөрөө дүүргээд тавь', step > 2 ? `${number(measured ?? 0)} мл` : 'Тавиад «Хэмжих»-ийг дарна', `<button type="button" class="hx-blue cc-act" data-act="measure" ${canMeasure() ? '' : 'disabled'}>Хэмжих</button>`)}
      ${row(3, 'Нэр өгөөд хадгал', step > 3 ? `«${escape(savedName)}» хадгалагдлаа` : 'Жишээ: «Миний аяга»', `<form class="cc-name" data-name-form><input id="cc-name" maxlength="24" placeholder="Миний аяга" autocomplete="off" aria-label="Аяганы нэр"><button type="submit" class="hx-blue">Хадгалах</button></form>
        <button type="button" class="hl-text cc-again" data-act="again">Дахин хэмжих</button>`)}
    </ol>${step === 4 ? '<p class="cc-done" role="status">Бүх алхам дууслаа ✓</p><button type="button" class="hl-text cc-again" data-act="again" data-focus>Өөр аяга хэмжих</button>' : ''}</section>`;
}

const linkLabel = () => scale.phase === 'connecting' ? 'Холбогдож байна…' : scale.saved ? 'Дахин холбох' : 'Суурь холбох';
// The big number: what is on the base before the tare, the water in the cup after it. Below it the base's
// whole weight, so the reading can be checked against it at any step.
function liveText(): string {
  if (step >= 3) return `${number(measured ?? 0)} мл`;
  if (step === 2) { const ml = liveMl(); return ml === null ? '—' : `${number(ml)} мл`; }
  return scale.status ? `${number(scale.status.weightG)} г` : '—';
}
const weightText = () => (scale.status ? `Суурин дээр нийт ${number(scale.status.weightG)} г` : '');
function liveBox(): string {
  if (!linked()) {
    return `<section class="hx-card cc-live off" aria-labelledby="cc-off-title"><b id="cc-off-title">Суурь холбогдоогүй байна</b>
      ${scale.phase === 'unsupported' ? '' : `<button type="button" class="hx-blue cc-link" data-act="link">${linkLabel()}</button>`}
      <small>Эсвэл аяганы хэмжээг гараар оруулна уу.</small>
      <form class="cc-manual" data-manual-form novalidate><label class="visually-hidden" for="cc-ml">Хэмжээ, мл</label><input id="cc-ml" type="number" inputmode="numeric" min="10" max="3000" placeholder="220"><span>мл</span>
        <label class="visually-hidden" for="cc-manual-name">Нэр</label><input id="cc-manual-name" maxlength="24" placeholder="Миний аяга" autocomplete="off"><button type="submit" class="hx-blue">Хадгалах</button></form></section>`;
  }
  return `<section class="hx-card cc-live" aria-live="polite"><small>${step === 1 ? 'Суурин дээрх жин' : 'Аяган дахь ус'}</small><b data-live>${liveText()}</b>
      <span class="cc-weight" data-weight>${weightText()}</span>
      <span data-live-hint>${step === 4 ? 'Хадгалагдлаа ✓' : step === 3 ? 'Хэмжлээ ✓' : scale.status ? 'Тогтвортой болмогц «Хэмжих»-ийг дарна уу' : 'Суурийн жинг уншиж байна…'}</span></section>`;
}

// The bottles weighed before (their empty weight, «Савны жин» on base-connect.ts): pick the one going on
// the base, so the water in it is told right away instead of weighing it empty again. New ones are
// weighed under «Суурийн тохиргоо» below.
function bottles(): string {
  const { list, selected } = savedBottles();
  const on = linked();
  return `<section class="hx-card cc-bottles" aria-labelledby="cc-bottles-title"><h2 id="cc-bottles-title">Миний савнууд</h2>
      ${list.length ? `<div class="cc-bottle-list">${list.map(b => `<button type="button" class="cc-bottle${b.id === selected ? ' on' : ''}" data-pick-bottle="${escape(b.id)}" aria-pressed="${b.id === selected}" ${on ? '' : 'disabled'}>
        <b>${escape(b.name)}</b><small>${number(b.grams)} г</small></button>`).join('')}</div>
      <small class="cc-tip">${on ? 'Суурин дээр тавих саваа сонгоно уу' : 'Суурь холбогдсоны дараа сонгоно'}</small>`
      : '<p class="cc-empty">Хадгалсан сав алга. «Суурийн тохиргоо» → «Сав ба тэглэх»-ээс хоосон савныхаа жинг авна уу.</p>'}
    </section>`;
}

// Only the cups measured here (they have a name) and the main one; the app's ready sizes are on
// Profile › «Миний аяганууд», linked below.
function list(): string {
  const cups = readCups().map((c, i) => ({ c, i })).filter(({ c }) => c.name || c.main);
  return `<section class="hx-card cc-list" aria-labelledby="cc-list-title"><h2 id="cc-list-title">Миний аяганууд</h2>
      ${cups.length ? `<ul>${cups.map(({ c, i }) => `<li><button type="button" class="cc-cup" data-cup="${i}" aria-pressed="${!!c.main}" aria-label="${escape(c.name ?? 'Аяга')} ${number(c.ml)} мл${c.main ? ', үндсэн' : ', үндсэн болгох'}. Удаан дарвал устгана.">
        ${CUP_ICONS[c.icon]}<span>${escape(c.name ?? 'Аяга')}${c.main ? ' · үндсэн' : ''}</span><b>${number(c.ml)} мл</b></button></li>`).join('')}</ul>
      <small class="cc-tip">Дарвал үндсэн болно · удаан дарвал устгана</small>` : '<p class="cc-empty">Хэмжсэн аяга алга. «1 аяга» = 250 мл гэж тооцно.</p>'}
      <a class="hl-text cc-all" href="/settings.html#cups">Бүх аяганууд ›</a>
    </section>`;
}

export const calibrateBody = (): string => `${steps()}${liveBox()}${bottles()}${list()}
  <details class="cc-base"${baseOpen ? ' open' : ''}><summary>Суурийн тохиргоо</summary>${BasePanel()}</details>
  <p class="cc-foot">Үлдсэн хэмжээг «мл»-ээс гадна таны аягаар харуулна.</p>`;
// «Суурийн тохиргоо» stays open across redraws once opened.
let baseOpen = false;

// From the base the steps stay checked; typed in by hand they were not used.
function save(ml: number, name: string, redraw: () => void, measuredOnBase = false): void {
  const cups = readCups();
  const cup: Cup = { ml, icon: defaultIcon(ml), ...(name.trim() ? { name: name.trim().slice(0, 24) } : {}), ...(cups.some(c => c.main) ? {} : { main: true }) };
  writeCups([...cups, cup]);
  notify(`«${cup.name ?? 'Аяга'}» ${number(ml)} мл хадгалагдлаа.`);
  if (measuredOnBase) { step = 4; savedName = cup.name ?? 'Аяга'; } else resetCalibration();
  redraw();
  if (measuredOnBase) document.querySelector<HTMLElement>('.cc-steps [data-focus]')?.focus();
}

function remove(i: number, redraw: () => void): void {
  const cups = readCups();
  if (cups.length <= 1) { notify('Сүүлийн аягыг устгах боломжгүй.'); return; }
  confirmSheet('Аяга устгах', `«${escape(cups[i].name ?? 'Аяга')}» ${number(cups[i].ml)} мл-ийг устгах уу?`, 'Тийм, устгах', () => {
    const [gone] = cups.splice(i, 1);
    if (gone.main) cups[0] = { ...cups[0], main: true };
    writeCups(cups);
    redraw();
  });
}

function takeTare(redraw: () => void): void {
  tare = scale.status!.weightG; step = 2; pendingTare = false;
  redraw();
}
// A remembered base reconnects; otherwise the system's device picker opens.
async function link(redraw: () => void): Promise<void> {
  if (scale.saved) { scale.reconnect(); return; }
  try { await scale.pair(); }
  catch (error) {
    if (pendingTare) { pendingTare = false; redraw(); }
    if (!(error instanceof Error && /cancel/i.test(`${error.name} ${error.message}`))) notify('Bluetooth асаалттай, апп Bluetooth ашиглах зөвшөөрөлтэй эсэхийг шалгана уу.');
  }
}

// Readings arrive about once a second; the number and «Хэмжих» update in place.
let listening = false, current: () => void = () => {};
export function bindCalibrate(root: HTMLElement, redraw: () => void): void {
  current = redraw;
  root.querySelector('.cc-base')?.addEventListener('toggle', e => { baseOpen = (e.target as HTMLDetailsElement).open; });
  if (!listening) {
    listening = true;
    window.addEventListener('dusal-scale', () => {
      const redraw = current;
      const box = document.querySelector<HTMLElement>('.cc-live');
      if (!box) return;
      if (pendingTare && linked() && scale.status && step === 1) { takeTare(redraw); return; }
      if (pendingTare && scale.phase === 'off') { pendingTare = false; redraw(); return; }  // linking failed
      if (!!box.classList.contains('off') === linked()) { redraw(); return; }  // connected or lost
      const link = box.querySelector<HTMLButtonElement>('[data-act="link"]');
      if (link) { link.textContent = linkLabel(); link.disabled = scale.phase === 'connecting'; }
      box.querySelector('[data-weight]')!.textContent = weightText();
      if (step > 2) return;
      box.querySelector('[data-live]')!.textContent = liveText();
      const measure = document.querySelector<HTMLButtonElement>('[data-act="measure"]');
      if (measure) measure.disabled = !canMeasure();
    });
  }
  // Without a link yet, «Тэглэх» links the base first and tares on its first reading.
  root.querySelector('[data-act="tare"]')?.addEventListener('click', () => {
    if (linked() && scale.status) { takeTare(redraw); return; }
    pendingTare = true;
    redraw();
    if (!linked()) void link(redraw);
  });
  root.querySelector<HTMLButtonElement>('[data-act="link"]')?.addEventListener('click', () => openBaseConnect());
  root.querySelectorAll<HTMLButtonElement>('[data-pick-bottle]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.pickBottle!;
    void scale.chooseBottle(id).catch(() => notify('Савыг сонгож чадсангүй. Суурь холбогдсон эсэхийг шалгана уу.'));
    redraw();
  }));
  root.querySelector('[data-act="measure"]')?.addEventListener('click', () => {
    if (!canMeasure()) return;
    measured = liveMl(); step = 3;
    redraw();
    document.querySelector<HTMLInputElement>('#cc-name')?.focus();
  });
  root.querySelector('[data-act="again"]')?.addEventListener('click', () => { resetCalibration(); redraw(); });
  root.querySelector<HTMLFormElement>('[data-name-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    if (measured) save(measured, root.querySelector<HTMLInputElement>('#cc-name')!.value, redraw, true);
  });
  root.querySelector<HTMLFormElement>('[data-manual-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    const ml = Math.round(Number(root.querySelector<HTMLInputElement>('#cc-ml')!.value) / 10) * 10;
    if (!(ml >= 10 && ml <= 3000)) { notify('Хэмжээ 10–3,000 мл байна.'); return; }
    save(ml, root.querySelector<HTMLInputElement>('#cc-manual-name')!.value, redraw);
  });
  // Tap: make it the main cup. Long press (or Delete on the keyboard): remove it.
  root.querySelectorAll<HTMLButtonElement>('[data-cup]').forEach(b => {
    const i = Number(b.dataset.cup);
    let timer: ReturnType<typeof setTimeout> | undefined, held = false;
    b.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; remove(i, redraw); }, 550); });
    const cancel = () => clearTimeout(timer);
    b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', e => { e.preventDefault(); if (!held) { cancel(); remove(i, redraw); } });
    b.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i, redraw); } });
    b.addEventListener('click', () => {
      if (held) return;
      writeCups((readCups()).map((c, j) => { const { main: _main, ...rest } = c; return j === i ? { ...rest, main: true } : rest; }));
      redraw();
    });
  });
}
