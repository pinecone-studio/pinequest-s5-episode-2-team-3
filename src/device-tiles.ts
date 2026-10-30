import { chosenBottleName, scale } from './scale';
import { baseTile, directText, watchTile, type DeviceTile } from './device-status';
import { watchDay } from './watch-card';
import { openWatchConnect } from './watch-connect';
import { openBaseConnect } from './base-connect';
import { escape, number } from './format';
import { BASE_ICON } from './components/DevicePanel';

// «Төхөөрөмж» on the home and on «Профайл»: two square tiles, «Ухаалаг суурь» and «Ухаалаг цаг», each one
// button. Not linked: a grey «Холбогдоогүй» and «Холбох ›»; the base opens «Суурь холбох» (base-connect.ts)
// and the watch «Цаг холбох» (watch-connect.ts), the same card. Linked: a green «Холбогдсон», the bottle's
// water or the latest pulse, and a tap opens its settings (the base: «Суурь холбох» straight at «Амжилттай
// холбогдлоо», with the bottles, the zero and a cup to measure).
const WATCH_ICON = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 9v3l2 1"/></svg>';

function tileInner(icon: string, name: string, t: DeviceTile): string {
  return `<span class="dev-icon" aria-hidden="true">${icon}</span><b class="dev-name">${name}</b>
      <span class="dev-status"><i aria-hidden="true"></i>${escape(t.status)}</span>${t.detail ? `<small class="dev-detail">${escape(t.detail)}</small>` : ''}
      ${t.cta ? '<span class="dev-cta" aria-hidden="true">Холбох ›</span>' : ''}`;
}
const label = (name: string, t: DeviceTile) => `${name}: ${t.status}${t.detail ? `, ${t.detail}` : ''}${t.cta ? '. Холбох' : ''}`;

function baseTileHtml(): string {
  const t = baseTile(scale.phase, scale.status, chosenBottleName(), scale.directStart);
  return `<button type="button" class="dev-tile${t.connected ? ' on' : ''}" data-base-tile aria-haspopup="dialog" aria-label="${escape(label('Ухаалаг суурь', t))}">${tileInner(BASE_ICON, 'Ухаалаг суурь', t)}</button>`;
}
// Linked, the watch's settings are on «Профайл › Холбосон бүртгэл» (in the app's tab host the hash goes along).
function watchTileHtml(): string {
  const t = watchTile(watchDay());
  return t.connected
    ? `<a class="dev-tile on" href="/settings.html#linked" aria-label="${escape(label('Ухаалаг цаг', t))}">${tileInner(WATCH_ICON, 'Ухаалаг цаг', t)}</a>`
    : `<button type="button" class="dev-tile" data-watch-connect aria-haspopup="dialog" aria-label="${escape(label('Ухаалаг цаг', t))}">${tileInner(WATCH_ICON, 'Ухаалаг цаг', t)}</button>`;
}

// Above the goal on the home: the water in the bottle on the linked base right now, its empty weight
// taken off (the base works it out once the bottle is set). Without that, or with the bottle lifted or
// still moving, it says so instead. Hidden while no base is linked; updated in place with each reading.
function baseLiveInner(): string {
  const s = scale.phase === 'connected' ? scale.status : null;
  if (!s) return '';
  const name = chosenBottleName();
  // «Шууд уух»: the weight and what has gone from it, in place of «not set up».
  const direct = !s.bottleSet && scale.directStart !== null ? directText(s, scale.directStart) : null;
  const text = s.remainingMl != null ? `${name ? `«${escape(name)}»-д` : 'Саванд'} <b>${number(s.remainingMl)} мл</b> ус байна`
    : direct ? escape(direct)
    : !s.bottleSet && scale.directStart === null ? 'Савны хоосон жинг тохируулаагүй байна'
    : s.phase === 'moving' ? 'Жин тогтворжиж байна…' : 'Сав суурин дээр алга';
  return `<span class="bl-icon" aria-hidden="true">${BASE_ICON}</span><span>${text}</span>`;
}
export const baseLive = (): string => { const inner = baseLiveInner(); return `<p class="base-live" data-base-live aria-live="off" ${inner ? '' : 'hidden'}>${inner}</p>`; };

export const deviceTiles = (): string => `<section class="dev-section" aria-labelledby="dev-title">
    <h2 class="dev-head" id="dev-title">Төхөөрөмж</h2>
    <div class="dev-grid">${baseTileHtml()}${watchTileHtml()}</div>
  </section>`;

// The base reports about once a second; swap its tile in place only when what it says changes, so the
// page is not redrawn and a focused tile keeps its focus.
let bound = false, shown = '';
export function bindDeviceTiles(): void {
  shown = baseTileHtml();
  if (bound) return;
  bound = true;
  // Delegated, as the base tile is swapped in place.
  document.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('[data-base-tile]')) openBaseConnect();
    else if (target.closest('.dev-tile[data-watch-connect]')) openWatchConnect();
  });
  window.addEventListener('dusal-scale', () => {
    const live = document.querySelector<HTMLElement>('[data-base-live]');
    if (live) { const inner = baseLiveInner(); if (live.innerHTML !== inner) live.innerHTML = inner; live.hidden = !inner; }
    const old = document.querySelector('[data-base-tile]');
    const html = baseTileHtml();
    if (!old || html === shown) return;
    const focused = document.activeElement === old;
    shown = html;
    old.outerHTML = html;
    if (focused) document.querySelector<HTMLElement>('[data-base-tile]')?.focus();
  });
}
