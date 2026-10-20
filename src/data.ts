import type { AppState, WaterEntry } from '../shared/contracts';
export { TYPES, isEntryType, validateState } from '../shared/contracts';
export type { EntryType, WaterEntry, AppState } from '../shared/contracts';

export const STORAGE_KEY = 'dusal-v1';
// Preserve the shared storage format; this part only edits events.
export const defaults = (): AppState => ({ goal: 2000, mode: 'goal', events: [] });

export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localInput(date = new Date()): string {
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function sortedEvents(events: readonly WaterEntry[]): WaterEntry[] {
  return [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
