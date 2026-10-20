import { dayKey, sortedEvents, type EntryType, type WaterEntry } from '../data';
import { number, time, dateLabel } from '../format';
import { closeTypeMenu, openTypeMenu, typeTrigger } from './TypeMenu';

interface EntryListActions {
  onEdit: (id: string | undefined) => void;
  // Same popup menu as the history page; also resolves pending entries.
  onType: (id: string | undefined, type: 'drink' | 'spill') => void;
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
      <div class="type-cell">${typeTrigger(event.id, event.type, `${time(event.at)} цагийн ${event.amount} мл`)}</div>
      <strong>${number(event.amount)} <small>мл</small></strong>
      <div class="entry-actions">
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
  root.querySelectorAll<HTMLButtonElement>('[data-type-menu]').forEach(trigger => {
    const toggle = () => {
      if (trigger.getAttribute('aria-expanded') === 'true') { closeTypeMenu(true); return; }
      const current = (['drink', 'spill', 'pending'] as EntryType[]).find(type => trigger.classList.contains(type))!;
      const id = trigger.dataset.typeMenu;
      openTypeMenu(trigger, current, type => {
        actions.onType(id, type);
        // The list re-renders; keep keyboard focus on this entry's new pill.
        document.querySelector<HTMLButtonElement>(`[data-type-menu="${id}"]`)?.focus();
      });
    };
    trigger.onclick = toggle;
    trigger.onkeydown = event => { if (event.key === 'ArrowDown') { event.preventDefault(); toggle(); } };
  });
}
