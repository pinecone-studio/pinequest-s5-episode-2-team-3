import { health, healthSupported } from '../health';
import { escape, number } from '../format';
import { openWatchConnect } from '../watch-connect';
import './device-panel.css';

// Settings card for a smartwatch read through Health Connect. Linking works only in the Android app;
// elsewhere the card says how to link the watch there.
export function WatchPanel(): string {
  if (!healthSupported()) {
    return `<section class="device-panel" aria-labelledby="watch-title"><div class="device-heading"><h2 id="watch-title">Ухаалаг цаг</h2></div>
      <p>Galaxy Watch-ийг Дусал Android апп-аас холбоно: Профайл → Холбосон бүртгэл → «Цагтай холбох». Алхам, зүрхний цохилт, калори нь Health Connect-ээр ирнэ.</p></section>`;
  }
  return '<section class="device-panel" aria-labelledby="watch-title" data-watch-panel></section>';
}

let listening = false;
export function bindWatchPanel(): void {
  if (!healthSupported()) return;
  if (!listening) {
    window.addEventListener('dusal-health', renderWatch);
    listening = true;
  }
  renderWatch();
  void health.start();
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' });

function statusText(): string {
  switch (health.phase) {
    case 'missing': return 'Health Connect олдсонгүй. Android 14-өөс доош хувилбарт Play Store-оос «Health Connect» суулгана уу.';
    case 'denied': return 'Health Connect-д зөвшөөрөл өгөөгүй байна.';
    case 'on': return 'Цагтай холбогдсон. Samsung Health-ээр дамжиж ирсэн өнөөдрийн мэдээлэл:';
    default: return 'Galaxy Watch эсвэл өөр ухаалаг цагны зүрхний цохилт, алхам, калорийг Health Connect-ээс уншина.';
  }
}

function dayLines(): string {
  const d = health.day;
  if (health.phase !== 'on' || !d) return '';
  const row = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<dl class="watch-day">
    ${row('Зүрхний цохилт', d.heart ? `${number(d.heart.bpm)} bpm <small>${escape(clock(d.heart.at))}</small>` : '—')}
    ${row('Алхам', d.steps === null ? '—' : number(d.steps))}
    ${row('Идэвхтэй калори', d.activeKcal === null ? '—' : `${number(d.activeKcal)} ккал`)}
  </dl>`;
}

function renderWatch(): void {
  const host = document.querySelector<HTMLElement>('[data-watch-panel]');
  if (!host) return;
  const buttons = health.phase === 'on'
    ? '<button type="button" data-watch-refresh>Шинэчлэх</button><button type="button" data-watch-off>Салгах</button>'
    : health.phase === 'off' || health.phase === 'denied' ? '<button type="button" data-watch-on>Цагтай холбох</button>' : '';
  host.innerHTML = `<div class="device-heading"><h2 id="watch-title">Ухаалаг цаг</h2></div>
    <p role="status">${statusText()}</p>
    ${dayLines()}
    ${health.message ? `<p>${escape(health.message)}</p>` : ''}
    ${buttons ? `<div class="scale-actions">${buttons}</div>` : ''}
    <p class="device-error" role="alert" hidden></p>`;
  const act = async (action: () => Promise<void> | void) => {
    const alert = host.querySelector<HTMLElement>('.device-error')!;
    alert.hidden = true;
    host.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    try { await action(); }
    catch {
      alert.hidden = false;
      alert.textContent = 'Health Connect-тэй холбогдож чадсангүй. Дахин оролдоно уу.';
    } finally { host.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); }
  };
  host.querySelector('[data-watch-on]')?.addEventListener('click', openWatchConnect);
  host.querySelector('[data-watch-refresh]')?.addEventListener('click', () => void act(() => health.refresh()));
  host.querySelector('[data-watch-off]')?.addEventListener('click', () => void act(() => health.disconnect()));
}
