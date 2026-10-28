import type { WaterEntry } from './data';
import { cupIcon } from './hydrify';

// Drink kinds: water by default, or one of the drinks below. The kind is kept beside the entries
// (entry id → kind) on this device only, so the shared contract and the server stay as they are.
// TODO: add optional kind / salty to WaterEntry (shared/contracts.ts) with a migration so they sync.
const KEY = 'dusal-drink-kind-v1';
const SALTY_KEY = 'dusal-drink-salty-v1';

const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const cup = (fill: string, top = '#fff') => svg(`<path d="M8 9h16l-2 18H10z" fill="${fill}"/><path d="M7 6h18v4H7z" fill="${top}" stroke="${fill}" stroke-width="1.5"/>`);
const glass = (fill: string) => svg(`<path d="M9 5h14l-1.6 23H10.6z" fill="#eef1f5"/><path d="M9.7 12h12.6l-1.1 16H10.8z" fill="${fill}"/>`);
const can = (fill: string) => svg(`<rect x="10" y="5" width="12" height="23" rx="3" fill="${fill}"/><path d="M10 10h12" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="18" r="2.5" fill="#fff"/>`);
const bottle = (fill: string) => svg(`<path d="M13 3h6v5l3 4v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V12l3-4z" fill="${fill}"/><path d="M10 16h12v6H10z" fill="#fff" opacity=".7"/>`);

export const KINDS = {
  milkTea: { name: 'Сүүтэй цай', icon: cup('#d2a679') },
  tea: { name: 'Цай', icon: cup('#e2553f') },
  soup: { name: 'Шөл', icon: svg('<path d="M4 14h24a12 10 0 0 1-24 0z" fill="#f2b84b"/><path d="M11 6c-1 2 1 3 0 5M16 5c-1 2 1 3 0 5M21 6c-1 2 1 3 0 5" stroke="#c9c9c9" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M9 27h14" stroke="#e0a22f" stroke-width="2.5" stroke-linecap="round"/>') },
  coffee: { name: 'Кофе', icon: cup('#7a4a2a') },
  juice: { name: 'Жүүс', icon: glass('#f5a623') },
  soda: { name: 'Кола, газтай ундаа', icon: can('#e53935') },
  airag: { name: 'Айраг', icon: svg('<path d="M7 10h18l-2 17H9z" fill="#f3efe6" stroke="#cdbfa4" stroke-width="1.5"/><path d="M6 8h20" stroke="#8d6e4c" stroke-width="2.5" stroke-linecap="round"/>') },
  carbon: { name: 'Газтай ус', icon: glass('#9fd3f5') },
  chocolate: { name: 'Какао', icon: cup('#5d4037', '#d7ccc8') },
  alcohol: { name: 'Согтууруулах ундаа', icon: svg('<path d="M10 4h12c0 7-2 11-6 11S10 11 10 4z" fill="#8e24aa"/><path d="M16 15v10M11 27h10" stroke="#8e24aa" stroke-width="2"/>') },
  // Fluids in food and dairy. Under a doctor's fluid limit (kidney or heart failure) all of these count too.
  milk: { name: 'Сүү', icon: glass('#c9d6e6') },
  yogurt: { name: 'Тараг', icon: cup('#e8d9b5', '#9fb0bc') },
  iceCream: { name: 'Зайрмаг', icon: svg('<path d="M11 15h10l-5 13z" fill="#d9a066"/><circle cx="16" cy="11" r="6" fill="#f8bbd0"/>') },
  ice: { name: 'Мөс', icon: svg('<rect x="8" y="8" width="16" height="16" rx="3" fill="#b3e5fc"/><path d="M12 12l4 2" stroke="#fff" stroke-width="2"/>') },
  melon: { name: 'Тарвас, жимс', icon: svg('<path d="M4 10a12 12 0 0 0 24 0z" fill="#4caf50"/><path d="M6.5 10a9.5 9.5 0 0 0 19 0z" fill="#ef5350"/><circle cx="13" cy="14" r="1" fill="#333"/><circle cx="19" cy="14" r="1" fill="#333"/>') },
} as const;
export type Kind = keyof typeof KINDS;
// The drink sheet's two groups: «Түгээмэл» (after water) and «Бусад» (the food fluids last).
export const COMMON: readonly Kind[] = ['milkTea', 'tea', 'soup', 'coffee'];
export const OTHER: readonly Kind[] = ['juice', 'soda', 'airag', 'carbon', 'chocolate', 'alcohol', 'milk', 'yogurt', 'iceCream', 'ice', 'melon'];
// Only these two come salty or not.
export const SALTABLE: readonly Kind[] = ['milkTea', 'soup'];
// A usual serving in ml of fluid, to start the amount from (a scoop of ice cream, a slice of watermelon...).
export const SERVING: Partial<Record<Kind, number>> = { yogurt: 150, iceCream: 100, ice: 30, melon: 150 };

// Kinds no longer offered: wine, beer and liquor read as «Согтууруулах ундаа»; the others keep their
// old name and icon so past entries still show as they were.
const RENAMED: Record<string, Kind> = { wine: 'alcohol', beer: 'alcohol', liquor: 'alcohol' };
const LEGACY: Record<string, { name: string; icon: string }> = {
  coconut: { name: 'Наргил', icon: svg('<circle cx="16" cy="18" r="10" fill="#8bc34a"/><path d="M16 4v8" stroke="#5d4037" stroke-width="2"/>') },
  smoothie: { name: 'Смүүти', icon: glass('#26c6da') },
  sport: { name: 'Спорт ундаа', icon: bottle('#0056ff') },
};

function readMap(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function kindOf(entry: WaterEntry): Kind | undefined {
  const k = readMap()[entry.id];
  if (k && k in RENAMED) return RENAMED[k];
  return k && k in KINDS ? (k as Kind) : undefined;
}

export function setKind(id: string, kind: Kind | undefined): void {
  const map = readMap();
  if (kind) map[id] = kind; else delete map[id];
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* shown as water */ }
}

// Salty milk tea or soup, beside the kind (entry id → true); the nurse's report counts them.
function readSalty(): Record<string, true> {
  try { const v = JSON.parse(localStorage.getItem(SALTY_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export const isSalty = (entry: WaterEntry): boolean => !!readSalty()[entry.id];
export function setSalty(id: string, salty: boolean): void {
  const map = readSalty();
  if (salty) map[id] = true; else delete map[id];
  try { localStorage.setItem(SALTY_KEY, JSON.stringify(map)); } catch { /* not marked */ }
}

const legacy = (e: WaterEntry) => LEGACY[readMap()[e.id]];
export const entryName = (e: WaterEntry): string => {
  const k = kindOf(e);
  if (k) return `${KINDS[k].name}${isSalty(e) ? ' · давстай' : ''}`;
  return legacy(e)?.name ?? (e.deviceId ? 'Ус (суурь)' : 'Ус');
};
export const entryIcon = (e: WaterEntry): string => { const k = kindOf(e); return k ? KINDS[k].icon : legacy(e)?.icon ?? cupIcon(e.amount); };
