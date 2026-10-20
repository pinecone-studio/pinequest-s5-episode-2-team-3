import './style.css';
import './settings.css';
import './pwa';
import type { AppState } from './data';
import { dateLabel, escape, number } from './format';
import { icon } from './components/Icon';
import { Toast, notify } from './components/Toast';
import { load, save, saveMessage, onExternalChange, requestPersistence } from './storage';
import { downloadBackup, readBackup, summarize, type BackupSummary } from './backup';

const app = document.querySelector<HTMLDivElement>('#app')!;
let { state, error: storageError, corrupt } = load();
// A validated backup waiting for the user's confirmation.
let pending: { state: AppState; name: string } | undefined;

const MODES = {
  goal: { label: 'Өдрийн зорилт', hint: 'Дор хаяж ийм хэмжээ уух' },
  limit: { label: 'Өдрийн дээд хязгаар', hint: 'Үүнээс хэтрүүлэхгүй байх' },
} as const;

const range = ({ count, first, last }: BackupSummary) =>
  !count ? '0 бүртгэл' : `${number(count)} бүртгэл · ${dateLabel(first!)}${first === last ? '' : ` – ${dateLabel(last!)}`}`;

function goalSection(): string {
  return `<section class="settings-section" aria-labelledby="goal-title">
    <h2 id="goal-title">Өдрийн тохиргоо</h2>
    <form id="goal-form" novalidate>
      <fieldset class="mode-options">
        <legend>Төрөл</legend>
        ${Object.entries(MODES).map(([mode, { label, hint }]) => `<label class="mode-option">
          <input type="radio" name="mode" value="${mode}" ${state.mode === mode ? 'checked' : ''}/>
          <span><strong>${label}</strong><small>${hint}</small></span>
        </label>`).join('')}
      </fieldset>
      <label for="goal">Хэмжээ, мл</label>
      <input id="goal" name="goal" type="number" inputmode="numeric" min="50" max="10000" step="1" required value="${state.goal}"/>
      <p id="goal-error" class="form-error" role="alert" hidden></p>
      <button type="submit" class="primary-button" ${corrupt ? 'disabled' : ''}>Хадгалах</button>
    </form>
  </section>`;
}

function restorePreview(): string {
  if (!pending) return '';
  const incoming = summarize(pending.state);
  return `<div class="restore-preview" id="restore-preview" role="region" aria-labelledby="restore-title" tabindex="-1">
    <h3 id="restore-title">Энэ нөөцийг сэргээх үү?</h3>
    <p class="file-name">${escape(pending.name)}</p>
    <dl>
      <div><dt>Нөөц файлд</dt><dd>${range(incoming)}<small>${MODES[pending.state.mode].label} ${number(pending.state.goal)} мл</small></dd></div>
      <div><dt>Одоо байгаа</dt><dd>${corrupt ? 'Уншигдахгүй өгөгдөл' : range(summarize(state))}<small>${corrupt ? '' : `${MODES[state.mode].label} ${number(state.goal)} мл`}</small></dd></div>
    </dl>
    <p class="restore-warning">Одоо байгаа бүх бүртгэл, тохиргоо энэ файлаар бүрэн солигдоно.</p>
    <div class="restore-actions">
      <button type="button" class="text-button subdued" id="cancel-restore">Болих</button>
      <button type="button" class="primary-button" id="confirm-restore">Сэргээх</button>
    </div>
  </div>`;
}

function backupSection(): string {
  return `<section class="settings-section" aria-labelledby="backup-title">
    <h2 id="backup-title">Нөөц</h2>
    <div class="backup-row">
      <div><strong>Нөөц татах</strong><p>${corrupt ? 'Уншигдах өгөгдөл алга.' : `Бүх ${number(state.events.length)} бүртгэл болон тохиргоог JSON файл болгон хадгална.`}</p></div>
      <button type="button" class="primary-button" id="download-backup" ${corrupt ? 'disabled' : ''}>Татах</button>
    </div>
    <div class="backup-row">
      <div><strong>Нөөцөөс сэргээх</strong><p>Файлыг шалгаад, таныг баталгаажуулсны дараа сэргээнэ.</p></div>
      <label class="file-button"><input type="file" id="backup-file" accept="application/json,.json"/>Файл сонгох</label>
    </div>
    <p id="backup-error" class="form-error" role="alert" hidden></p>
    ${restorePreview()}
  </section>`;
}

function render(): void {
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="/" aria-label="Дусал нүүр">${icon('drop')}Дусал<span>/ тохиргоо</span></a>
      <nav class="site-nav" aria-label="Хэсгүүд"><a href="/overview.html">Өдрийн тойм</a><a href="/">Ус бүртгэх</a><a href="/settings.html" aria-current="page">Тохиргоо</a></nav>
    </div></header>
    <main id="main" tabindex="-1">
      <div class="page-heading"><div><p class="page-kicker">ТОХИРГОО</p><h1>Тохиргоо ба нөөц</h1></div></div>
      <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      ${goalSection()}
      ${backupSection()}
      <footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
    ${Toast()}`;
  bind();
}

function reload(): void {
  ({ state, error: storageError, corrupt } = load());
  render();
}

// Writes `next`, or refreshes from storage and explains why it could not.
function commit(next: AppState, overwrite = false): boolean {
  const result = save(next, overwrite);
  if (result === 'saved') { state = next; storageError = ''; corrupt = false; return true; }
  if (result === 'conflict') reload();
  notify(saveMessage[result]);
  return false;
}

function showError(id: string, message: string): void {
  const element = document.querySelector<HTMLElement>(`#${id}`)!;
  element.textContent = message;
  element.hidden = !message;
}

function saveGoal(form: HTMLFormElement): void {
  const data = new FormData(form);
  const goal = Number(data.get('goal'));
  const mode = data.get('mode') === 'limit' ? 'limit' : 'goal';
  if (!Number.isInteger(goal) || goal < 50 || goal > 10000) {
    showError('goal-error', 'Хэмжээ 50–10,000 мл бүхэл тоо байна.');
    form.querySelector<HTMLInputElement>('#goal')!.focus();
    return;
  }
  const previous = { goal: state.goal, mode: state.mode };
  if (!commit({ ...state, goal, mode })) return;
  render();
  notify(`${MODES[mode].label}: ${number(goal)} мл болголоо.`, () => {
    if (commit({ ...state, ...previous })) { render(); notify('Өмнөх тохиргоог буцаалаа.'); }
  });
}

async function chooseFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    pending = { state: await readBackup(file), name: file.name };
  } catch (err) {
    pending = undefined;
    render();
    showError('backup-error', err instanceof Error ? err.message : 'Файлыг уншиж чадсангүй.');
    return;
  }
  render();
  document.querySelector<HTMLElement>('#restore-preview')?.focus();
}

function confirmRestore(): void {
  if (!pending) return;
  const previous = corrupt ? undefined : state;
  // Overwriting is what the user just confirmed, including unreadable data.
  if (!commit(pending.state, true)) return;
  pending = undefined;
  render();
  notify('Нөөцөөс сэргээлээ.', previous && (() => {
    if (commit(previous)) { render(); notify('Сэргээхээс өмнөх байдалд буцаалаа.'); }
  }));
}

function bind(): void {
  const form = document.querySelector<HTMLFormElement>('#goal-form')!;
  form.onsubmit = event => { event.preventDefault(); saveGoal(form); };
  form.oninput = () => showError('goal-error', '');
  document.querySelector<HTMLButtonElement>('#download-backup')!.onclick = () => {
    downloadBackup(state);
    notify('Нөөц файлыг татлаа.');
  };
  document.querySelector<HTMLInputElement>('#backup-file')!.onchange = event => chooseFile(event.target as HTMLInputElement);
  document.querySelector<HTMLButtonElement>('#confirm-restore')?.addEventListener('click', confirmRestore);
  document.querySelector<HTMLButtonElement>('#cancel-restore')?.addEventListener('click', () => { pending = undefined; render(); });
}

onExternalChange(() => { reload(); notify('Өөр цонхонд мэдээлэл өөрчлөгдсөн тул шинэчиллээ.'); });
requestPersistence();
render();
