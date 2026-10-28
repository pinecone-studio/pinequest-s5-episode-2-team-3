import { devices, startDevices, deviceSummary } from '../devices';
import { savedBottles, scale } from '../scale';
import type { ScaleStatus } from '../scale-protocol';
import { escape, number } from '../format';
import './device-panel.css';

// Just the Bluetooth base (its bottles, tare and resets) for the home, next to what it counts.
// `compact` (the limit home): once connected it folds to one row with the bottle's water.
export function ScalePanel(compact = false): string {
  return `<section class="device-panel" aria-labelledby="scale-title" data-scale-panel${compact ? ' data-compact' : ''}></section>`;
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
  else if (!s.bottleSet) parts.push('хоосон саваа тавиад суурийн BOOT товчийг дарна уу');
  if (s.waiting) parts.push(`илгээгдээгүй уулт ${number(s.waiting)}`);
  return parts.join(' · ');
}

function scaleText(): string {
  const name = escape(scale.name || 'Суурь');
  if (scale.phase === 'unsupported') return 'Android апп эсвэл Chrome хөтчөөр холбогдоно.';
  if (scale.phase === 'connected') return `${name} холбогдсон. Уусан ус автоматаар бүртгэгдэнэ.`;
  if (scale.phase === 'connecting') return `${name}-тай холбогдож байна…`;
  return scale.saved ? `${name} холбогдоогүй байна.` : 'Сууриа асаагаад утсандаа ойртуулна уу.';
}

// Each bottle keeps its empty weight; choosing one before putting it on the base keeps a swap from counting.
// These do what the base's BOOT button does, for a base sealed in its case.
function bottlesBlock(): string {
  const { list, selected } = savedBottles();
  return `<div class="scale-bottles">
    ${list.length ? `<p class="device-time">Саваа солихдоо эхлээд энд сонгоод, дараа нь суурь дээр тавина.</p>
    <div class="bottle-list">${list.map(b => `<span class="bottle-chip${b.id === selected ? ' on' : ''}">
      <button type="button" data-bottle="${escape(b.id)}" aria-pressed="${b.id === selected}">${escape(b.name)} · ${number(b.grams)} г</button>
      <button type="button" class="bottle-remove" data-bottle-remove="${escape(b.id)}" aria-label="${escape(b.name)}-г устгах">×</button></span>`).join('')}</div>` : ''}
    <form class="bottle-add" data-bottle-add data-transient>
      <label for="bottle-name">Шинэ сав</label>
      <div><input id="bottle-name" name="name" maxlength="24" placeholder="Нэр, жишээ нь: Цэнхэр сав" autocomplete="off">
      <button type="submit">Хоосон жинг авах</button></div>
    </form>
    <p class="device-time">${scale.result ? `<b>${escape(scale.result)}</b>` : 'Шинэ савыг хоосноор нь суурь дээр тавиад нэр өгч «Хоосон жинг авах»-г дарна.'}</p>
    <div class="scale-actions"><button type="button" data-reset-today>Өнөөдрийн дүнг тэглэх</button><button type="button" data-scale-zero>Суурийн жинг тэглэх</button></div>
  </div>`;
}

// Rebuilt only when the connection, the bottles or a command result change; the live line is updated in
// place every second.
function renderScale(): void {
  const host = document.querySelector<HTMLElement>('[data-scale-panel]');
  if (!host) return;
  const compact = host.hasAttribute('data-compact') && scale.phase === 'connected';
  host.classList.toggle('compact', compact);
  if (compact) {
    if (host.dataset.key !== 'compact') {
      host.dataset.key = 'compact';
      host.innerHTML = `<h2 id="scale-title" class="visually-hidden">Bluetooth суурь</h2><p class="scale-row"><i aria-hidden="true"></i><span>Ухаалаг суурь холбогдсон</span><small data-scale-live></small></p>`;
    }
    const ml = scale.status?.remainingMl;
    host.querySelector('[data-scale-live]')!.textContent = ml != null ? `Сав: ${number(ml)} мл` : '';
    return;
  }
  const key = [scale.phase, scale.saved, scale.name, scale.message, scale.result, JSON.stringify(savedBottles())].join('|');
  // Do not wipe a bottle name while it is being typed.
  if (host.dataset.key !== key && document.activeElement !== host.querySelector('#bottle-name')) {
    host.dataset.key = key;
    const buttons = scale.phase === 'unsupported' ? '' : scale.phase === 'off' && !scale.saved
      ? '<button type="button" data-scale-pair>Суурь хайх</button>'
      : `${scale.phase === 'off' ? '<button type="button" data-scale-retry>Дахин холбох</button>' : ''}<button type="button" data-scale-forget>Салгах</button>`;
    host.innerHTML = `<div class="device-heading"><h2 id="scale-title">Bluetooth суурь</h2></div>
      <p role="status">${scaleText()}</p>
      <p class="scale-live" data-scale-live></p>
      ${scale.message ? `<p>${escape(scale.message)}</p>` : ''}
      ${buttons ? `<div class="scale-actions">${buttons}</div>` : ''}
      ${scale.phase === 'connected' ? bottlesBlock() : ''}
      <p class="device-error" role="alert" hidden></p>`;
    host.querySelector('[data-scale-pair]')?.addEventListener('click', () => void act(host, () => scale.pair()));
    host.querySelector('[data-scale-retry]')?.addEventListener('click', () => scale.reconnect());
    host.querySelector('[data-scale-forget]')?.addEventListener('click', () => void act(host, () => scale.forget()));
    host.querySelectorAll<HTMLButtonElement>('[data-bottle]').forEach(b => b.addEventListener('click', () => void act(host, () => scale.chooseBottle(b.dataset.bottle!))));
    host.querySelectorAll<HTMLButtonElement>('[data-bottle-remove]').forEach(b => b.addEventListener('click', () => scale.removeBottle(b.dataset.bottleRemove!)));
    host.querySelector('[data-scale-zero]')?.addEventListener('click', () => void act(host, () => scale.zero()));
    host.querySelector('[data-reset-today]')?.addEventListener('click', () => void act(host, () => scale.resetToday()));
    host.querySelector<HTMLFormElement>('[data-bottle-add]')?.addEventListener('submit', event => {
      event.preventDefault();
      const name = new FormData(event.target as HTMLFormElement).get('name');
      void act(host, () => scale.addBottle(typeof name === 'string' ? name : ''));
    });
  }
  const live = host.querySelector<HTMLElement>('[data-scale-live]')!;
  live.textContent = scale.phase === 'connected' ? scaleLine(scale.status) : '';
  live.hidden = !live.textContent;
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
    alert.textContent = 'Bluetooth асаалттай, апп Bluetooth ашиглах зөвшөөрөлтэй эсэхийг шалгана уу.';
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
