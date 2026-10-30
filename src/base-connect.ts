import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { savedBottles, scale } from './scale';
import { BASE_ICON, bindBottles } from './components/DevicePanel';
import { notify } from './components/Toast';
import { defaultIcon, readCups, writeCups } from './hydrify';
import { escape, number } from './format';

// The "Суурь холбох" card, in the same look as «Цаг холбох» (watch-connect.ts): Bluetooth on, the base
// found in the system's picker, the link made — then says how it went. A remembered base just reconnects.
// Linked, one thing per page: «Амжилттай холбогдлоо», then either «Шууд уух» (skip the bottle's weight; the
// base still counts each drink by what it loses) or «Саваа таниулах» (the bottles).
type Step = 'bt' | 'find' | 'linking' | 'ok' | 'bottles' | 'error' | 'unsupported';
const LINKED: Step[] = ['ok', 'bottles'];

const ICON = {
  bt: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>',
};
const btn = (label: string, attr: string, ghost = false) => `<button type="button" class="${ghost ? 'wt-ghost' : 'wt-primary'}" ${attr}>${label}</button>`;
const STAGE: Record<Step, number> = { bt: 0, find: 1, linking: 2, error: 2, unsupported: 1, ok: 3, bottles: 3 };
const dots = (step: Step) => `<ol class="wt-dots" aria-label="${Math.min(3, STAGE[step] + 1)} / 3">${[0, 1, 2].map(i => `<li class="${i < STAGE[step] ? 'done' : i === STAGE[step] ? 'on' : ''}"></li>`).join('')}</ol>`;
// The picker closed without the base: say why that happens, on a phone or a computer.
const tips = () => (Capacitor.isNativePlatform()
  ? ['Суурь асаалттай, утаснаас 1–2 м дотор байна уу', 'Суурь өөр утас, компьютерт холбогдоогүй байна уу', 'Утасны Bluetooth болон Байршил асаалттай юу']
  : ['Суурь асаалттай, компьютерт ойрхон байна уу', 'Суурь утсанд холбогдсон бол утсан дээрээ «Салгах»-ыг дарна уу', 'Chrome-д Bluetooth ашиглах зөвшөөрөл өгсөн үү'])
  .map(t => `<li>${t}</li>`).join('');

// The base's first reading comes a moment after the link; the tiles fill in place.
function tiles(): string {
  const s = scale.status;
  const tile = (label: string, value: string) => `<div><b>${value}</b><small>${label}</small></div>`;
  return `${tile('жин, г', s ? number(s.weightG) : '—')}${tile('савны ус, мл', s?.remainingMl != null ? number(s.remainingMl) : '—')}${tile('илгээгээгүй', s ? number(s.waiting) : '—')}`;
}
// Over the bottles: whether the base knows the bottle on it now, so choosing one shows its water right away.
function liveLine(): string {
  const s = scale.status;
  if (!s) return 'Суурийн жинг уншиж байна…';
  if (s.remainingMl != null) return `Саванд <b>${number(s.remainingMl)} мл</b> ус байна`;
  if (s.phase === 'moving') return 'Жин тогтворжиж байна…';
  if (s.phase === 'empty') return 'Суурин дээр сав алга';
  return 'Энэ савыг таниулаагүй байна';
}

// Linked: the saved bottles with their empty weights (tap one before putting it on the base), a new one weighed
// empty, and the zero for an empty base — what the base's BOOT button does. Buttons: DevicePanel.ts bindBottles.
// Kept short: the list, then «+ Шинэ сав нэмэх» that opens the name field only when wanted (open from the
// start while there is none), and the zero as a small link last. Redrawn when a command answers or the
// bottles change, not while a name is typed.
let adding = false;

// A bottle just weighed empty is then filled the way it is drunk and put back: «Хэмжих» saves its water as a
// cup of the same name (Profile › «Миний аяганууд»), so naming the bottle names the cup too.
const MIN_CUP_ML = 10;
function fillMl(): number | null {
  const s = scale.status, bottle = scale.addedBottle;
  return s && bottle && s.phase === 'present' ? Math.max(0, s.weightG - bottle.grams) : null;
}
const canFill = () => (fillMl() ?? 0) >= MIN_CUP_ML;
const fillText = () => { const ml = fillMl(); return ml !== null ? `${number(ml)} мл` : scale.status?.phase === 'moving' ? 'Тогтворжиж байна…' : '— мл'; };
function fillBlock(name: string, grams: number): string {
  return `<div class="bc-fill">
      <p class="bc-hint"><b>«${escape(name)}»</b> хадгалагдлаа (${number(grams)} г). Одоо ердийнхөөрөө дүүргээд буцааж тавина уу: хэдэн мл багтдагийг аяга болгон тэмдэглэнэ.</p>
      <div class="bc-cup-live"><b data-fill-live>${fillText()}</b><small>Саван дахь ус</small></div>
      <div class="bc-fill-actions">${btn('Алгасах', 'data-fill-skip', true)}${btn('Хэмжих', `data-fill-save ${canFill() ? '' : 'disabled'}`)}</div>
    </div>`;
}
function saveCup(ml: number, name: string): void {
  const cups = readCups();
  writeCups([...cups, { ml, icon: defaultIcon(ml), name: name.slice(0, 24), ...(cups.some(c => c.main) ? {} : { main: true }) }]);
  notify(`«${name}» аяга ${number(ml)} мл хадгалагдлаа.`);
}

function baseBlock(): string {
  const added = scale.addedBottle;
  if (added) return `${fillBlock(added.name, added.grams)}<p class="device-error bc-error" role="alert" hidden></p>`;
  const { list, selected } = savedBottles();
  const rows = list.map(b => `<li class="bc-row${b.id === selected ? ' on' : ''}">
      <button type="button" class="bc-pick" data-bottle="${escape(b.id)}" aria-pressed="${b.id === selected}">
        <span class="bc-icon" aria-hidden="true">${b.id === selected ? ICON.check : BASE_ICON}</span>
        <span class="bc-name"><b>${escape(b.name)}</b>${b.id === selected ? '<small>Суурин дээр</small>' : ''}</span>
        <span class="bc-grams">${number(b.grams)} г</span></button>
      <button type="button" class="bc-remove" data-bottle-remove="${escape(b.id)}" aria-label="${escape(b.name)}-г устгах">×</button></li>`).join('');
  const form = adding || !list.length;
  return `${list.length ? `<ul class="bc-list">${rows}</ul>` : ''}
    ${form ? `<form class="bc-add" data-bottle-add data-transient>
      <p class="bc-hint">Хоосон саваа суурин дээр тавиад нэр өгнө үү.</p>
      <label class="visually-hidden" for="bc-bottle-name">Савны нэр</label>
      <div><input id="bc-bottle-name" name="name" maxlength="24" placeholder="Савны нэр" autocomplete="off">
      <button type="submit" class="wt-ghost">Жинлэх</button></div>
    </form>` : '<button type="button" class="bc-add-row" data-bc-adding>+ Шинэ сав нэмэх</button>'}
    ${scale.result ? `<p class="bc-result" role="status">${escape(scale.result)}</p>` : ''}
    <p class="device-error bc-error" role="alert" hidden></p>`;
}
const baseKey = () => [scale.result, JSON.stringify(savedBottles()), adding, scale.addedBottle?.id].join('|');
function renderBase(pop: HTMLElement, force = false): void {
  const host = pop.querySelector<HTMLElement>('[data-bc-base]');
  if (!host || (!force && (host.dataset.key === baseKey() || document.activeElement === host.querySelector('#bc-bottle-name')))) return;
  host.dataset.key = baseKey();
  if (!force) host.innerHTML = baseBlock();
  bindBottles(host);
  host.querySelector('[data-bc-adding]')?.addEventListener('click', () => {
    adding = true;
    renderBase(pop);
    host.querySelector<HTMLInputElement>('#bc-bottle-name')?.focus();
  });
  // Weighed: the field folds away again once the base answers.
  host.querySelector('[data-bottle-add]')?.addEventListener('submit', () => { adding = false; (document.activeElement as HTMLElement | null)?.blur(); });
  const done = () => { scale.addedBottle = null; renderBase(pop); pop.querySelector('[data-bc-live]')?.removeAttribute('hidden'); };
  host.querySelector('[data-fill-skip]')?.addEventListener('click', done);
  host.querySelector('[data-fill-save]')?.addEventListener('click', () => {
    const ml = fillMl(), bottle = scale.addedBottle;
    if (ml === null || ml < MIN_CUP_ML || !bottle) return;
    saveCup(ml, bottle.name);
    scale.result = `«${bottle.name}»: ${number(bottle.grams)} г сав, ${number(ml)} мл аяга ✓`;
    done();
  });
}
// Each reading while a new bottle is filled: its water and whether «Хэмжих» can be pressed, in place.
function renderFill(pop: HTMLElement): void {
  const live = pop.querySelector('[data-fill-live]');
  if (live) live.textContent = fillText();
  const save = pop.querySelector<HTMLButtonElement>('[data-fill-save]');
  if (save) save.disabled = !canFill();
}

// A remembered base is all «Холбох» reaches; this forgets it and opens the system's list of bases nearby,
// so another base (or the same one after a reset) can be picked.
const other = () => (scale.saved ? '<div class="bc-zero"><button type="button" data-wt-other>Өөр суурь хайх</button></div>' : '');

function body(step: Step, btOn: boolean | null, missed: boolean): string {
  switch (step) {
    case 'bt': return `${dots(step)}<span class="wt-badge${btOn ? ' ok' : ''}">${btOn ? ICON.check : ICON.bt}</span>
      <h2 id="wt-title">${btOn ? 'Bluetooth асаалттай' : 'Bluetooth асаах'}</h2>
      <p>${btOn ? 'Дараагийн алхам руу шилжиж байна…' : 'Суурь утастай Bluetooth-ээр холбогддог. Эхлээд утасныхаа Bluetooth-ийг асаана уу.'}</p>
      <div class="wt-actions">${btOn ? '' : `${btn('Хаах', 'data-wt-close', true)}${btn('Bluetooth асаах', 'data-wt-bt')}`}</div>`;
    case 'find': return `${dots(step)}<span class="wt-badge${missed ? ' warn' : ''}">${missed ? ICON.warn : BASE_ICON}</span>
      <h2 id="wt-title">${missed ? 'Суурь олдсонгүй' : scale.saved ? 'Суурь холбох' : 'Суурь хайх'}</h2>
      ${missed ? `<ul class="wt-steps bc-tips">${tips()}</ul>`
        : `<p>${scale.saved ? `<b>${escape(scale.name || 'Суурь')}</b>-тай дахин холбогдоно.` : 'Суурийг асаагаад утсандаа ойртуулна уу. Гарч ирэх жагсаалтаас «Dusal»-ыг сонгоно.'}</p>`}
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn(missed ? 'Дахин хайх' : scale.saved ? 'Холбох' : 'Хайх', 'data-wt-link')}</div>${other()}`;
    case 'linking': return `${dots(step)}<span class="wt-badge busy">${BASE_ICON}</span><h2 id="wt-title">Холбогдож байна…</h2>
      <p>${escape(scale.name || 'Суурь')}-тай холбогдож байна. Түр хүлээнэ үү.</p>
      ${scale.saved ? `<div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}</div>${other()}` : ''}`;
    case 'ok': return `${dots(step)}<span class="wt-badge ok pop">${ICON.check}</span><h2 id="wt-title">Амжилттай холбогдлоо!</h2>
      <p>Уусан ус тань автоматаар бүртгэгдэнэ.</p>
      <div class="wt-tiles" data-bc-tiles>${tiles()}</div>
      <p class="wt-note">Саваа таниулбал саванд хэдэн мл ус байгааг харуулна. Шууд уувал суурь уусныг тань тоолсоор байна.</p>
      <div class="wt-actions">${btn('Шууд уух', 'data-wt-close', true)}${btn('Саваа таниулах', 'data-wt-bottles')}</div>`;
    case 'bottles': return `<h2 id="wt-title">Саваа таниулах</h2>
      <p>Суурин дээр тавьсан саваа сонгоно уу.</p>
      <p class="bc-live" data-bc-live ${scale.addedBottle ? 'hidden' : ''}>${liveLine()}</p>
      <section class="bc-base" data-bc-base aria-label="Савнууд">${baseBlock()}</section>
      <div class="wt-actions">${btn('Болсон', 'data-wt-close')}</div>
      <div class="bc-zero" data-bc-zero><span><button type="button" data-scale-zero>Суурийг тэглэх</button><button type="button" data-bc-unlink>Суурийг салгах</button></span><p class="device-error bc-error" role="alert" hidden></p></div>`;
    case 'error': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Холбогдож чадсангүй</h2>
      <p>Суурь асаалттай, утсанд ойрхон байгаа эсэхийг шалгаад дахин оролдоно уу.</p>
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn('Дахин оролдох', 'data-wt-link')}</div>${other()}`;
    case 'unsupported': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Энд холбогдохгүй</h2>
      <p>Суурь Дусал Android апп эсвэл Chrome хөтчөөр холбогдоно.</p>
      <div class="wt-actions">${btn('Ойлголоо', 'data-wt-close')}</div>`;
  }
}

export function openBaseConnect(): void {
  document.querySelector('.wt-dim')?.remove();
  const back = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'wt-dim bc-dim';
  box.innerHTML = '<div class="wt-pop" role="dialog" aria-modal="true" aria-labelledby="wt-title"></div>';
  document.body.append(box);
  const pop = box.querySelector<HTMLElement>('.wt-pop')!;
  const native = Capacitor.isNativePlatform();
  // Already linked (the home tile, the base's settings): straight to the bottles.
  let step: Step = scale.phase === 'unsupported' ? 'unsupported' : scale.phase === 'connected' ? 'bottles' : native ? 'bt' : 'find';
  let btOn: boolean | null = null;
  let missed = false;
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('dusal-scale', onScale);
    back?.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'linking') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box && step !== 'linking') close(); });

  const show = (s: Step) => {
    step = s;
    pop.innerHTML = body(step, btOn, missed);
    pop.querySelector('[data-wt-close]')?.addEventListener('click', close);
    pop.querySelector('[data-wt-bt]')?.addEventListener('click', () => void turnOnBt());
    pop.querySelector('[data-wt-link]')?.addEventListener('click', () => void link());
    pop.querySelector('[data-wt-other]')?.addEventListener('click', () => void findOther());
    pop.querySelector('[data-wt-bottles]')?.addEventListener('click', () => show('bottles'));
    renderBase(pop, true);
    const zero = pop.querySelector<HTMLElement>('[data-bc-zero]');
    if (zero) bindBottles(zero);
    // «Суурийг салгах»: this phone lets the base go (another phone can link it) and the card closes.
    pop.querySelector('[data-bc-unlink]')?.addEventListener('click', () => { close(); void scale.forget(); });
    pop.scrollTop = 0;
    pop.querySelector<HTMLElement>('.wt-actions > :last-child')?.focus();
  };
  // The link's outcome comes as a scale event: connecting once picked, then connected, or off when it failed.
  const onScale = () => {
    if (LINKED.includes(step)) {
      const t = pop.querySelector('[data-bc-tiles]');
      if (t) t.innerHTML = tiles();
      // While a new bottle is filled its own number shows the water, so the line above steps aside.
      const live = pop.querySelector<HTMLElement>('[data-bc-live]');
      if (live && live.innerHTML !== liveLine()) live.innerHTML = liveLine();
      if (live) live.hidden = !!scale.addedBottle;
      renderBase(pop);
      renderFill(pop);
      return;
    }
    // Linked at any step, also by the app reconnecting a remembered base on its own.
    if (scale.phase === 'connected' && step !== 'unsupported') show('ok');
    else if (step === 'find' && scale.phase === 'connecting') show('linking');
    else if (step === 'linking' && scale.phase === 'off') show('error');
  };
  window.addEventListener('dusal-scale', onScale);

  const checkBt = async () => {
    try { await BleClient.initialize({ androidNeverForLocation: true }); btOn = await BleClient.isEnabled(); } catch { btOn = null; }
  };
  const btDone = () => { show('bt'); if (btOn) setTimeout(() => { if (step === 'bt' && box.isConnected) show('find'); }, 900); };
  const turnOnBt = async () => {
    try { await BleClient.requestEnable(); } catch { /* the user said no */ }
    await checkBt();
    if (step === 'bt') btDone();
  };
  // «Өөр суурь хайх»: the remembered base goes (on «Хайх» first, so its link dropping is not read as a
  // failed link), then the picker opens as for a first base.
  const findOther = async () => {
    step = 'find';
    await scale.forget();
    missed = false;
    show('find');
    void link();
  };
  const link = async () => {
    missed = false;
    if (scale.saved) {
      show('linking');
      if (scale.phase === 'connected') show('ok');
      else if (scale.phase === 'off') scale.reconnect();
      return;
    }
    try {
      await scale.pair();
      show(scale.phase === 'connected' ? 'ok' : 'error');
    } catch (error) {
      // Closing the picker is not an error: the base was not in it.
      missed = error instanceof Error && /cancel/i.test(`${error.name} ${error.message}`);
      show(missed ? 'find' : 'error');
    }
  };

  show(step);
  if (step === 'bt') void checkBt().then(() => { if (step === 'bt') btDone(); });
}
