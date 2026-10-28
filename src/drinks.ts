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
  // Fluids in food and dairy. Under a doctor's fluid limit (kidney or heart failure) all of these count too.
  milkTea: { name: 'Сүүтэй цай', icon: svg('<path d="M5 12h22c0 8-5 13-11 13S5 20 5 12z" fill="#d7b98e"/><path d="M5 12h22" stroke="#a1795a" stroke-width="2"/>') },
  milk: { name: 'Сүү', icon: glass('#c9d6e6') },
  yogurt: { name: 'Тараг', icon: cup('#e8d9b5', '#9fb0bc') },
  airag: { name: 'Айраг', icon: svg('<path d="M5 12h22c0 8-5 13-11 13S5 20 5 12z" fill="#e2dbc2"/><path d="M5 12h22" stroke="#8d856c" stroke-width="2"/>') },
  soup: { name: 'Шөл', icon: svg('<path d="M4 13h24c0 7-5 12-12 12S4 20 4 13z" fill="#e8a33d"/><path d="M11 9c0-2 2-2 2-4M17 9c0-2 2-2 2-4" stroke="#e8a33d" stroke-width="1.5" fill="none"/>') },
  iceCream: { name: 'Зайрмаг', icon: svg('<path d="M11 15h10l-5 13z" fill="#d9a066"/><circle cx="16" cy="11" r="6" fill="#f8bbd0"/>') },
  ice: { name: 'Мөс', icon: svg('<rect x="8" y="8" width="16" height="16" rx="3" fill="#b3e5fc"/><path d="M12 12l4 2" stroke="#fff" stroke-width="2"/>') },
  melon: { name: 'Тарвас, жимс', icon: svg('<path d="M4 10a12 12 0 0 0 24 0z" fill="#4caf50"/><path d="M6.5 10a9.5 9.5 0 0 0 19 0z" fill="#ef5350"/><circle cx="13" cy="14" r="1" fill="#333"/><circle cx="19" cy="14" r="1" fill="#333"/>') },
} as const;
export type Kind = keyof typeof KINDS;
export const FOOD_KINDS: readonly Kind[] = ['milkTea', 'milk', 'yogurt', 'airag', 'soup', 'iceCream', 'ice', 'melon'];
// A usual serving in ml of fluid, to start the amount from (a bowl of soup, a slice of watermelon...).
export const SERVING: Partial<Record<Kind, number>> = { milkTea: 250, soup: 250, yogurt: 150, iceCream: 100, ice: 30, melon: 150 };

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
