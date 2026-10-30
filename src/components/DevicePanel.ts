import { Capacitor } from '@capacitor/core';
import { devices, startDevices, deviceSummary } from '../devices';
import { savedBottles, scale } from '../scale';
import type { ScaleStatus } from '../scale-protocol';
import { escape, number } from '../format';
import { openBaseConnect } from '../base-connect';
import './device-panel.css';

// Profile › «Ухаалаг суурь» and «Суурийн тохиргоо»: the link and the live weight. The bottles, their empty
// weights and the zero are on the «Суурь холбох» card (base-connect.ts), opened from here.
export function BasePanel(): string {
  return '<section class="device-panel" aria-labelledby="scale-title" data-scale-panel></section>';
}

export function DevicePanel(): string {
  return `<section class="device-panel" aria-labelledby="scale-title" data-scale-panel></section>
    <section class="device-panel" aria-labelledby="device-title" data-device-panel></section>`;
}
let listening = false;
export function bindDevicePanel(onMeasurement: () => void): void {
  startDevices();
  if (!listening) {
    window.addEventListener('dusal-device-view', () => { renderPanel(); onMeasurement(); });
    window.addEventListener('dusal-scale', renderScale);
    listening = true;
  }
  renderPanel();
  renderScale();
}

function scaleLine(s: ScaleStatus | null): string {
  if (!s) return '';
  if (!s.calibrated) return 'Суурь калибровк хийгдээгүй байна (Serial Monitor: tare, cal 500).';
  const parts = [`Жин ${number(s.weightG)} г`];
  if (s.phase === 'moving') parts.push('тогтворжиж байна…');
  else if (s.phase === 'empty') parts.push('сав тавиагүй');
  else if (s.remainingMl !== null) parts.push(`үлдсэн ус ${number(s.remainingMl)} мл`);
  else if (!s.bottleSet) parts.push('«Сав ба тэглэх»-ээс хоосон савныхаа жинг авна уу');
  if (s.waiting) parts.push(`илгээгдээгүй уулт ${number(s.waiting)}`);
  return parts.join(' · ');
}

function scaleText(): string {
  const name = escape(scale.name || 'Суурь');
  if (scale.phase === 'unsupported') return 'Android апп эсвэл Chrome хөтчөөр холбогдоно.';
  if (scale.phase === 'connected') return `${name} холбогдсон. Уусан ус автоматаар бүртгэгдэнэ.`;
  if (scale.phase === 'connecting') return `${name}-тай холбогдож байна…`;
  return scale.saved ? `${name} холбогдоогүй байна.` : 'Уусан ус өөрөө бүртгэгдэнэ.';
}

// A bottle standing on the base, in the watch card's round icon.
export const BASE_ICON = '<svg viewBox="0 0 24 24"><rect x="3.5" y="15" width="17" height="5" rx="2"/><path d="M8.5 15V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v6M10.5 7V4.5h3V7"/></svg>';
function scaleButton(): string {
  if (scale.phase === 'unsupported') return '';
  if (scale.phase === 'connected') return '<button type="button" class="scale-forget" data-scale-forget>Салгах</button>';
  if (scale.phase === 'connecting') return '<button type="button" class="hx-blue" disabled>Холбож байна…</button>';
  return scale.saved ? '<button type="button" class="hx-blue" data-scale-retry>Дахин холбох</button>' : '<button type="button" class="hx-blue" data-scale-pair>Суурь холбох</button>';
}

// Rebuilt only when the connection changes; the live line is updated in place every second.
function renderScale(): void {
  const host = document.querySelector<HTMLElement>('[data-scale-panel]');
  if (!host) return;
  const key = [scale.phase, scale.saved, scale.name, scale.message].join('|');
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    const on = scale.phase === 'connected';
    host.innerHTML = `<div class="hx-watch-link scale-link">
        <span class="hx-watch-icon${on ? ' on' : ''}" aria-hidden="true">${BASE_ICON}</span>
        <div><h2 id="scale-title">Ухаалаг суурь</h2><p role="status">${scaleText()}</p></div>
        ${scaleButton()}
      </div>
      <p class="scale-live" data-scale-live></p>
      ${scale.message ? `<p>${escape(scale.message)}</p>` : ''}
      ${scale.saved && !on ? '<div class="scale-actions"><button type="button" data-scale-forget>Салгах</button></div>' : ''}
      ${on ? '<div class="scale-actions"><button type="button" data-scale-bottles>Сав ба тэглэх ›</button><button type="button" data-reset-today>Өнөөдрийн дүнг тэглэх</button></div>' : ''}
      <p class="device-error" role="alert" hidden></p>`;
    // Linking, the bottles and the zero go through the same «Суурь холбох» card as the home tile (base-connect.ts).
    host.querySelectorAll('[data-scale-pair], [data-scale-retry], [data-scale-bottles]').forEach(b => b.addEventListener('click', () => openBaseConnect()));
    host.querySelector('[data-scale-forget]')?.addEventListener('click', () => void act(host, () => scale.forget()));
    host.querySelector('[data-reset-today]')?.addEventListener('click', () => void act(host, () => scale.resetToday()));
  }
  const live = host.querySelector<HTMLElement>('[data-scale-live]')!;
  live.textContent = scale.phase === 'connected' ? scaleLine(scale.status) : '';
  live.hidden = !live.textContent;
}

// The bottle buttons on «Суурь холбох» (base-connect.ts baseBlock): choosing one before putting it on the base
// keeps a swap from counting. `host` also holds the `.device-error` line for a failed command.
export function bindBottles(host: HTMLElement): void {
  host.querySelectorAll<HTMLButtonElement>('[data-bottle]').forEach(b => b.addEventListener('click', () => void act(host, () => scale.chooseBottle(b.dataset.bottle!))));
  host.querySelectorAll<HTMLButtonElement>('[data-bottle-remove]').forEach(b => b.addEventListener('click', () => scale.removeBottle(b.dataset.bottleRemove!)));
  host.querySelector('[data-scale-zero]')?.addEventListener('click', () => void act(host, () => scale.zero()));
  host.querySelector<HTMLFormElement>('[data-bottle-add]')?.addEventListener('submit', event => {
    event.preventDefault();
    const name = new FormData(event.target as HTMLFormElement).get('name');
    void act(host, () => scale.addBottle(typeof name === 'string' ? name : ''));
  });
}

async function act(host: HTMLElement, action: () => Promise<void>): Promise<void> {
  const alert = host.querySelector<HTMLElement>('.device-error')!;
  alert.hidden = true;
  host.querySelectorAll<HTMLButtonElement>('button').forEach(e => { e.disabled = true; });
  try { await action(); }
  catch (error) {
    // Closing the system's device picker is not an error.
    if (error instanceof Error && /cancel/i.test(`${error.name} ${error.message}`)) return;
    alert.hidden = false;
    alert.textContent = Capacitor.isNativePlatform() ? 'Bluetooth асаалттай, апп Bluetooth ашиглах зөвшөөрөлтэй эсэхийг шалгана уу.'
      : 'Компьютерийн Bluetooth асаалттай, Chrome-д Bluetooth ашиглах зөвшөөрөл өгсөн эсэхийг шалгана уу.';
  } finally { host.querySelectorAll<HTMLButtonElement>('button').forEach(e => { e.disabled = false; }); }
}
function renderPanel(): void {
  const host = document.querySelector<HTMLElement>('[data-device-panel]');
  if (!host) return;
  const current = devices.selected;
  const selected = devices.cache.selectedId;
  if (document.activeElement === host.querySelector('select') && host.dataset.selected === (selected ?? '')) return;
  host.dataset.selected = selected ?? '';
  const missing = selected && !current;
  host.innerHTML = `<div class="device-heading"><h2 id="device-title">Миний сав</h2><button type="button" data-device-refresh>Шинэчлэх</button></div>
    <label for="device-select">Ухаалаг суурь</label>
    <select id="device-select"><option value="">Гараар бүртгэх</option>${missing ? `<option selected value="${escape(selected)}">${escape(selected)} · мэдээлэл алга</option>` : ''}${devices.cache.devices.map(d => `<option value="${escape(d.reading.deviceId)}" ${selected === d.reading.deviceId ? 'selected' : ''}>${escape(d.reading.deviceId)}</option>`).join('')}</select>
    <p role="status">${escape(deviceSummary())}</p>
    ${devices.message ? `<p>${escape(devices.message)}</p>` : ''}
    ${!devices.cache.devices.length && devices.phase === 'ready' ? '<p>Хэмжилт илгээсэн сав хараахан алга.</p>' : ''}
    ${current ? `<p class="device-time">Сүүлчийн хэмжилт: ${escape(new Date(current.reading.at).toLocaleString('mn-MN'))}</p>` : ''}
    <p class="device-error" role="alert" hidden></p>`;
  async function act(action: () => Promise<void>) {
    host!.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select').forEach(e => { e.disabled = true; });
    try { await action(); }
    catch (error) {
      const alert = host!.querySelector<HTMLElement>('.device-error')!;
      alert.hidden = false; alert.textContent = error instanceof Error ? error.message : 'Савны сонголтыг хадгалж чадсангүй.';
    } finally { host!.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select').forEach(e => { e.disabled = false; }); }
  }
  host.querySelector<HTMLSelectElement>('#device-select')!.onchange = event => void act(() => devices.select((event.target as HTMLSelectElement).value || null));
  host.querySelector('[data-device-refresh]')!.addEventListener('click', () => void act(() => devices.refresh()));
}
