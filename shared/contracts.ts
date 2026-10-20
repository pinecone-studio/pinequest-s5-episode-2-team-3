// Shared validation for app data and the Worker API.
export const CONTRACT_VERSION = 1;
export const TYPES = { drink: 'Уусан', spill: 'Асгасан', pending: 'Тодорхойгүй' } as const;
export type EntryType = keyof typeof TYPES;
export interface WaterEntry {
  id: string;
  amount: number;
  type: EntryType;
  at: string;
  deviceId?: string;
}
export interface Settings {
  goal: number;
  mode: 'goal' | 'limit';
}
export interface AppState extends Settings {
  events: WaterEntry[];
}
export class ContractError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError('Өгөгдлийн бүтэц буруу байна.');
  return value as Record<string, unknown>;
}

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === 'string' && Object.hasOwn(TYPES, value);
}

export function validateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value)) throw new ContractError('ID нь 1–64 тэмдэгттэй, үсэг, тоо, зураас агуулна.');
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new ContractError('Огноо буруу байна.');
  return new Date(value).toISOString();
}

export function validateSettings(value: unknown): Settings {
  const { goal, mode } = record(value);
  if (typeof goal !== 'number' || !Number.isInteger(goal) || goal < 50 || goal > 10000 || (mode !== 'goal' && mode !== 'limit')) {
    throw new ContractError('Өдрийн тохиргоо буруу байна.');
  }
  return { goal, mode };
}

export function validateEventPatch(value: unknown): Partial<Pick<WaterEntry, 'amount' | 'type' | 'at'>> {
  const body = record(value);
  const patch: Partial<Pick<WaterEntry, 'amount' | 'type' | 'at'>> = {};
  if ('amount' in body) {
    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 1 || body.amount > 5000) {
      throw new ContractError('Хэмжээ 1–5,000 мл бүхэл тоо байна.');
    }
    patch.amount = body.amount;
  }
  if ('type' in body) {
    if (!isEntryType(body.type)) throw new ContractError('Бүртгэлийн төрөл буруу байна.');
    patch.type = body.type;
  }
  if ('at' in body) patch.at = timestamp(body.at);
  return patch;
}

export function validateEntry(value: unknown): WaterEntry {
  const body = record(value);
  const id = validateId(body.id);
  const fields = validateEventPatch(body);
  if (fields.amount === undefined || fields.type === undefined || fields.at === undefined) throw new ContractError('Хэмжээ, төрөл, огноо заавал байна.');
  const entry: WaterEntry = { id, amount: fields.amount, type: fields.type, at: fields.at };
  if (body.deviceId !== undefined) entry.deviceId = validateId(body.deviceId);
  return entry;
}

export function validateState(value: unknown): AppState {
  const body = record(value);
  const settings = validateSettings(body);
  if (!Array.isArray(body.events)) throw new ContractError('Бүртгэлийн жагсаалт буруу байна.');
  const ids = new Set<string>();
  const events = body.events.map(item => {
    const entry = validateEntry(item);
    if (ids.has(entry.id)) throw new ContractError('Давхардсан бүртгэлийн ID байна.');
    ids.add(entry.id);
    return entry;
  });
  return { ...settings, events };
}

