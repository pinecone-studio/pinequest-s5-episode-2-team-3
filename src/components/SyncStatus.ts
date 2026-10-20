import { sync, startSync } from '../sync';
import { escape } from '../format';
import { store } from '../storage';
import { TYPES, type WaterEntry } from '../data';
import type { Choices } from '../../shared/sync';
import './sync-status.css';

export function SyncStatus(): string { return '<section class="sync-status" aria-label="Серверийн синк"><div data-sync-status></div></section>'; }
function value(item: unknown): string {
  if (!item) return 'Устгасан';
  if ('goal' in (item as object)) { const s = item as { goal: number; mode: string }; return `${s.mode === 'limit' ? 'Хязгаар' : 'Зорилт'} ${s.goal} мл`; }
  const e = item as WaterEntry;
  return `${TYPES[e.type]} · ${e.amount} мл · ${new Date(e.at).toLocaleString('mn-MN')}`;
}
let listening = false;
export function bindSyncStatus(): void {
  startSync();
  if (!listening) { window.addEventListener('dusal-sync-status', renderStatus); listening = true; }
  renderStatus();
}
function renderStatus(): void {
  const host = document.querySelector<HTMLElement>('[data-sync-status]');
  if (!host) return;
  // Keep conflict selections and connection confirmation while the user is reviewing them.
  const signature = JSON.stringify(sync.info);
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  const { phase, message, conflicts } = sync.info;
  const connect = phase === 'local' ? `<details><summary>Сервертэй холбох</summary><p>Энэ төхөөрөмжийн бүртгэлийг серверийнхтэй нэгтгэнэ. Зөрсөн мэдээллийг таны сонголтоор шийднэ. Одоогийн сервер хэрэглэгчээр тусгаарлаагүй тул зөвхөн багийн туршилтын өгөгдөл холбоно.</p><button type="button" data-connect>Ойлголоо, холбох</button></details>` : '';
  const conflictForm = conflicts.length ? `<form data-resolve><p>Зөвхөн зөрсөн мэдээллийг сонгоно. Бусад бүртгэл хоёр талаас хадгалагдана.</p>${conflicts.map((c, i) => `<fieldset><legend>${c.key === 'settings' ? 'Өдрийн тохиргоо' : `Бүртгэл ${i + 1}`}</legend><label><input type="radio" name="choice-${i}" value="local" required> Энэ төхөөрөмж: ${escape(value(c.local))}</label><label><input type="radio" name="choice-${i}" value="remote" required> Сервер: ${escape(value(c.remote))}</label></fieldset>`).join('')}<button type="submit">Сонголтыг хадгалах</button></form>` : '';
  host.innerHTML = `<p role="status">${escape(message)}</p>${connect}${phase !== 'local' && phase !== 'syncing' ? `<div class="sync-actions"><button type="button" data-retry>${phase === 'paused' ? 'Үргэлжлүүлэх' : 'Дахин синк хийх'}</button>${phase !== 'paused' ? '<button type="button" data-pause>Түр зогсоох</button>' : ''}</div>` : ''}${conflictForm}<p class="sync-ui-error" role="alert" hidden></p>`;
  async function action(fn: () => Promise<void>) {
    host!.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    try { await fn(); }
    catch { const error = host!.querySelector<HTMLElement>('.sync-ui-error'); if (error) { error.hidden = false; error.textContent = 'Хадгалж чадсангүй. Браузерын хадгалалтыг шалгаад дахин оролдоно уу.'; } }
    finally { host!.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); }
  }
  host.querySelector('[data-connect]')?.addEventListener('click', () => void action(async () => {
    const current = await store.read();
    if (!confirm(`${current.state.events.length} бүртгэл болон өдрийн тохиргоог сервертэй нэгтгэх үү? Багийн серверт дамжуулна.`)) return;
    await sync.connect();
  }));
  host.querySelector('[data-retry]')?.addEventListener('click', () => void action(() => sync.connect()));
  host.querySelector('[data-pause]')?.addEventListener('click', () => void action(() => sync.pause()));
  host.querySelector<HTMLFormElement>('[data-resolve]')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const choices: Choices = {};
    conflicts.forEach((conflict, i) => { choices[conflict.key] = data.get(`choice-${i}`) === 'remote' ? 'remote' : 'local'; });
    void action(() => sync.choose(choices));
  });
}
