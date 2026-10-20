import { dayKey, sortedEvents, TYPES, type WaterEntry } from '../data';
import { number, time, dateLabel } from '../format';

interface EntryListActions {
  onEdit: (id: string | undefined) => void;
  onToggle: (id: string | undefined) => void;
  onResolve: (id: string | undefined, type: unknown) => void;
}

export function EntryList(events: readonly WaterEntry[]): string {
  if (!events.length) {
    return `<div class="empty-state">
      <p>Бүртгэл алга.</p>
      <span>«Бүртгэх» товчоор уусан хэмжээгээ нэмнэ.</span>
    </div>`;
  }

  return sortedEvents(events).map(event => `
    <div class="entry-row ${event.type}">
      <time datetime="${event.at}">
        <span>${dateLabel(dayKey(new Date(event.at)))}</span>${time(event.at)}
      </time>
      <span class="entry-type"><i></i>${TYPES[event.type]}</span>
      <strong>${number(event.amount)} <small>мл</small></strong>
      <div class="entry-actions">
        ${event.type !== 'pending'
          ? `<button class="text-button" data-toggle="${event.id}">${event.type === 'drink' ? 'Асгасан болгох' : 'Уусан болгох'}</button>`
          : `<button class="text-button" data-resolve="${event.id}" data-type="drink">Уусан</button>
             <button class="text-button" data-resolve="${event.id}" data-type="spill">Асгасан</button>`}
        <button class="text-button subdued" data-edit="${event.id}"
          aria-label="${time(event.at)} цагийн ${event.amount} мл бүртгэл засах">Засах</button>
      </div>
    </div>
  `).join('');
}

export function bindEntryList(root: ParentNode, actions: EntryListActions): void {
  root.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => {
    button.onclick = () => actions.onEdit(button.dataset.edit);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button => {
    button.onclick = () => actions.onToggle(button.dataset.toggle);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-resolve]').forEach(button => {
    button.onclick = () => actions.onResolve(button.dataset.resolve, button.dataset.type);
  });
}
