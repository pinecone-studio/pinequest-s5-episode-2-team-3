import { dayKey, validateState, type AppState } from './data';

const MAX_BYTES = 5 * 1024 * 1024;

export interface BackupSummary { count: number; first?: string; last?: string }

export function summarize(state: AppState): BackupSummary {
  const days = state.events.map(event => dayKey(new Date(event.at))).sort();
  return { count: days.length, first: days[0], last: days.at(-1) };
}

// The backup file uses the same shape as localStorage, so one validator covers both.
export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `dusal-backup-${dayKey()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file: File): Promise<AppState> {
  if (file.size > MAX_BYTES) throw new Error('Файл хэт том байна (5 MB-аас ихгүй).');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл JSON биш эсвэл гэмтсэн байна.');
  }
  return validateState(data);
}
