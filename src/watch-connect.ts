import { registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { health } from './health';
import { escape, number } from './format';

// The "Цаг холбох" card: opens over the home and walks through linking a watch in three steps —
// Bluetooth on, the watch paired with the phone (Galaxy Wearable), Health Connect permission — then
// says how it went. Only the last step reads anything: the app never talks to the watch itself.
type Step = 'bt' | 'pair' | 'hc' | 'asking' | 'ok' | 'denied' | 'missing' | 'error';

const ICON = {
  bt: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
  watch: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 9v3l2 1"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M7 12h3l1.5-2.5 2 5L15 12h2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>',
};
const STORE = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;
const WEARABLE = 'com.samsung.android.app.watchmanager';
// Opens Galaxy Wearable, or its Play Store page when it is not installed (AppLaunchPlugin.java).
const AppLaunch = registerPlugin<{ open(options: { package: string }): Promise<{ installed: boolean }> }>('AppLaunch');
// A watch already paired with the phone skips the pairing step; Bluetooth names say what they are.
const isWatch = (name: string | undefined) => !!name && /watch|gear|fit|band|wear|ticwatch|pixel/i.test(name);

const btn = (label: string, attr: string, ghost = false) => `<button type="button" class="${ghost ? 'wt-ghost' : 'wt-primary'}" ${attr}>${label}</button>`;
// Which of the three steps a screen belongs to, for the progress dots.
const STAGE: Record<Step, number> = { bt: 0, pair: 1, hc: 2, asking: 2, denied: 2, missing: 2, error: 2, ok: 3 };
const dots = (step: Step) => `<ol class="wt-dots" aria-label="${Math.min(3, STAGE[step] + 1)} / 3">${[0, 1, 2].map(i => `<li class="${i < STAGE[step] ? 'done' : i === STAGE[step] ? 'on' : ''}"></li>`).join('')}</ol>`;

function body(step: Step, btOn: boolean | null, watch: string | null): string {
  const app = health.phase !== 'unsupported';
  switch (step) {
    case 'bt': return `${dots(step)}<span class="wt-badge${btOn ? ' ok' : ''}">${btOn ? ICON.check : ICON.bt}</span>
      <h2 id="wt-title">${btOn ? 'Bluetooth асаалттай' : 'Bluetooth асаах'}</h2>
      <p>${btOn ? 'Дараагийн алхам руу шилжиж байна…' : 'Цаг утастай Bluetooth-ээр холбогддог. Эхлээд утасныхаа Bluetooth-ийг асаана уу.'}</p>
      <div class="wt-actions">${btOn && app ? '' : btn('Хаах', 'data-wt-close', true)}${btOn ? '' : app ? btn('Bluetooth асаах', 'data-wt-bt') : btn('Дараах', 'data-wt-next="pair"')}</div>`;
    case 'pair': return `${dots(step)}<span class="wt-badge${watch ? ' ok' : ''}">${watch ? ICON.check : ICON.watch}</span>
      <h2 id="wt-title">${watch ? 'Цаг олдлоо' : 'Цагаа холбох'}</h2>
      <p>${watch ? `<b>${escape(watch)}</b> утастай холбогдсон байна.` : 'Galaxy Wearable аппаар цагаа утастай холбоод энд буцаж ирнэ үү. Дараагийн алхам өөрөө нээгдэнэ.'}</p>
      <div class="wt-actions">${watch ? btn('Дараах', 'data-wt-next="hc"') : app ? btn('Galaxy Wearable нээх', 'data-wt-wear') : btn('Дараах', 'data-wt-next="hc"')}</div>`;
    case 'hc': return `${dots(step)}<span class="wt-badge">${ICON.heart}</span><h2 id="wt-title">Зөвшөөрөл өгөх</h2>
      <p>${app ? 'Health Connect нээгдэхэд <b>«Бүгдийг зөвшөөрөх»</b>-ийг асаагаад <b>«Зөвшөөрөх»</b> дарна уу.' : 'Энэ алхам зөвхөн Дусал Android апп дээр ажиллана.'}</p>
      <div class="wt-actions">${app ? btn('Зөвшөөрөл өгөх', 'data-wt-link') : btn('Ойлголоо', 'data-wt-close')}</div>`;
    case 'asking': return `${dots(step)}<span class="wt-badge busy">${ICON.heart}</span><h2 id="wt-title">Холбогдож байна…</h2>
      <p>Health Connect-ийн цонхонд «Бүгдийг зөвшөөрөх»-ийг асаагаад «Зөвшөөрөх» дарна уу.</p>`;
    case 'ok': {
      const d = health.day;
      const tile = (label: string, value: string) => `<div><b>${value}</b><small>${label}</small></div>`;
      return `${dots(step)}<span class="wt-badge ok pop">${ICON.check}</span><h2 id="wt-title">Амжилттай холбогдлоо!</h2>
        <p>Цагны өнөөдрийн мэдээлэл нүүр хуудсанд харагдана.</p>
        <div class="wt-tiles">${tile('алхам', d?.steps != null ? number(d.steps) : '—')}${tile('уд/мин', d?.heart ? String(d.heart.bpm) : '—')}${tile('ккал', d?.activeKcal != null ? number(d.activeKcal) : '—')}</div>
        ${health.message ? `<p class="wt-note">${health.message}</p>` : ''}
        <div class="wt-actions">${btn('Болсон', 'data-wt-close')}</div>`;
    }
    case 'denied': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Зөвшөөрөл өгөөгүй</h2>
      <p>Цагны мэдээллийг уншихын тулд Health Connect-д зөвшөөрөл хэрэгтэй.</p>
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn('Дахин оролдох', 'data-wt-link')}</div>`;
    case 'missing': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Health Connect олдсонгүй</h2>
      <p>Play Store-оос «Health Connect» суулгаад дахин оролдоно уу.</p>
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}<a class="wt-primary" href="${STORE('com.google.android.apps.healthdata')}" target="_blank" rel="noopener">Суулгах</a></div>`;
    case 'error': return `${dots(step)}<span class="wt-badge warn">${ICON.warn}</span><h2 id="wt-title">Холбогдож чадсангүй</h2>
      <p>Health Connect хариу өгсөнгүй. Аппаа шинэчлээд дахин оролдоно уу.</p>
      <div class="wt-actions">${btn('Хаах', 'data-wt-close', true)}${btn('Дахин оролдох', 'data-wt-link')}</div>`;
  }
}

export function openWatchConnect(): void {
  document.querySelector('.wt-dim')?.remove();
  const box = document.createElement('div');
  box.className = 'wt-dim';
  box.innerHTML = '<div class="wt-pop" role="dialog" aria-modal="true" aria-labelledby="wt-title"></div>';
  document.body.append(box);
  const pop = box.querySelector<HTMLElement>('.wt-pop')!;
  const app = health.phase !== 'unsupported';
  let step: Step = 'bt';
  let btOn: boolean | null = null;
  let watch: string | null = null;
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onBack); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'asking') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box && step !== 'asking') close(); });

  const show = (next: Step) => {
    step = next;
    pop.innerHTML = body(step, btOn, watch);
    pop.querySelector('[data-wt-close]')?.addEventListener('click', close);
    pop.querySelectorAll<HTMLElement>('[data-wt-next]').forEach(b => b.addEventListener('click', () => show(b.dataset.wtNext as Step)));
    pop.querySelector('[data-wt-bt]')?.addEventListener('click', () => void turnOnBt());
    pop.querySelector('[data-wt-link]')?.addEventListener('click', () => void link());
    pop.querySelector('[data-wt-wear]')?.addEventListener('click', () => { leftFor = 'pair'; AppLaunch.open({ package: WEARABLE }).catch(() => { location.href = STORE(WEARABLE); }); });
    pop.querySelector<HTMLElement>('.wt-actions > :last-child')?.focus();
  };
  const checkBt = async () => {
    try { await BleClient.initialize({ androidNeverForLocation: true }); btOn = await BleClient.isEnabled(); } catch { btOn = null; }
  };
  const findWatch = async () => {
    try { watch = (await BleClient.getBondedDevices()).find(d => isWatch(d.name))?.name ?? null; } catch { watch = null; }
  };
  // Each step moves on by itself once it is done: Bluetooth on, a watch paired, permission given.
  const after = (ms: number, from: Step, next: () => void) => setTimeout(() => { if (step === from && box.isConnected) next(); }, ms);
  const toPair = async () => {
    await findWatch();
    show('pair');
    if (watch) after(1200, 'pair', () => show('hc'));
  };
  const btDone = () => { show('bt'); if (btOn) after(900, 'bt', () => void toPair()); };
  const turnOnBt = async () => {
    try { await BleClient.requestEnable(); } catch { /* the user said no */ }
    await checkBt();
    if (step === 'bt') btDone();
  };
  // Back from Galaxy Wearable: the watch is paired (or the user gave up there), so permission is next.
  let leftFor: Step | null = null;
  const onBack = () => {
    if (document.hidden || leftFor !== step) return;
    leftFor = null;
    void findWatch().then(() => show('hc'));
  };
  document.addEventListener('visibilitychange', onBack);
  const link = async () => {
    show('asking');
    try {
      await health.connect();
      show(health.phase === 'on' ? 'ok' : health.phase === 'missing' ? 'missing' : 'denied');
    } catch {
      show('error');
    }
  };

  show('bt');
  if (app) void checkBt().then(() => { if (step === 'bt') btDone(); });
}
