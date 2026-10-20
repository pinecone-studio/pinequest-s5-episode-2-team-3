import { defaults, type AppState } from './data';
import { LocalStore } from './local-store';

export type SaveResult = 'saved' | 'conflict' | 'corrupt' | 'failed';
export interface Loaded { state: AppState; error: string; corrupt: boolean }
export const store = new LocalStore();
let sequence = -1;
let corrupt = false;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('dusal-data-v2');
const callbacks = new Set<() => void>();
export function announce(source: 'local' | 'sync' | 'status' | 'device' = 'sync'): void {
  channel?.postMessage(source);
  if (source === 'device') { window.dispatchEvent(new Event('dusal-device-view')); return; }
  window.dispatchEvent(new Event('dusal-sync-status'));
  if (source === 'sync') callbacks.forEach(fn => fn());
  if (source === 'local') window.dispatchEvent(new Event('dusal-local-save'));
}
channel?.addEventListener('message', event => {
  if (event.data === 'device') { window.dispatchEvent(new Event('dusal-device-cache')); return; }
  window.dispatchEvent(new Event('dusal-sync-status'));
  if (event.data !== 'status') callbacks.forEach(fn => fn());
});

export async function load(): Promise<Loaded> {
  try {
    const record = await store.read();
    sequence = record.sequence;
    corrupt = false;
    return { state: record.state, error: '', corrupt };
  } catch {
    corrupt = true;
    return { state: defaults(), corrupt, error: 'Хадгалсан мэдээллийг уншиж чадсангүй. Өмнөх мэдээллийг хамгаалахын тулд өөрчлөлт хадгалахгүй. Браузерын хадгалах эрхийг шалгана уу.' };
  }
}

export async function save(next: AppState, overwrite = false): Promise<SaveResult> {
  if (corrupt && !overwrite) return 'corrupt';
  const expected = sequence;
  try {
    const result = await store.update(record => {
      // Confirmed backup restore may replace current readable state; pending requests remain intact.
      if (!overwrite && record.sequence !== expected) return 'conflict' as const;
      record.state = next;
      return 'saved' as const;
    }, overwrite ? next : undefined);
    // Do not advance the page's read version until it actually reloads its rendered snapshot.
    if (result === 'saved') { corrupt = false; announce('local'); }
    return result;
  } catch { return 'failed'; }
}

export const saveMessage: Record<Exclude<SaveResult, 'saved'>, string> = {
  conflict: 'Мэдээлэл өөрчлөгдсөн тул шинэчиллээ. Үйлдлээ дахин хийнэ үү.',
  corrupt: 'Хадгалсан өгөгдөл уншигдахгүй байна. Өөрчлөлт оруулаагүй.',
  failed: 'Хадгалж чадсангүй. Браузерын хадгалах эрх, сул зайг шалгаад дахин оролдоно уу.',
};
export function onExternalChange(callback: () => void): void {
  let pending = false;
  const flush = () => {
    // A stale form gets an explicit save conflict; background sync must not erase typed input.
    if (!pending || document.querySelector('dialog[open], form[data-dirty]')) return;
    pending = false;
    callback();
  };
  callbacks.add(() => { pending = true; flush(); });
  document.addEventListener('close', () => queueMicrotask(flush), true);
  document.addEventListener('focusout', () => queueMicrotask(flush));
  window.addEventListener('dusal-sync-status', () => queueMicrotask(flush));
}
// Filters and other `data-transient` forms hold nothing to lose, so they never block a refresh.
document.addEventListener('input', event => {
  (event.target as HTMLElement).closest('form:not([data-transient])')?.setAttribute('data-dirty', '');
});
// A closed dialog keeps its form in the DOM; its input is discarded, so it must stop blocking.
document.addEventListener('close', event => {
  (event.target as Element).querySelectorAll?.('form[data-dirty]').forEach(form => form.removeAttribute('data-dirty'));
}, true);
export function requestPersistence(): void { navigator.storage?.persist?.().catch(() => {}); }
