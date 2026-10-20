export const STORAGE_KEY = 'dusal-v1';
export const TYPES = { drink: 'Уусан', spill: 'Асгасан', pending: 'Тодорхойгүй' } as const;
export type EntryType = keyof typeof TYPES;
export interface WaterEntry {
  id: string;
  amount: number;
  type: EntryType;
  at: string;
}
export interface AppState {
  goal: number;
  mode: 'goal' | 'limit';
  events: WaterEntry[];
}

// Preserve the shared storage format; this part only edits events.
export const defaults = (): AppState => ({ goal: 2000, mode: 'goal', events: [] });

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === 'string' && Object.hasOwn(TYPES, value);
}

export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localInput(date = new Date()): string {
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validateState(data: unknown): AppState {
  if (typeof data !== 'object' || data === null) throw new Error('Файлын бүтэц буруу байна.');
  const { goal, mode, events } = data as Record<string, unknown>;
  if (typeof goal !== 'number' || !Number.isInteger(goal) || goal < 50 || goal > 10000 ||
      (mode !== 'goal' && mode !== 'limit') || !Array.isArray(events)) {
    throw new Error('Файлын бүтэц эсвэл өдрийн тохиргоо буруу байна.');
  }
  const ids = new Set<string>();
  const entries = events.map((value: unknown): WaterEntry => {
    if (typeof value !== 'object' || value === null) throw new Error('Бүртгэлийн бүтэц буруу байна.');
    const { id, amount, type, at } = value as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id) ||
        typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 5000 ||
        !isEntryType(type) || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) {
      throw new Error('Файлд хүчингүй эсвэл давхардсан бүртгэл байна.');
    }
    ids.add(id);
    return { id, amount, type, at: new Date(at).toISOString() };
  });
  return { goal, mode, events: entries };
}

export function sortedEvents(events: readonly WaterEntry[]): WaterEntry[] {
  return [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
