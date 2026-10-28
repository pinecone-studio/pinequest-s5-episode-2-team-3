import { escape, number } from './format';
import { CUP_ICONS, defaultIcon, savedCups, writeCups, type Cup } from './hydrify';
import { scale } from './scale';
import { confirmSheet } from './hx-edit';
import { notify } from './components/Toast';

// «Аягаа хэмжүүлэх» (Профайл › Миний савнууд): the cups the person drinks from, measured on the base.
// 1) the empty cup goes on and its weight is taken as zero (here in the app: the base's own bottle is
// left alone), 2) filled as usual, the water is read once it holds still (under 5 g for 2 s; 1 g = 1 ml,
// to 10 ml), 3) it gets a name. Without the base the ml is typed in. The main cup is what «1 аяга»
// means everywhere (cupsText, the quick-add tiles, the drink sheet).
const STILL_G = 5, STILL_MS = 2000;
let step: 1 | 2 | 3 = 1;
let tare: number | null = null;
let measured: number | null = null;
let samples: { at: number; g: number }[] = [];

const connected = () => scale.phase === 'connected' && !!scale.status;
const liveMl = () => (tare === null || !scale.status ? null : Math.max(0, Math.round((scale.status.weightG - tare) / 10) * 10));
function still(now = Date.now()): boolean {
  if (!samples.length || now - samples[0].at < STILL_MS) return false;
  const recent = samples.filter(s => now - s.at <= STILL_MS).map(s => s.g);
  return recent.length > 1 && Math.max(...recent) - Math.min(...recent) < STILL_G;
}
export function resetCalibration(): void { step = 1; tare = null; measured = null; samples = []; }

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
function steps(): string {
  const row = (n: 1 | 2 | 3, title: string, sub: string, extra = '') => {
    const state = step > n ? 'done' : step === n ? 'now' : 'later';
    return `<li class="cc-step ${state}"><span class="cc-num" aria-hidden="true">${state === 'done' ? CHECK : n}</span><span class="cc-text"><b>${title}</b><small>${sub}</small>${state === 'now' ? extra : ''}</span>
      <span class="visually-hidden">${state === 'done' ? 'хийгдсэн' : state === 'now' ? 'одоо' : 'дараа'}</span></li>`;
  };
  return `<section class="hx-card cc-steps" aria-label="Алхмууд"><ol>
      ${row(1, 'Хоосон аягаа суурин дээр тавь', step > 1 ? 'Жинг нь тэглэлээ' : 'Тавиад «Тэглэх»-ийг дарна', `<button type="button" class="hx-blue cc-act" data-act="tare" ${connected() ? '' : 'disabled'}>Тэглэх</button>`)}
      ${row(2, 'Аягаа ердийнхөөрөө дүүргээд тавь', step > 2 ? `${number(measured ?? 0)} мл` : 'Хэмжиж байна…')}
      ${row(3, 'Нэр өгөөд хадгал', 'Жишээ: «Миний аяга»', `<form class="cc-name" data-name-form><input id="cc-name" maxlength="24" placeholder="Миний аяга" autocomplete="off" aria-label="Аяганы нэр"><button type="submit" class="hx-blue">Хадгалах</button></form>
        <button type="button" class="hl-text cc-again" data-act="again">Дахин хэмжих</button>`)}
    </ol></section>`;
}

function liveBox(): string {
  if (!connected()) {
    return `<section class="hx-card cc-live off" aria-labelledby="cc-off-title"><b id="cc-off-title">Суурь холбогдоогүй байна</b>
      <small>Аяганы хэмжээг гараар оруулна уу.</small>
      <form class="cc-manual" data-manual-form novalidate><label class="visually-hidden" for="cc-ml">Хэмжээ, мл</label><input id="cc-ml" type="number" inputmode="numeric" min="10" max="3000" placeholder="220"><span>мл</span>
        <label class="visually-hidden" for="cc-manual-name">Нэр</label><input id="cc-manual-name" maxlength="24" placeholder="Миний аяга" autocomplete="off"><button type="submit" class="hx-blue">Хадгалах</button></form></section>`;
  }
  const ml = step === 3 ? measured : step === 2 ? liveMl() : null;
  return `<section class="hx-card cc-live" aria-live="polite"><small>Суурь хэмжиж байна</small><b data-live>${ml === null ? '—' : `${number(ml)} мл`}</b>
      <span data-live-hint>${step === 3 ? 'Хэмжлээ ✓' : 'Тогтвортой болтол 2 секунд хүлээнэ үү'}</span></section>`;
}

function list(): string {
  const cups = savedCups() ?? [];
  return `<section class="hx-card cc-list" aria-labelledby="cc-list-title"><h2 id="cc-list-title">Миний савнууд</h2>
      ${cups.length ? `<ul>${cups.map((c, i) => `<li><button type="button" class="cc-cup" data-cup="${i}" aria-pressed="${!!c.main}" aria-label="${escape(c.name ?? 'Аяга')} ${number(c.ml)} мл${c.main ? ', үндсэн' : ', үндсэн болгох'}. Удаан дарвал устгана.">
        ${CUP_ICONS[c.icon]}<span>${escape(c.name ?? 'Аяга')}${c.main ? ' · үндсэн' : ''}</span><b>${number(c.ml)} мл</b></button></li>`).join('')}</ul>
      <small class="cc-tip">Дарвал үндсэн болно · удаан дарвал устгана</small>` : '<p class="cc-empty">Одоогоор хадгалсан аяга алга. «1 аяга» = 250 мл гэж тооцно.</p>'}
    </section>`;
}

export const calibrateBody = (): string => `${steps()}${liveBox()}${list()}<p class="cc-foot">Үлдсэн хэмжээг «мл»-ээс гадна таны аягаар харуулна.</p>`;

function save(ml: number, name: string, redraw: () => void): void {
  const cups = savedCups() ?? [];
  const cup: Cup = { ml, icon: defaultIcon(ml), ...(name.trim() ? { name: name.trim().slice(0, 24) } : {}), ...(cups.some(c => c.main) ? {} : { main: true }) };
  writeCups([...cups, cup]);
  notify(`«${cup.name ?? 'Аяга'}» ${number(ml)} мл хадгалагдлаа.`);
  resetCalibration();
  redraw();
}

function remove(i: number, redraw: () => void): void {
  const cups = savedCups() ?? [];
  if (cups.length <= 1) { notify('Сүүлийн аягыг устгах боломжгүй.'); return; }
  confirmSheet('Аяга устгах', `«${escape(cups[i].name ?? 'Аяга')}» ${number(cups[i].ml)} мл-ийг устгах уу?`, 'Тийм, устгах', () => {
    const [gone] = cups.splice(i, 1);
    if (gone.main) cups[0] = { ...cups[0], main: true };
    writeCups(cups);
    redraw();
  });
}

// Readings arrive about once a second; the number updates in place, and step 2 moves on once still.
let listening = false;
export function bindCalibrate(root: HTMLElement, redraw: () => void): void {
  if (!listening) {
    listening = true;
    window.addEventListener('dusal-scale', () => {
      const box = document.querySelector<HTMLElement>('.cc-live');
      if (!box) return;
      if (!!box.classList.contains('off') === connected()) { redraw(); return; }  // connected or lost
      if (scale.status) samples = [...samples.filter(s => Date.now() - s.at <= STILL_MS * 2), { at: Date.now(), g: scale.status.weightG }];
      const ml = liveMl();
      if (step === 2 && ml !== null && ml >= 10 && still()) { measured = ml; step = 3; redraw(); document.querySelector<HTMLInputElement>('#cc-name')?.focus(); return; }
      if (step === 2) box.querySelector('[data-live]')!.textContent = ml === null ? '—' : `${number(ml)} мл`;
    });
  }
  root.querySelector('[data-act="tare"]')?.addEventListener('click', () => {
    if (!scale.status) return;
    tare = scale.status.weightG; samples = []; step = 2; redraw();
  });
  root.querySelector('[data-act="again"]')?.addEventListener('click', () => { resetCalibration(); redraw(); });
  root.querySelector<HTMLFormElement>('[data-name-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    if (measured) save(measured, root.querySelector<HTMLInputElement>('#cc-name')!.value, redraw);
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
      writeCups((savedCups() ?? []).map((c, j) => { const { main: _main, ...rest } = c; return j === i ? { ...rest, main: true } : rest; }));
      redraw();
    });
  });
}
