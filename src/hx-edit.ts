import type { WaterEntry } from './data';
import { entryIcon } from './drinks';
import { mdIcon } from './components/Icon';

// History editing, Hydrify layout (kit screens 39–43): a small "edit / delete" menu on a row, and a
// bottom sheet with the amount (own keypad), a date chip and a time chip that open wheel pickers.
const MONTHS = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
const ITEM = 44;

function sheet(className: string, html: string): { box: HTMLElement; close: () => void } {
  const box = document.createElement('div');
  box.className = `hx-dim ${className}`;
  box.innerHTML = `<div class="hx-bottom" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  return { box, close };
}

const wheel = (id: string, values: (string | number)[], current: string | number) =>
  `<div class="hx-wheel" id="${id}" tabindex="0" role="listbox">${values.map(v => `<div role="option" class="hx-wheel-item${String(v) === String(current) ? ' on' : ''}" aria-selected="${String(v) === String(current)}" data-v="${v}">${v}</div>`).join('')}</div>`;

function bindWheels(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.hx-wheel').forEach(w => {
    const items = [...w.querySelectorAll<HTMLElement>('.hx-wheel-item')];
    w.scrollTop = Math.max(0, items.findIndex(i => i.classList.contains('on'))) * ITEM;
    let t: ReturnType<typeof setTimeout>;
    w.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM)));
        items.forEach((it, i) => { it.classList.toggle('on', i === idx); it.setAttribute('aria-selected', String(i === idx)); });
      }, 80);
    }, { passive: true });
    w.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); w.scrollBy({ top: e.key === 'ArrowUp' ? -ITEM : ITEM }); } });
  });
}
const pick = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`#${id} .hx-wheel-item.on`)!.dataset.v!;

function pickDate(at: Date, done: (d: Date) => void): void {
  const years = Array.from({ length: 5 }, (_, i) => at.getFullYear() - 2 + i);
  const { box, close } = sheet('hx-picker', `<h2>Огноо сонгох</h2>
    <div class="hx-wheels three">${wheel('pd-m', MONTHS, MONTHS[at.getMonth()])}${wheel('pd-d', Array.from({ length: 31 }, (_, i) => i + 1), at.getDate())}${wheel('pd-y', years, at.getFullYear())}</div>
    <div class="hx-sheet-actions"><button type="button" class="hx-light" data-back>Буцах</button><button type="button" class="hx-blue" data-ok>OK</button></div>`);
  bindWheels(box);
  box.querySelector('[data-back]')!.addEventListener('click', close);
  box.querySelector('[data-ok]')!.addEventListener('click', () => {
    const month = MONTHS.indexOf(pick(box, 'pd-m')), year = Number(pick(box, 'pd-y'));
    const day = Math.min(Number(pick(box, 'pd-d')), new Date(year, month + 1, 0).getDate());
    const d = new Date(at); d.setFullYear(year, month, day);
    close(); done(d);
  });
}

export function pickTime(at: Date, done: (d: Date) => void, title = 'Цаг сонгох'): void {
  const pad = (n: number) => String(n).padStart(2, '0');
  const { box, close } = sheet('hx-picker', `<h2>${title}</h2>
    <div class="hx-wheels two">${wheel('pt-h', Array.from({ length: 24 }, (_, i) => pad(i)), pad(at.getHours()))}${wheel('pt-m', Array.from({ length: 60 }, (_, i) => pad(i)), pad(at.getMinutes()))}</div>
    <div class="hx-sheet-actions"><button type="button" class="hx-light" data-back>Буцах</button><button type="button" class="hx-blue" data-ok>OK</button></div>`);
  bindWheels(box);
  box.querySelector('[data-back]')!.addEventListener('click', close);
  box.querySelector('[data-ok]')!.addEventListener('click', () => {
    const d = new Date(at); d.setHours(Number(pick(box, 'pt-h')), Number(pick(box, 'pt-m')), 0, 0);
    close(); done(d);
  });
}

// The slot left of 0 is empty, or a decimal point for amounts like 62.4 кг.
const keypad = (point = false) => `<div class="hx-keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', point ? '.' : '', '0', '⌫'].map(k => k
  ? `<button type="button" data-key="${k}" aria-label="${k === '⌫' ? 'Устгах' : k === '.' ? 'Таслал' : k}">${k}</button>` : '<span></span>').join('')}</div>`;
const KEYPAD = keypad();

// The amount field and the keypad under it write the same value: at most `digits` digits. The field is as wide as its digits (tabular figures), so «3300» and
// «10000» show in full instead of being cut off.
// With `decimals`, one point and that many digits after it are kept too.
function bindKeypad(panel: HTMLElement, get: () => string, set: (v: string) => void, digits = 5, decimals = 0): void {
  const input = panel.querySelector<HTMLInputElement>('#hx-amount')!;
  const whole = (v: string) => v.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, digits);
  const clean = (v: string) => {
    const at = decimals ? v.replace(',', '.').indexOf('.') : -1;
    if (at < 0) return whole(v);
    return `${whole(v.slice(0, at)) || '0'}.${v.slice(at + 1).replace(/\D/g, '').slice(0, decimals)}`;
  };
  const fit = () => { input.style.width = `${Math.max(2, input.value.length) + 0.6}ch`; };
  input.addEventListener('input', () => { set(clean(input.value)); fit(); });
  panel.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => b.addEventListener('click', () => {
    const now = get(), key = b.dataset.key!;
    set(key === '⌫' ? now.slice(0, -1) : clean(now === '0' ? key : now + key));
    input.value = get();
    fit();
  }));
  fit();
}

// "Кофе уух" (kit screen 35): a drink's icon, the amount by keypad, Цуцлах / OK.
export function openAmountSheet(title: string, icon: string, initial: number, onOk: (ml: number) => void, unit = 'мл', max = 5000, decimals = 0): void {
  let amount = String(initial);
  const { box, close } = sheet('hx-edit', `<h2>${title}</h2>
    <span class="hx-edit-cup" aria-hidden="true">${icon}</span>
    <label class="hx-amount-box"><span class="visually-hidden">Хэмжээ, мл</span><input id="hx-amount" inputmode="${decimals ? 'decimal' : 'numeric'}" value="${amount}" aria-describedby="hx-edit-error"/><small>${unit}</small></label>
    <p class="hx-error" id="hx-edit-error" role="alert" hidden></p>
    <div class="hx-sheet-actions"><button type="button" class="hx-light" data-cancel>Цуцлах</button><button type="button" class="hx-blue" data-save>OK</button></div>
    ${decimals ? keypad(true) : KEYPAD}`);
  bindKeypad(box, () => amount, v => { amount = v; }, Math.max(5, String(max).length), decimals);
  box.querySelector('[data-cancel]')!.addEventListener('click', close);
  box.querySelector('[data-save]')!.addEventListener('click', () => {
    const ml = Number(amount);
    const error = box.querySelector<HTMLElement>('#hx-edit-error')!;
    if (!(decimals ? Number.isFinite(ml) : Number.isInteger(ml)) || ml < 1 || ml > max) { error.textContent = `1–${max.toLocaleString('en-US')} ${unit} байна.`; error.hidden = false; return; }
    close(); onOk(ml);
  });
  box.querySelector<HTMLInputElement>('#hx-amount')!.focus();
}

const dateText = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const timeText = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// "Ус засах": amount by keypad (or keyboard), date and time by wheels. A future time is refused.
export function openEditSheet(entry: WaterEntry, onSave: (next: WaterEntry) => Promise<boolean>): void {
  let amount = String(entry.amount);
  let at = new Date(entry.at);
  const { box, close } = sheet('hx-edit', '');
  const panel = box.querySelector<HTMLElement>('.hx-bottom')!;
  const draw = (error = '') => {
    panel.innerHTML = `<h2>Ус засах</h2>
      <span class="hx-edit-cup" aria-hidden="true">${entryIcon(entry)}</span>
      <label class="hx-amount-box"><span class="visually-hidden">Хэмжээ, мл</span><input id="hx-amount" inputmode="numeric" value="${amount}" aria-describedby="hx-edit-error"/><small>мл</small></label>
      <div class="hx-chips"><button type="button" data-date>${dateText(at)} ${mdIcon('edit')}</button><button type="button" data-time>${timeText(at)} ${mdIcon('edit')}</button></div>
      <p class="hx-error" id="hx-edit-error" role="alert" ${error ? '' : 'hidden'}>${error}</p>
      <div class="hx-sheet-actions"><button type="button" class="hx-light" data-cancel>Цуцлах</button><button type="button" class="hx-blue" data-save>Хадгалах</button></div>
      ${KEYPAD}`;
    bindKeypad(panel, () => amount, v => { amount = v; });
    panel.querySelector('[data-date]')!.addEventListener('click', () => pickDate(at, d => { at = d; draw(); }));
    panel.querySelector('[data-time]')!.addEventListener('click', () => pickTime(at, d => { at = d; draw(); }));
    panel.querySelector('[data-cancel]')!.addEventListener('click', close);
    panel.querySelector('[data-save]')!.addEventListener('click', async () => {
      const ml = Number(amount);
      if (!Number.isInteger(ml) || ml < 1 || ml > 5000) { draw('Хэмжээ 1–5,000 мл байна.'); return; }
      if (at.getTime() > Date.now() + 60_000) { draw('Ирээдүйн цаг сонгох боломжгүй.'); return; }
      if (await onSave({ ...entry, amount: ml, at: at.toISOString() })) close();
    });
  };
  draw();
}

// The ⋮ menu on a row: edit or delete, next to the button that opened it.
export function openRowMenu(button: HTMLElement, onEdit: () => void, onDelete: () => void): void {
  document.querySelector('.hx-popover')?.remove();
  const menu = document.createElement('div');
  menu.className = 'hx-popover';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<button type="button" role="menuitem" data-edit>${mdIcon('edit')} Засах</button><button type="button" role="menuitem" class="danger" data-delete>${mdIcon('delete')} Устгах</button>`;
  document.body.append(menu);
  const r = button.getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(8, r.right + window.scrollX - 150)}px`;
  const close = () => { menu.remove(); document.removeEventListener('click', outside, true); };
  const outside = (e: Event) => { if (!menu.contains(e.target as Node) && e.target !== button) close(); };
  setTimeout(() => document.addEventListener('click', outside, true));
  menu.querySelector('[data-edit]')!.addEventListener('click', () => { close(); onEdit(); });
  menu.querySelector('[data-delete]')!.addEventListener('click', () => { close(); onDelete(); });
  menu.querySelector<HTMLButtonElement>('button')!.focus();
}

// "Choose Theme" style (kit 64, 77): radio rows, Цуцлах / OK.
export function chooseSheet(title: string, options: [string, string][], current: string, onOk: (value: string) => void): void {
  let value = current;
  const { box, close } = sheet('hx-choose', `<h2>${title}</h2>
    <div class="hx-radios" role="radiogroup" aria-label="${title}">${options.map(([v, label]) => `<label class="hx-radio"><input type="radio" name="hx-choose" value="${v}" ${v === current ? 'checked' : ''}/><span>${label}</span></label>`).join('')}</div>
    <div class="hx-sheet-actions"><button type="button" class="hx-light" data-cancel>Цуцлах</button><button type="button" class="hx-blue" data-ok>OK</button></div>`);
  box.querySelectorAll<HTMLInputElement>('input[name="hx-choose"]').forEach(i => i.addEventListener('change', () => { value = i.value; }));
  box.querySelector('[data-cancel]')!.addEventListener('click', close);
  box.querySelector('[data-ok]')!.addEventListener('click', () => { close(); onOk(value); });
  box.querySelector<HTMLInputElement>('input:checked, input')?.focus();
}

// "Logout" style (kit 84): a red title, one line, Цуцлах / the action.
// «Нууц үг солих»: the current password (when the account has one) and the new one twice. `save`
// answers the error to show, or null once it is done.
export function passwordSheet(hasPassword: boolean, save: (current: string, next: string) => Promise<string | null>): void {
  const field = (id: string, label: string, auto: string) =>
    `<label class="hx-pw-field">${label}<input id="${id}" type="password" autocomplete="${auto}" maxlength="128" required/></label>`;
  const { box, close } = sheet('hx-pw', `<h2>${hasPassword ? 'Нууц үг солих' : 'Нууц үг тохируулах'}</h2>
    <form novalidate>
      ${hasPassword ? field('pw-current', 'Одоогийн нууц үг', 'current-password') : '<p class="hx-confirm-text">Google-ээр нээсэн бүртгэлдээ нууц үг нэмбэл имэйлээрээ ч нэвтэрч болно.</p>'}
      ${field('pw-next', 'Шинэ нууц үг · 8-аас дээш тэмдэгт', 'new-password')}${field('pw-again', 'Шинэ нууц үгээ давтах', 'new-password')}
      <p class="hx-error" role="alert" hidden></p>
      <div class="hx-sheet-actions"><button type="button" class="hx-light" data-cancel>Цуцлах</button><button type="submit" class="hx-blue">Хадгалах</button></div>
    </form>`);
  const form = box.querySelector('form')!;
  const error = box.querySelector<HTMLElement>('.hx-error')!;
  const value = (id: string) => box.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '';
  const show = (text: string) => { error.textContent = text; error.hidden = !text; };
  box.querySelector('[data-cancel]')!.addEventListener('click', close);
  form.addEventListener('input', () => show(''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (hasPassword && !value('pw-current')) return show('Одоогийн нууц үгээ оруулна уу.');
    if (value('pw-next').length < 8) return show('Шинэ нууц үг 8-аас дээш тэмдэгт байна.');
    if (value('pw-next') !== value('pw-again')) return show('Шинэ нууц үг таарахгүй байна.');
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    const failed = await save(value('pw-current'), value('pw-next'));
    button.disabled = false;
    if (failed) show(failed); else close();
  });
  box.querySelector<HTMLInputElement>('input')!.focus();
}

export function confirmSheet(title: string, text: string, okLabel: string, onOk: () => void): void {
  const { box, close } = sheet('hx-confirm', `<h2 class="danger">${title}</h2><p class="hx-confirm-text">${text}</p>
    <div class="hx-sheet-actions"><button type="button" class="hx-light" data-cancel>Цуцлах</button><button type="button" class="hx-blue" data-ok>${okLabel}</button></div>`);
  box.querySelector('[data-cancel]')!.addEventListener('click', close);
  box.querySelector('[data-ok]')!.addEventListener('click', () => { close(); onOk(); });
  box.querySelector<HTMLButtonElement>('[data-cancel]')!.focus();
}
