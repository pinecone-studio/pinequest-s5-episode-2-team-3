import { STORAGE_KEY, TYPES, defaults, validateState, isEntryType, type AppState, type WaterEntry } from './data';
import { number } from './format';
import { EntryPage } from './components/EntryPage';
import { bindEntryList } from './components/EntryList';
import { openEntryDialog } from './components/EntryDialog';
import { notify } from './components/Toast';

const app = document.querySelector<HTMLDivElement>('#app')!;
let state = defaults();
let savedRaw: string | null = null;
let storageError = '';
let corruptStorage = false;

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

function render(): void {
  document.title = 'Ус бүртгэх · Дусал';
  app.innerHTML = EntryPage(state.events, storageError);
  bind();
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

function openEntry(id?: string): void {
  const event = state.events.find(item => item.id === id);
  openEntryDialog({
    entry: event,
    onSave(item) {
      const previous = event && structuredClone(event);
      if (!commit(next => {
        if (event) next.events[next.events.findIndex(row => row.id === id)] = item;
        else next.events.push(item);
      })) return false;
      changed(event ? 'Бүртгэлийг шинэчиллээ.' : `${number(item.amount)} мл ${TYPES[item.type].toLowerCase()} гэж бүртгэлээ.`, () => {
        if (commit(next => {
          next.events = next.events.filter(row => row.id !== item.id);
          if (previous) next.events.push(previous);
        })) changed('Үйлдлийг буцаалаа.');
      });
      return true;
    },
    onDelete: event ? () => {
      const removed = structuredClone(event);
      if (!commit(next => { next.events = next.events.filter(item => item.id !== event.id); })) return false;
      changed('Бүртгэлийг устгалаа.', () => {
        if (commit(next => next.events.push(removed))) changed('Бүртгэлийг сэргээв.');
      });
      return true;
    } : undefined,
  });
}

function bind(): void {
  document.querySelector<HTMLButtonElement>('#add-entry')?.addEventListener('click', () => openEntry());
  document.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach(button => {
    button.onclick = () => addEntry(Number(button.dataset.quick));
  });
  bindEntryList(app, {
    onEdit: openEntry,
    onToggle(id) {
      const event = state.events.find(item => item.id === id);
      if (event) setType(event.id, event.type === 'drink' ? 'spill' : 'drink');
    },
    onResolve: setType,
  });
}

window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY || event.key === null) && !document.querySelector('dialog[open]')) { load(); render(); }
});
render();
