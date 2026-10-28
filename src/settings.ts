import { SyncStatus, bindSyncStatus } from './components/SyncStatus';
import { DevicePanel, bindDevicePanel } from './components/DevicePanel';
import { WatchPanel, bindWatchPanel } from './components/WatchPanel';
import { ProfilePanel, bindProfilePanel } from './components/ProfilePanel';
import { hxHeader } from './hydrify';
import { accountViews } from './account';
import { confirmSheet } from './hx-edit';
import './style.css';
import './shell.css';
import './settings.css';
import './pwa';
import { dayKey, defaults, type AppState } from './data';
import { dateLabel, escape, number } from './format';
import { brandMark } from './components/Icon';
import { siteNav } from './nav';
import { Toast, notify } from './components/Toast';
import { load, save, saveMessage, onExternalChange, requestPersistence } from './storage';
import { downloadBackup, readBackup, summarize, type BackupSummary } from './backup';
import './theme.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
let state = defaults();
let storageError = '';
let corrupt = false;
let committing = false;
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
      <button type="submit" class="dark-button" ${corrupt ? 'disabled' : ''}>Хадгалах</button>
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
      <button type="button" class="dark-button" id="confirm-restore">Сэргээх</button>
    </div>
  </div>`;
}

function backupSection(): string {
  return `<section class="settings-section" aria-labelledby="backup-title">
    <h2 id="backup-title">Нөөц</h2>
    <div class="backup-row">
      <div><strong>Нөөц татах</strong><p>${corrupt ? 'Уншигдах өгөгдөл алга.' : `Бүх ${number(state.events.length)} бүртгэл болон тохиргоог JSON файл болгон хадгална.`}</p></div>
      <button type="button" class="dark-button" id="download-backup" ${corrupt ? 'disabled' : ''}>Татах</button>
    </div>
    <div class="backup-row">
      <div><strong>Нөөцөөс сэргээх</strong><p>Файлыг шалгаад, таныг баталгаажуулсны дараа сэргээнэ.</p></div>
      <label class="file-button"><input type="file" id="backup-file" accept="application/json,.json"/>Файл сонгох</label>
    </div>
    <p id="backup-error" class="form-error" role="alert" hidden></p>
    ${restorePreview()}
  </section>`;
}

// Account screen, Hydrify layout (demo): a menu; each row opens its own screen (#hash) that holds
// the existing settings sections. Security and appearance are demo screens only.
const ICON = (d: string) => `<svg class="ac-icon" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  personal: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  reminders: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  widgets: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="17" height="7" rx="2"/>',
  cups: '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2M7 3.5c0 1.5 1 1.5 1 3M11 3.5c0 1.5 1 1.5 1 3"/>',
  preferences: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.5"/>',
  security: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  linked: '<path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  appearance: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  data: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M7 15l3.5-3.5 2.5 2.5L17 10"/>',
  help: '<path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 12h6M9 16h4"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
};

function menu(): string {
  const row = (key: keyof typeof ICONS, label: string, href = `#${key}`) => `<li><a href="${href}">${ICON(ICONS[key])}<span>${label}</span><i aria-hidden="true">›</i></a></li>`;
  return `<section class="hx-card ac-menu"><ul>
      ${row('personal', 'Хувийн мэдээлэл')}${row('reminders', 'Уух сануулга', '#reminder')}${row('cups', 'Миний аяганууд')}${row('widgets', 'Нүүр дэлгэцийн widget')}${row('preferences', 'Тохиргоо')}
    </ul></section>
    <section class="hx-card ac-menu"><ul>
      ${row('security', 'Бүртгэл ба аюулгүй байдал')}${row('linked', 'Холбосон бүртгэл')}
      ${row('appearance', 'Харагдах байдал')}${row('data', 'Өгөгдөл ба шинжилгээ')}${row('help', 'Тусламж')}
      <li><button type="button" class="ac-logout" data-logout>${ICON(ICONS.logout)}<span>Гарах</span></button></li>
    </ul></section>`;
}

// Logout clears this phone's profile and name, then onboarding starts again. The water log stays.
function logout(): void {
  for (const key of ['dusal-onboarded-v1', 'dusal-profile-v1', 'dusal-member-v1']) { try { localStorage.removeItem(key); } catch { /* nothing kept */ } }
  location.href = '/';
}

// "Restart all tracking": empties the water log, with undo.
async function restart(): Promise<void> {
  const previous = state;
  if (!await commit({ ...state, events: [] })) return;
  render();
  notify('Бүх бүртгэл устгагдлаа.', async () => { if (await commit({ ...state, events: previous.events })) { render(); notify('Бүртгэлийг сэргээв.'); } });
}

const viewFor = accountViews({
  state: () => state, goalSection, backupSection: () => backupSection(),
  devices: () => WatchPanel() + DevicePanel() + SyncStatus(),
  profilePanel: () => ProfilePanel(),
  restart: () => void restart(), logout, redraw: () => render(),
});

function render(): void {
  const view = viewFor(location.hash.slice(1));
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app settings-page${view ? ' ac-subview' : ''}" tabindex="-1">
      <div class="app-shell">
        <header class="app-top">${siteNav('settings')}</header>
        <div class="hydro hx-page">
          ${view ? `<div class="hx-header"><a class="hx-back" href="#${view.back}" aria-label="Буцах">‹</a><h1>${view.title}</h1>${view.right ?? '<span></span>'}</div>` : hxHeader('Профайл')}
          <p class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
          ${view ? view.body() : menu()}
          ${view?.foot ? `<div class="ac-foot">${view.foot}</div>` : ''}
        </div>
      </div>
    </main>
    ${Toast()}`;
  bind();
  if (view?.bind) view.bind(app.querySelector<HTMLElement>('.hx-page')!);
  bindSyncStatus();
  bindDevicePanel(render);
  bindWatchPanel();
  bindProfilePanel();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

async function reload(): Promise<void> {
  ({ state, error: storageError, corrupt } = await load());
  render();
}

// Writes `next`, or refreshes from storage and explains why it could not.
async function commit(next: AppState, overwrite = false): Promise<boolean> {
  if (committing) return false;
  committing = true;
  const result = await save(next, overwrite);
  committing = false;
  if (result === 'saved') { ({ state, error: storageError, corrupt } = await load()); return true; }
  if (result === 'conflict') await reload();
  notify(saveMessage[result]);
  return false;
}

function showError(id: string, message: string): void {
  const element = document.querySelector<HTMLElement>(`#${id}`)!;
  element.textContent = message;
  element.hidden = !message;
}

async function saveGoal(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const goal = Number(data.get('goal'));
  const mode = data.get('mode') === 'limit' ? 'limit' : 'goal';
  if (!Number.isInteger(goal) || goal < 50 || goal > 10000) {
    showError('goal-error', 'Хэмжээ 50–10,000 мл бүхэл тоо байна.');
    form.querySelector<HTMLInputElement>('#goal')!.focus();
    return;
  }
  const previous = { goal: state.goal, mode: state.mode };
  if (!await commit({ ...state, goal, mode })) return;
  render();
  notify(`${MODES[mode].label}: ${number(goal)} мл болголоо.`, async () => {
    if (await commit({ ...state, ...previous })) { render(); notify('Өмнөх тохиргоог буцаалаа.'); }
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

async function confirmRestore(): Promise<void> {
  if (!pending) return;
  const previous = corrupt ? undefined : state;
  // Overwriting is what the user just confirmed, including unreadable data.
  if (!await commit(pending.state, true)) return;
  pending = undefined;
  render();
  notify('Нөөцөөс сэргээлээ.', previous && (async () => {
    if (await commit(previous)) { render(); notify('Сэргээхээс өмнөх байдалд буцаалаа.'); }
  }));
}

function bind(): void {
  // Each account screen shows only some sections, so every part is optional here.
  const form = document.querySelector<HTMLFormElement>('#goal-form');
  if (form) {
    form.onsubmit = event => { event.preventDefault(); saveGoal(form); };
    form.oninput = () => showError('goal-error', '');
  }
  const download = document.querySelector<HTMLButtonElement>('#download-backup');
  if (download) download.onclick = () => { downloadBackup(state); notify('Нөөц файлыг татлаа.'); };
  const file = document.querySelector<HTMLInputElement>('#backup-file');
  if (file) file.onchange = event => chooseFile(event.target as HTMLInputElement);
  document.querySelector('[data-logout]')?.addEventListener('click', () => confirmSheet('Гарах', 'Та гарахдаа итгэлтэй байна уу? Усны бүртгэл хадгалагдана.', 'Тийм, гарах', logout));
  document.querySelector<HTMLButtonElement>('#confirm-restore')?.addEventListener('click', confirmRestore);
  document.querySelector<HTMLButtonElement>('#cancel-restore')?.addEventListener('click', () => { pending = undefined; render(); });
}

onExternalChange(() => { void reload(); });
requestPersistence();
void reload();
