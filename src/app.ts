import { load as readState, save, saveMessage, onExternalChange } from './storage';
import { TYPES, defaults, isEntryType, type AppState, type WaterEntry } from './data';
import { number } from './format';
import { EntryPage } from './components/EntryPage';
import { bindEntryList } from './components/EntryList';
import { openEntryDialog } from './components/EntryDialog';
import { notify } from './components/Toast';

const app = document.querySelector<HTMLDivElement>('#app')!;
let state = defaults();
let storageError = '';
let committing = false;
async function load() {
  const loaded = await readState();
  state = loaded.state;
  storageError = loaded.error;
}

async function commit(change: (next: AppState) => void): Promise<boolean> {
  if (committing) return false;
  committing = true;
  try {
    const next = structuredClone(state);
    change(next);
    const result = await save(next);
    if (result === 'saved') { await load(); return true; }
    if (result === 'conflict') { await load(); render(); }
    notify(saveMessage[result]);
    return false;
  } finally { committing = false; }
}

function render(): void {
  document.title = 'Ус бүртгэх · Дусал';
  app.innerHTML = EntryPage(state.events, storageError);
  bind();
}

function changed(message: string, undo?: () => void) { render(); notify(message, undo); }

async function addEntry(amount: number) {
  const date = new Date();
  const event: WaterEntry = { id: crypto.randomUUID(), amount, type: 'drink', at: date.toISOString() };
  if (await commit(next => next.events.push(event))) {
    changed(`${number(amount)} мл уусан гэж бүртгэлээ.`, async () => {
      if (await commit(next => { next.events = next.events.filter(item => item.id !== event.id); })) changed('Бүртгэлийг буцаалаа.');
    });
  }
}

async function setType(id: string | undefined, type: unknown) {
  const previous = state.events.find(event => event.id === id)?.type;
  if (!previous || !isEntryType(type)) return;
  if (await commit(next => { next.events.find(event => event.id === id)!.type = type; })) {
    changed(`${TYPES[type]} болгож өөрчиллөө.`, async () => {
      if (await commit(next => { const event = next.events.find(item => item.id === id); if (event) event.type = previous; })) changed('Өөрчлөлтийг буцаалаа.');
    });
  }
}

function openEntry(id?: string): void {
  const event = state.events.find(item => item.id === id);
  openEntryDialog({
    entry: event,
    async onSave(item) {
      const previous = event && structuredClone(event);
      if (!await commit(next => {
        if (event) next.events[next.events.findIndex(row => row.id === id)] = item;
        else next.events.push(item);
      })) return false;
      changed(event ? 'Бүртгэлийг шинэчиллээ.' : `${number(item.amount)} мл ${TYPES[item.type].toLowerCase()} гэж бүртгэлээ.`, async () => {
        if (await commit(next => {
          next.events = next.events.filter(row => row.id !== item.id);
          if (previous) next.events.push(previous);
        })) changed('Үйлдлийг буцаалаа.');
      });
      return true;
    },
    onDelete: event ? async () => {
      const removed = structuredClone(event);
      if (!await commit(next => { next.events = next.events.filter(item => item.id !== event.id); })) return false;
      changed('Бүртгэлийг устгалаа.', async () => {
        if (await commit(next => next.events.push(removed))) changed('Бүртгэлийг сэргээв.');
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
    onType: setType,
  });
}

onExternalChange(async () => { await load(); render(); });
void load().then(render);
