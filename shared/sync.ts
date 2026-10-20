import { ContractError, validateId, validateState, type AppState } from './contracts';

export interface Snapshot { revision: number; state: AppState }
export interface Mutation { id: string; baseRevision: number; state: AppState }
export type Conflict = { key: string; local: unknown; remote: unknown };
export type Choices = Record<string, 'local' | 'remote'>;

export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ContractError('Серверийн хувилбар буруу байна.');
  return value;
}
export function snapshot(value: unknown): Snapshot {
  const body = value as Snapshot | null;
  return { revision: revision(body?.revision), state: validateState(body?.state) };
}
export function mutation(value: unknown): Mutation {
  const body = value as Mutation | null;
  return { id: validateId(body?.id), baseRevision: revision(body?.baseRevision), state: validateState(body?.state) };
}
export function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
export function sameState(a: AppState, b: AppState): boolean {
  return equal(canonical(a), canonical(b));
}
export function canonical(state: AppState): AppState {
  const valid = validateState(state);
  return { ...valid, events: valid.events.sort((a, b) => a.id.localeCompare(b.id)) };
}

// Missing base means first connection: union records; ask before replacing shared IDs/settings.
export function merge(base: AppState | null, local: AppState, remote: AppState, choices: Choices = {}) {
  const conflicts: Conflict[] = [];
  function pick<T>(key: string, before: T | undefined, here: T, there: T): T {
    if (equal(here, there) || (base && equal(there, before))) return here;
    if (base && equal(here, before)) return there;
    if (!base && before === undefined && (here === undefined || there === undefined)) return here ?? there;
    if (choices[key]) return choices[key] === 'local' ? here : there;
    conflicts.push({ key, local: here, remote: there });
    return here;
  }
  const settings = (s: AppState) => ({ goal: s.goal, mode: s.mode });
  const goal = pick('settings', base ? settings(base) : undefined, settings(local), settings(remote));
  const b = new Map(base?.events.map(e => [e.id, e]) ?? []);
  const l = new Map(local.events.map(e => [e.id, e]));
  const r = new Map(remote.events.map(e => [e.id, e]));
  const events = [...new Set([...b.keys(), ...l.keys(), ...r.keys()])].flatMap(id => {
    const entry = pick(id, b.get(id), l.get(id), r.get(id));
    return entry ? [entry] : [];
  });
  return { state: validateState({ ...goal, events }), conflicts };
}
