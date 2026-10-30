import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { scale } from './scale';
import { BASE_ICON } from './components/DevicePanel';
import { escape, number } from './format';

// The "Суурь холбох" card, in the same look as «Цаг холбох» (watch-connect.ts): Bluetooth on, the base
// found in the system's picker, the link made — then says how it went. A remembered base just reconnects.
type Step = 'bt' | 'find' | 'linking' | 'ok' | 'error' | 'unsupported';

const ICON = {
  bt: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>',
};
const btn = (label: string, attr: string, ghost = false) => `<button type="button" class="${ghost ? 'wt-ghost' : 'wt-primary'}" ${attr}>${label}</button>`;
const STAGE: Record<Step, number> = { bt: 0, find: 1, linking: 2, error: 2, unsupported: 1, ok: 3 };
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
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn(missed ? 'Дахин хайх' : scale.saved ? 'Холбох' : 'Хайх', 'data-wt-link')}</div>`;
    case 'linking': return `${dots(step)}<span class="wt-badge busy">${BASE_ICON}</span><h2 id="wt-title">Холбогдож байна…</h2>
      <p>${escape(scale.name || 'Суурь')}-тай холбогдож байна. Түр хүлээнэ үү.</p>`;
    case 'ok': return `${dots(step)}<span class="wt-badge ok pop">${ICON.check}</span><h2 id="wt-title">Амжилттай холбогдлоо!</h2>
      <p>Уусан ус тань автоматаар бүртгэгдэнэ.</p>
      <div class="wt-tiles" data-bc-tiles>${tiles()}</div>
      <div class="wt-actions">${btn('Болсон', 'data-wt-close', true)}${btn('Аяга хэмжүүлэх', 'data-wt-next')}</div>`;
    case 'error': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Холбогдож чадсангүй</h2>
      <p>Суурь асаалттай, утсанд ойрхон байгаа эсэхийг шалгаад дахин оролдоно уу.</p>
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn('Дахин оролдох', 'data-wt-link')}</div>`;
    case 'unsupported': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Энд холбогдохгүй</h2>
      <p>Суурь Дусал Android апп эсвэл Chrome хөтчөөр холбогдоно.</p>
      <div class="wt-actions">${btn('Ойлголоо', 'data-wt-close')}</div>`;
  }
}

// `next` opens «Аягаа хэмжүүлэх» once the base is linked.
export function openBaseConnect(next?: () => void): void {
  document.querySelector('.wt-dim')?.remove();
  const back = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'wt-dim bc-dim';
  box.innerHTML = '<div class="wt-pop" role="dialog" aria-modal="true" aria-labelledby="wt-title"></div>';
  document.body.append(box);
  const pop = box.querySelector<HTMLElement>('.wt-pop')!;
  const native = Capacitor.isNativePlatform();
  let step: Step = scale.phase === 'unsupported' ? 'unsupported' : native ? 'bt' : 'find';
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
    pop.querySelector('[data-wt-next]')?.addEventListener('click', () => { close(); next?.(); });
    pop.querySelector<HTMLElement>('.wt-actions > :last-child')?.focus();
  };
  // The link's outcome comes as a scale event: connecting once picked, then connected, or off when it failed.
  const onScale = () => {
    if (step === 'ok') { const t = pop.querySelector('[data-bc-tiles]'); if (t) t.innerHTML = tiles(); return; }
    if (step === 'find' && scale.phase === 'connecting') show('linking');
    else if (step === 'linking' && scale.phase === 'connected') show('ok');
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
