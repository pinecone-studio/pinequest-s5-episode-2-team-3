import { STORAGE_KEY, defaults, validateState, type AppState } from './data';

export type SaveResult = 'saved' | 'conflict' | 'corrupt' | 'failed';
export interface Loaded { state: AppState; error: string; corrupt: boolean }

// Raw value we last read or wrote; used to detect writes from other tabs.
let savedRaw: string | null = null;
let corrupt = false;

export function load(): Loaded {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    corrupt = true;
    return { state: defaults(), corrupt, error: 'Браузер мэдээлэл хадгалахыг зөвшөөрөхгүй байна. Хувийн цонх эсвэл сайтын тохиргоогоо шалгана уу.' };
  }
  savedRaw = raw;
  try {
    const state = raw ? validateState(JSON.parse(raw)) : defaults();
    corrupt = false;
    return { state, corrupt, error: '' };
  } catch {
    corrupt = true;
    return { state: defaults(), corrupt, error: 'Хадгалсан өгөгдөл эвдэрсэн тул уншиж чадсангүй. Өмнөх мэдээллийг хамгаалахын тулд өөрчлөлт хадгалахгүй. Нөөц файлаас сэргээж болно.' };
  }
}

// `overwrite` replaces unreadable or newer data; only use it after the user confirmed.
export function save(next: AppState, overwrite = false): SaveResult {
  try {
    if (!overwrite) {
      if (corrupt) return 'corrupt';
      if (localStorage.getItem(STORAGE_KEY) !== savedRaw) return 'conflict';
    }
    const raw = JSON.stringify(validateState(next));
    localStorage.setItem(STORAGE_KEY, raw);
    savedRaw = raw;
    corrupt = false;
    return 'saved';
  } catch {
    return 'failed';
  }
}

export const saveMessage: Record<Exclude<SaveResult, 'saved'>, string> = {
  conflict: 'Өөр цонхонд мэдээлэл өөрчлөгдсөн тул шинэчиллээ. Дахин оролдоно уу.',
  corrupt: 'Хадгалсан өгөгдөл уншигдахгүй байна. Өөрчлөлт оруулаагүй.',
  failed: 'Хадгалж чадсангүй. Браузерын хадгалах эрх, сул зайг шалгаад дахин оролдоно уу.',
};

export function onExternalChange(callback: () => void): void {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  });
}

// Ask the browser not to evict our data under storage pressure; failure is harmless.
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}
