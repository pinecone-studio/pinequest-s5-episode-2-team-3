import './style.css';
import { STORAGE_KEY, TYPES, defaults, dayKey, localInput, validateState, sortedEvents, isEntryType, type AppState, type WaterEntry } from './data';

const paths = {
  drop: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = (name: keyof typeof paths) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const time = (value: string) => { const date = new Date(value); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
const dateLabel = (value: string) => { const date = new Date(`${value}T12:00`); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`; };
const app = document.querySelector<HTMLDivElement>('#app')!;
let state = defaults();
let savedRaw: string | null = null;
let storageError = '';
let corruptStorage = false;
let undoAction: (() => void) | undefined;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

function load() {
  try {
    savedRaw = localStorage.getItem(STORAGE_KEY);
    state = savedRaw ? validateState(JSON.parse(savedRaw)) : defaults();
    storageError = '';
    corruptStorage = false;
  } catch {
    storageError = 'Хадгалсан өгөгдлийг нээж чадсангүй. Өмнөх мэдээллийг хамгаалахын тулд өөрчлөлт хадгалахыг зогсоолоо.';
    corruptStorage = true;
  }
}
load();

function commit(change: (next: AppState) => void): boolean {
  if (corruptStorage) { notify('Хадгалсан өгөгдөл уншигдахгүй байна. Өөрчлөлт оруулаагүй.'); return false; }
  try {
    if (localStorage.getItem(STORAGE_KEY) !== savedRaw) {
      load(); render(); notify('Өөр цонхонд мэдээлэл өөрчлөгдсөн тул шинэчиллээ. Үйлдлээ дахин хийнэ үү.');
      return false;
    }
    const next = structuredClone(state);
    change(next);
    const valid = validateState(next);
    const raw = JSON.stringify(valid);
    localStorage.setItem(STORAGE_KEY, raw);
    state = valid;
    savedRaw = raw;
    storageError = '';
    corruptStorage = false;
    return true;
  } catch {
    storageError = 'Өөрчлөлтийг хадгалж чадсангүй. Браузерын хадгалах эрх, сул зайг шалгаад дахин оролдоно уу.';
    const alert = document.querySelector<HTMLElement>('#storage-error');
    if (alert) { alert.textContent = storageError; alert.hidden = false; }
    const dialogError = document.querySelector<HTMLElement>('#dialog-error');
    if (dialogError) { dialogError.textContent = storageError; dialogError.hidden = false; }
    notify('Хадгалалт амжилтгүй. Өөрчлөлт ороогүй.');
    return false;
  }
}

function entryRows() {
  if (!state.events.length) return '<div class="empty-state"><p>Бүртгэл алга.</p><span>«Бүртгэх» товчоор уусан хэмжээгээ нэмнэ.</span></div>';
  return sortedEvents(state.events).map(event => `<div class="entry-row ${event.type}"><time datetime="${event.at}"><span>${dateLabel(dayKey(new Date(event.at)))}</span>${time(event.at)}</time><span class="entry-type"><i></i>${TYPES[event.type]}</span><strong>${number(event.amount)} <small>мл</small></strong><div class="entry-actions">${event.type !== 'pending' ? `<button class="text-button" data-toggle="${event.id}">${event.type === 'drink' ? 'Асгасан болгох' : 'Уусан болгох'}</button>` : `<button class="text-button" data-resolve="${event.id}" data-type="drink">Уусан</button><button class="text-button" data-resolve="${event.id}" data-type="spill">Асгасан</button>`}<button class="text-button subdued" data-edit="${event.id}" aria-label="${time(event.at)} цагийн ${event.amount} мл бүртгэл засах">Засах</button></div></div>`).join('');
}

function render() {
  document.title = 'Ус бүртгэх · Дусал';
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a><header class="site-header"><div class="header-inner"><a class="brand" href="#main" aria-label="Дусал нүүр">${icon('drop')}Дусал<span>/ усны бүртгэл</span></a><span class="connection">Гараар бүртгэж байна</span></div></header><main id="main" tabindex="-1"><div class="page-heading"><div><p class="page-kicker">УСНЫ ХЭРЭГЛЭЭ</p><h1>Ус бүртгэх</h1></div><button class="primary-button" id="add-entry">${icon('plus')} Бүртгэх</button></div><p id="storage-error" class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p><div class="quick-add"><span>Хурдан нэмэх</span>${[150, 250, 500].map(amount => `<button data-quick="${amount}">+${amount} мл</button>`).join('')}</div><section class="entries" aria-labelledby="entries-title"><div class="section-heading"><h2 id="entries-title">Бүртгэлүүд</h2><span>${state.events.length} бүртгэл</span></div>${entryRows()}</section><footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer></main><dialog id="dialog" aria-labelledby="dialog-title"></dialog><div class="toast" id="toast" role="status" aria-live="polite"><span></span><button id="undo" hidden>Буцаах</button></div>`;
  bind();
}

function notify(message: string, undo?: () => void) {
  clearTimeout(undoTimer);
  undoAction = undo;
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.querySelector('span')!.textContent = message;
  toast.querySelector('button')!.hidden = !undo;
  toast.classList.add('visible');
  undoTimer = setTimeout(() => { toast.classList.remove('visible'); undoAction = undefined; }, undo ? 10000 : 5000);
}

function changed(message: string, undo?: () => void) { render(); notify(message, undo); }

function addEntry(amount: number) {
  const date = new Date();
  const event: WaterEntry = { id: crypto.randomUUID(), amount, type: 'drink', at: date.toISOString() };
  if (commit(next => next.events.push(event))) {
    changed(`${number(amount)} мл уусан гэж бүртгэлээ.`, () => {
      if (commit(next => { next.events = next.events.filter(item => item.id !== event.id); })) changed('Бүртгэлийг буцаалаа.');
    });
  }
}

function setType(id: string | undefined, type: unknown) {
  const previous = state.events.find(event => event.id === id)?.type;
  if (!previous || !isEntryType(type)) return;
  if (commit(next => { next.events.find(event => event.id === id)!.type = type; })) {
    changed(`${TYPES[type]} болгож өөрчиллөө.`, () => {
      if (commit(next => { const event = next.events.find(item => item.id === id); if (event) event.type = previous; })) changed('Өөрчлөлтийг буцаалаа.');
    });
  }
}

function dialogShell(title: string, content: string) {
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="icon-button" id="close-dialog" aria-label="Хаах">${icon('close')}</button></div>${content}<p id="dialog-error" class="form-error" role="alert" hidden></p>`;
  dialog.querySelector<HTMLButtonElement>('#close-dialog')!.onclick = () => dialog.close();
  dialog.onclick = event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  };
  dialog.showModal();
  return dialog;
}

function openEntry(id?: string) {
  const event = state.events.find(item => item.id === id);
  const initial = event ? new Date(event.at) : new Date();
  const dialog = dialogShell(event ? 'Бүртгэл засах' : 'Ус бүртгэх', `<form id="entry-form"><label for="amount">Хэмжээ, мл</label><input autofocus id="amount" name="amount" type="number" inputmode="numeric" min="1" max="5000" step="1" required value="${event?.amount ?? 250}"/><div class="amount-presets">${[150, 250, 500].map(amount => `<button type="button" data-amount="${amount}">${amount} мл</button>`).join('')}</div><label for="entry-type">Төрөл</label><select id="entry-type" name="type">${Object.entries(TYPES).map(([type, label]) => `<option value="${type}" ${(event?.type ?? 'drink') === type ? 'selected' : ''}>${label}</option>`).join('')}</select><label for="entry-date">Огноо, цаг</label><input id="entry-date" type="datetime-local" name="at" required max="${localInput()}" value="${localInput(initial)}"/><p id="entry-error" class="form-error" role="alert" hidden></p><div class="dialog-actions">${event ? '<button type="button" class="text-button danger" id="delete-entry">Устгах</button>' : '<span></span>'}<button type="submit" class="primary-button">${event ? 'Хадгалах' : 'Бүртгэх'}</button></div></form>`);
  dialog.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach(button => button.onclick = () => { dialog.querySelector<HTMLInputElement>('#amount')!.value = button.dataset.amount!; });
  dialog.querySelector<HTMLButtonElement>('#delete-entry')?.addEventListener('click', () => {
    if (!event) return;
    const removed = structuredClone(event);
    if (commit(next => { next.events = next.events.filter(item => item.id !== event.id); })) {
      dialog.close();
      changed('Бүртгэлийг устгалаа.', () => { if (commit(next => next.events.push(removed))) changed('Бүртгэлийг сэргээв.'); });
    }
  });
  dialog.querySelector<HTMLFormElement>('form')!.onsubmit = submit => {
    submit.preventDefault();
    const form = new FormData(submit.currentTarget as HTMLFormElement);
    const amount = Number(form.get('amount'));
    const atValue = form.get('at');
    const at = new Date(typeof atValue === 'string' ? atValue : NaN);
    const type = form.get('type');
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000 || !isEntryType(type) || !Number.isFinite(at.getTime()) || at.getTime() > Date.now()) {
      const error = dialog.querySelector<HTMLElement>('#entry-error')!;
      error.hidden = false; error.textContent = '1–5,000 мл бүхэл тоо, өнгөрсөн эсвэл одоогийн огноо оруулна уу.';
      return;
    }
    const previous = event && structuredClone(event);
    const timestamp = event && localInput(new Date(event.at)) === form.get('at') ? event.at : at.toISOString();
    const item: WaterEntry = { id: event?.id ?? crypto.randomUUID(), amount, type, at: timestamp };
    if (!commit(next => { if (event) next.events[next.events.findIndex(row => row.id === id)] = item; else next.events.push(item); })) return;
    dialog.close();
    changed(event ? 'Бүртгэлийг шинэчиллээ.' : `${number(amount)} мл ${TYPES[type].toLowerCase()} гэж бүртгэлээ.`, () => {
      if (commit(next => { next.events = next.events.filter(row => row.id !== item.id); if (previous) next.events.push(previous); })) changed('Үйлдлийг буцаалаа.');
    });
  };
}

function bind() {
  document.querySelector<HTMLButtonElement>('#add-entry')?.addEventListener('click', () => openEntry());
  document.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach(button => button.onclick = () => addEntry(Number(button.dataset.quick)));
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.onclick = () => openEntry(button.dataset.edit));
  document.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button => button.onclick = () => {
    const event = state.events.find(item => item.id === button.dataset.toggle);
    if (event) setType(event.id, event.type === 'drink' ? 'spill' : 'drink');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-resolve]').forEach(button => button.onclick = () => setType(button.dataset.resolve, button.dataset.type));
  document.querySelector<HTMLButtonElement>('#undo')!.onclick = () => { const undo = undoAction; undoAction = undefined; undo?.(); };
}

window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY || event.key === null) && !document.querySelector('dialog[open]')) { load(); render(); }
});
render();
