import type { WaterEntry } from './data';
import { cupIcon } from './hydrify';

// Drink kinds for the Hydrify demo (kit screens 28, 35): water by default, or one of the drinks
// below. The kind is kept beside the entries (entry id → kind) on this device only, so the shared
// contract and the server stay as they are.
const KEY = 'dusal-drink-kind-v1';

const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const cup = (fill: string, top = '#fff') => svg(`<path d="M8 9h16l-2 18H10z" fill="${fill}"/><path d="M7 6h18v4H7z" fill="${top}" stroke="${fill}" stroke-width="1.5"/>`);
const glass = (fill: string) => svg(`<path d="M9 5h14l-1.6 23H10.6z" fill="#eef1f5"/><path d="M9.7 12h12.6l-1.1 16H10.8z" fill="${fill}"/>`);
const can = (fill: string) => svg(`<rect x="10" y="5" width="12" height="23" rx="3" fill="${fill}"/><path d="M10 10h12" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="18" r="2.5" fill="#fff"/>`);
const bottle = (fill: string) => svg(`<path d="M13 3h6v5l3 4v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V12l3-4z" fill="${fill}"/><path d="M10 16h12v6H10z" fill="#fff" opacity=".7"/>`);

export const KINDS = {
  coffee: { name: 'Кофе', icon: cup('#7a4a2a') },
  tea: { name: 'Цай', icon: cup('#e2553f') },
  juice: { name: 'Жүүс', icon: glass('#f5a623') },
  sport: { name: 'Спорт ундаа', icon: bottle('#369fff') },
  coconut: { name: 'Наргил', icon: svg('<circle cx="16" cy="18" r="10" fill="#8bc34a"/><path d="M16 4v8" stroke="#5d4037" stroke-width="2"/>') },
  smoothie: { name: 'Смүүти', icon: glass('#26c6da') },
  chocolate: { name: 'Шоколад', icon: cup('#5d4037', '#d7ccc8') },
  carbon: { name: 'Хийжүүлсэн ус', icon: glass('#ef6c57') },
  soda: { name: 'Сод', icon: can('#e53935') },
  wine: { name: 'Дарс', icon: svg('<path d="M10 4h12c0 7-2 11-6 11S10 11 10 4z" fill="#8e24aa"/><path d="M16 15v10M11 27h10" stroke="#8e24aa" stroke-width="2"/>') },
  beer: { name: 'Шар айраг', icon: glass('#ffb300') },
  liquor: { name: 'Архи', icon: bottle('#3949ab') },
} as const;
export type Kind = keyof typeof KINDS;

function readMap(): Record<string, Kind> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function kindOf(entry: WaterEntry): Kind | undefined {
  const k = readMap()[entry.id];
  return k && k in KINDS ? k : undefined;
}

export function setKind(id: string, kind: Kind | undefined): void {
  const map = readMap();
  if (kind) map[id] = kind; else delete map[id];
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* shown as water */ }
}

export const entryName = (e: WaterEntry): string => { const k = kindOf(e); return k ? KINDS[k].name : e.deviceId ? 'Ус (суурь)' : 'Ус'; };
export const entryIcon = (e: WaterEntry): string => { const k = kindOf(e); return k ? KINDS[k].icon : cupIcon(e.amount); };
