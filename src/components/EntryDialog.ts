import { isEntryType, localInput, TYPES, type WaterEntry } from '../data';
import { icon } from './Icon';

interface EntryDialogProps {
  entry?: WaterEntry;
  onSave: (entry: WaterEntry) => boolean;
  onDelete?: () => boolean;
}

export function openEntryDialog({ entry, onSave, onDelete }: EntryDialogProps): void {
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  const initial = entry ? new Date(entry.at) : new Date();
  dialog.innerHTML = `
    <div class="dialog-heading">
      <h2 id="dialog-title">${entry ? 'Бүртгэл засах' : 'Ус бүртгэх'}</h2>
      <button class="icon-button" id="close-dialog" aria-label="Хаах">${icon('close')}</button>
    </div>
    <form id="entry-form">
      <label for="amount">Хэмжээ, мл</label>
      <input autofocus id="amount" name="amount" type="number" inputmode="numeric"
        min="1" max="5000" step="1" required value="${entry?.amount ?? 250}"/>
      <div class="amount-presets">
        ${[150, 250, 500].map(amount => `<button type="button" data-amount="${amount}">${amount} мл</button>`).join('')}
      </div>
      <label for="entry-type">Төрөл</label>
      <select id="entry-type" name="type">
        ${Object.entries(TYPES).map(([type, label]) => `<option value="${type}" ${(entry?.type ?? 'drink') === type ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <label for="entry-date">Огноо, цаг</label>
      <input id="entry-date" type="datetime-local" name="at" required
        max="${localInput()}" value="${localInput(initial)}"/>
      <p id="entry-error" class="form-error" role="alert" hidden></p>
      <div class="dialog-actions">
        ${entry ? '<button type="button" class="text-button danger" id="delete-entry">Устгах</button>' : '<span></span>'}
        <button type="submit" class="primary-button">${entry ? 'Хадгалах' : 'Бүртгэх'}</button>
      </div>
    </form>
    <p id="dialog-error" class="form-error" role="alert" hidden></p>
  `;

  dialog.querySelector<HTMLButtonElement>('#close-dialog')!.onclick = () => dialog.close();
  dialog.onclick = event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  };
  dialog.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach(button => {
    button.onclick = () => { dialog.querySelector<HTMLInputElement>('#amount')!.value = button.dataset.amount!; };
  });
  dialog.querySelector<HTMLButtonElement>('#delete-entry')?.addEventListener('click', () => {
    if (onDelete?.()) dialog.close();
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
      error.hidden = false;
      error.textContent = '1–5,000 мл бүхэл тоо, өнгөрсөн эсвэл одоогийн огноо оруулна уу.';
      return;
    }
    const timestamp = entry && localInput(new Date(entry.at)) === atValue ? entry.at : at.toISOString();
    const item: WaterEntry = { id: entry?.id ?? crypto.randomUUID(), amount, type, at: timestamp };
    if (entry?.deviceId) item.deviceId = entry.deviceId;
    if (onSave(item)) dialog.close();
  };
  dialog.showModal();
}
