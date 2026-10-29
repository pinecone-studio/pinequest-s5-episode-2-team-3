import { escape, number } from './format';
import { CUP_ICONS, defaultIcon, readCups, writeCups, type Cup } from './hydrify';
import { scale } from './scale';
import { confirmSheet } from './hx-edit';
import { notify } from './components/Toast';
import { BasePanel } from './components/DevicePanel';

// «Аягаа хэмжүүлэх», the window the «Ухаалаг суурь» tile opens (device-tiles.ts): the cups the person drinks from,
// measured on the base.
// 1) the empty cup goes on and its weight is taken as zero (here in the app: the base's own bottle is
// left alone), 2) filled as usual, the water is read once it holds still (under 5 g for 2 s; 1 g = 1 ml,
// to 10 ml), 3) it gets a name. Without the base the ml is typed in. The main cup is what «1 аяга»
// means everywhere (cupsText, the quick-add tiles, the drink sheet). The base itself is linked from here
// too, and its bottles, tare and resets fold under «Суурийн тохиргоо» (DevicePanel.ts).
const STILL_G = 5, STILL_MS = 2000;
// 4: all three done and the cup saved; every step shows its check until «Өөр аяга хэмжих».
let step: 1 | 2 | 3 | 4 = 1;
let savedName = '';
let tare: number | null = null;
let measured: number | null = null;
let samples: { at: number; g: number }[] = [];

const linked = () => scale.phase === 'connected';
// «Тэглэх» pressed before the base was linked or had sent a reading: the tare is taken on the first one.
let pendingTare = false;
const liveMl = () => (tare === null || !scale.status ? null : Math.max(0, Math.round((scale.status.weightG - tare) / 10) * 10));
function still(now = Date.now()): boolean {
  if (!samples.length || now - samples[0].at < STILL_MS) return false;
  const recent = samples.filter(s => now - s.at <= STILL_MS).map(s => s.g);
  return recent.length > 1 && Math.max(...recent) - Math.min(...recent) < STILL_G;
}
export function resetCalibration(): void { step = 1; tare = null; measured = null; samples = []; pendingTare = false; savedName = ''; }

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
function steps(): string {
  const row = (n: 1 | 2 | 3, title: string, sub: string, extra = '') => {
    const state = step > n ? 'done' : step === n ? 'now' : 'later';
    return `<li class="cc-step ${state}"><span class="cc-num" aria-hidden="true">${state === 'done' ? CHECK : n}</span><span class="cc-text"><b>${title}</b><small>${sub}</small>${state === 'now' ? extra : ''}</span>
      <span class="visually-hidden">${state === 'done' ? 'хийгдсэн' : state === 'now' ? 'одоо' : 'дараа'}</span></li>`;
  };
  return `<section class="hx-card cc-steps" aria-label="Алхмууд"><ol>
      ${row(1, 'Хоосон аягаа суурин дээр тавь', step > 1 ? 'Жинг нь тэглэлээ' : linked() || scale.phase === 'unsupported' ? 'Тавиад «Тэглэх»-ийг дарна' : 'Тавиад «Тэглэх»-ийг дарна, суурь холбогдоно', `<button type="button" class="hx-blue cc-act" data-act="tare" ${scale.phase === 'unsupported' || pendingTare ? 'disabled' : ''}>${pendingTare ? 'Тэглэж байна…' : 'Тэглэх'}</button>`)}
      ${row(2, 'Аягаа ердийнхөөрөө дүүргээд тавь', step > 2 ? `${number(measured ?? 0)} мл` : 'Хэмжиж байна…')}
      ${row(3, 'Нэр өгөөд хадгал', step > 3 ? `«${escape(savedName)}» хадгалагдлаа` : 'Жишээ: «Миний аяга»', `<form class="cc-name" data-name-form><input id="cc-name" maxlength="24" placeholder="Миний аяга" autocomplete="off" aria-label="Аяганы нэр"><button type="submit" class="hx-blue">Хадгалах</button></form>
        <button type="button" class="hl-text cc-again" data-act="again">Дахин хэмжих</button>`)}
    </ol>${step === 4 ? '<p class="cc-done" role="status">Бүх алхам дууслаа ✓</p><button type="button" class="hl-text cc-again" data-act="again" data-focus>Өөр аяга хэмжих</button>' : ''}</section>`;
}

const linkLabel = () => scale.phase === 'connecting' ? 'Холбогдож байна…' : scale.saved ? 'Дахин холбох' : 'Суурь холбох';
function liveBox(): string {
  if (!linked()) {
    return `<section class="hx-card cc-live off" aria-labelledby="cc-off-title"><b id="cc-off-title">Суурь холбогдоогүй байна</b>
      ${scale.phase === 'unsupported' ? '' : `<button type="button" class="hx-blue cc-link" data-act="link">${linkLabel()}</button>`}
      <small>Эсвэл аяганы хэмжээг гараар оруулна уу.</small>
      <form class="cc-manual" data-manual-form novalidate><label class="visually-hidden" for="cc-ml">Хэмжээ, мл</label><input id="cc-ml" type="number" inputmode="numeric" min="10" max="3000" placeholder="220"><span>мл</span>
        <label class="visually-hidden" for="cc-manual-name">Нэр</label><input id="cc-manual-name" maxlength="24" placeholder="Миний аяга" autocomplete="off"><button type="submit" class="hx-blue">Хадгалах</button></form></section>`;
  }
  const ml = step >= 3 ? measured : step === 2 ? liveMl() : null;
  return `<section class="hx-card cc-live" aria-live="polite"><small>Суурь хэмжиж байна</small><b data-live>${ml === null ? '—' : `${number(ml)} мл`}</b>
      <span data-live-hint>${step === 4 ? 'Хадгалагдлаа ✓' : step === 3 ? 'Хэмжлээ ✓' : scale.status ? 'Тогтвортой болтол 2 секунд хүлээнэ үү' : 'Суурийн жинг уншиж байна…'}</span></section>`;
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

export const calibrateBody = (): string => `${steps()}${liveBox()}${list()}
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
  tare = scale.status!.weightG; samples = []; step = 2; pendingTare = false;
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

// Readings arrive about once a second; the number updates in place, and step 2 moves on once still.
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
      if (scale.status) samples = [...samples.filter(s => Date.now() - s.at <= STILL_MS * 2), { at: Date.now(), g: scale.status.weightG }];
      const ml = liveMl();
      if (step === 2 && ml !== null && ml >= 10 && still()) { measured = ml; step = 3; redraw(); document.querySelector<HTMLInputElement>('#cc-name')?.focus(); return; }
      if (step === 2) box.querySelector('[data-live]')!.textContent = ml === null ? '—' : `${number(ml)} мл`;
    });
  }
  // Without a link yet, «Тэглэх» links the base first and tares on its first reading.
  root.querySelector('[data-act="tare"]')?.addEventListener('click', () => {
    if (linked() && scale.status) { takeTare(redraw); return; }
    pendingTare = true;
    redraw();
    if (!linked()) void link(redraw);
  });
  root.querySelector<HTMLButtonElement>('[data-act="link"]')?.addEventListener('click', () => void link(redraw));
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
