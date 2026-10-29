import { scale } from './scale';
import { baseChip } from './base-status';
import { escape } from './format';
import { mdIcon } from './components/Icon';
import { BASE_ICON, bindDevicePanel } from './components/DevicePanel';
import { sheet } from './home-limit';
import { bindCalibrate, calibrateBody } from './cup-calibrate';

// The home shows the Bluetooth base as one row in the style of «Эмчийн заавар»: is it there, and does it
// need anything. The chip (and «⋯» › «Ухаалаг суурь») opens «Аягаа хэмжүүлэх» as a window over the home
// (cup-calibrate.ts): link the base and measure a cup step by step, each step checked as it is done, with
// the base's own bottles, tare and resets folded below. Without Bluetooth there is no chip.
export function baseChipHtml(): string {
  const chip = baseChip(scale.phase, scale.saved, scale.status);
  if (!chip) return '<span data-base-chip hidden></span>';
  const state = `${chip.text}${chip.note ? ` · ${chip.note}` : ''}`;
  return `<section class="hx-card row-card base-row ${chip.tone}" data-base-chip aria-labelledby="base-row-title">
    <div class="rc-top" data-base-open>
      <span class="rc-icon" aria-hidden="true">${BASE_ICON}</span>
      <span class="rc-head"><b id="base-row-title">Ухаалаг суурь</b><small><i aria-hidden="true"></i><span>${escape(state)}</span></small></span>
      <button type="button" class="rc-cta" data-base-open aria-haspopup="dialog" aria-label="Ухаалаг суурь: ${escape(state)}. ${escape(chip.cta)}"><span>${escape(chip.cta)}</span></button>
    </div></section>`;
}

// The base reports about once a second; swap the chip in place only when what it says changes, so
// the home is not redrawn and a focused chip keeps its focus.
let bound = false, shown = '';
export function bindBaseChip(): void {
  shown = baseChipHtml();
  if (bound) return;
  bound = true;
  // Delegated: the chip is swapped in place as the base reports.
  document.addEventListener('click', event => { if ((event.target as Element).closest('[data-base-open]')) openBaseSheet(); });
  window.addEventListener('dusal-scale', () => {
    const old = document.querySelector('[data-base-chip]');
    const html = baseChipHtml();
    if (!old || html === shown) return;
    shown = html;
    old.outerHTML = html;
  });
}

// The steps and the live reading redraw in place; the base panel below redraws itself (DevicePanel.ts).
export function openBaseSheet(): void {
  const { box, close } = sheet('base-sheet', `<div class="hm-head"><h2 id="bs-title">Аягаа хэмжүүлэх</h2><button type="button" class="hm-close" data-close aria-label="Хаах">${mdIcon('close')}</button></div><div class="bs-body"></div>`, 'Аягаа хэмжүүлэх');
  box.querySelector('[data-close]')!.addEventListener('click', close);
  const body = box.querySelector<HTMLElement>('.bs-body')!;
  const redraw = () => {
    if (!body.isConnected) return;
    body.innerHTML = calibrateBody();
    bindCalibrate(body, redraw);
    bindDevicePanel(() => {});
  };
  redraw();
}
