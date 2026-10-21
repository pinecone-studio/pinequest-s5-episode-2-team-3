import { devices, startDevices, deviceSummary } from '../devices';
import { escape } from '../format';
import './device-panel.css';

export function DevicePanel(): string { return '<section class="device-panel" aria-labelledby="device-title" data-device-panel></section>'; }
let listening = false;
export function bindDevicePanel(onMeasurement: () => void): void {
  startDevices();
  if (!listening) {
    window.addEventListener('dusal-device-view', () => { renderPanel(); onMeasurement(); });
    listening = true;
  }
  renderPanel();
}
function renderPanel(): void {
  const host = document.querySelector<HTMLElement>('[data-device-panel]');
  if (!host) return;
  const current = devices.selected;
  const selected = devices.cache.selectedId;
  if (document.activeElement === host.querySelector('select') && host.dataset.selected === (selected ?? '')) return;
  host.dataset.selected = selected ?? '';
  const missing = selected && !current;
  const warning = current?.outcome === 'resync' ? 'Хэмжилт удаан тасарсан тул үлдэгдлийг дахин таарууллаа. Завсарт уусан хэмжээг автоматаар тооцоогүй; шаардлагатай бол гараар бүртгэнэ үү.' : '';
  host.innerHTML = `<div class="device-heading"><h2 id="device-title">Миний сав</h2><button type="button" data-device-refresh>Шинэчлэх</button></div>
    <label for="device-select">Хэмжилт авах сав</label>
    <select id="device-select"><option value="">Гараар бүртгэх</option>${missing ? `<option selected value="${escape(selected)}">${escape(selected)} · мэдээлэл алга</option>` : ''}${devices.cache.devices.map(d => `<option value="${escape(d.reading.deviceId)}" ${selected === d.reading.deviceId ? 'selected' : ''}>${escape(d.reading.deviceId)} · ${d.reading.capacityMl} мл</option>`).join('')}</select>
    <p role="status">${escape(deviceSummary())}</p>
    ${devices.message ? `<p>${escape(devices.message)}</p>` : ''}
    ${!devices.cache.devices.length && devices.phase === 'ready' ? '<p>Хэмжилт илгээсэн сав хараахан алга.</p>' : ''}
    ${current ? `<p class="device-time">Сүүлчийн хэмжилт: ${escape(new Date(current.reading.at).toLocaleString('mn-MN'))}</p>` : ''}
    ${warning ? `<p class="device-warning" role="alert">${warning}</p>` : ''}
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
