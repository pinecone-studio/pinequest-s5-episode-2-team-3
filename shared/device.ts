import { CONTRACT_VERSION, ContractError, validateDeviceReading, validateEntry, validateId, type DeviceReading, type WaterEntry } from './contracts';

export const MIN_CHANGE_ML = 5;
// A drop counts as drunk from 5 ml, so a single sip shows up; smaller changes are scale noise and add up
// against the anchor until they get there.
export const MIN_DRINK_ML = 5;
export const MAX_STABLE_GAP_MS = 5 * 60_000;
export const DEVICE_FRESH_MS = 60_000;
export const OUTCOMES = ['baseline', 'resync', 'drink', 'refill', 'noise', 'unstable', 'stale'] as const;
export type ReadingOutcome = typeof OUTCOMES[number];
export interface DeviceStatus { reading: DeviceReading; receivedAt: string; outcome: ReadingOutcome }
export interface ReadingState {
  reading: DeviceReading;
  baselineMl: number | null;
  lastStableAt: string | null;
}

export function validateDeviceStatus(value: unknown): DeviceStatus {
  const body = value as DeviceStatus | null;
  const reading = validateDeviceReading(body?.reading);
  if (!body || typeof body.receivedAt !== 'string' || !Number.isFinite(Date.parse(body.receivedAt)) || !OUTCOMES.includes(body.outcome)) {
    throw new ContractError('Савны төлөв буруу байна.');
  }
  return { reading, receivedAt: new Date(body.receivedAt).toISOString(), outcome: body.outcome };
}
export function isFresh(status: DeviceStatus, now = Date.now()): boolean {
  return [status.receivedAt, status.reading.at].every(at => { const age = now - Date.parse(at); return age >= -5000 && age <= DEVICE_FRESH_MS; });
}

// Firmware must report lifted/unreliable load-cell readings as unstable + null, never stable zero.
export function classify(previous: ReadingState | null, reading: DeviceReading): {
  outcome: ReadingOutcome; amount: number; next: ReadingState;
} {
  if (previous && Date.parse(reading.at) <= Date.parse(previous.reading.at)) return { outcome: 'stale', amount: 0, next: previous };
  const sameCapacity = previous?.reading.capacityMl === reading.capacityMl;
  const baseline = sameCapacity ? previous!.baselineMl : null;
  const lastStableAt = sameCapacity ? previous!.lastStableAt : null;
  if (!reading.stable) return { outcome: 'unstable', amount: 0, next: { reading, baselineMl: baseline, lastStableAt } };
  const next = { reading, baselineMl: reading.remainingMl, lastStableAt: reading.at };
  if (baseline === null || lastStableAt === null) return { outcome: 'baseline', amount: 0, next };
  if (Date.parse(reading.at) - Date.parse(lastStableAt) > MAX_STABLE_GAP_MS) return { outcome: 'resync', amount: 0, next };
  const delta = baseline - reading.remainingMl;
  // Keep the anchor for small changes: sips accumulate without summing sensor jitter.
  if (delta < MIN_DRINK_ML && -delta < MIN_CHANGE_ML) return { outcome: 'noise', amount: 0, next: { ...next, baselineMl: baseline } };
  return { outcome: delta > 0 ? 'drink' : 'refill', amount: Math.max(0, delta), next };
}

export interface DeviceCache { selectedId: string | null; devices: DeviceStatus[] }
export function validateDeviceCache(value: unknown): DeviceCache {
  const body = value as DeviceCache | null;
  if (!body || !Array.isArray(body.devices)) {
    throw new ContractError('Савны сонголт буруу байна.');
  }
  const devices = body.devices.map(validateDeviceStatus);
  if (new Set(devices.map(d => d.reading.deviceId)).size !== devices.length) throw new ContractError('Давхардсан төхөөрөмжийн ID байна.');
  return { selectedId: body.selectedId === null ? null : validateId(body.selectedId), devices };
}

// The base decides when water was drunk; it reports only the amount. The user may later mark it spilled.
export function validateDeviceEvent(value: unknown): WaterEntry & { deviceId: string } {
  const body = value as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractError('Өгөгдлийн бүтэц буруу байна.');
  if (body.version !== CONTRACT_VERSION) throw new ContractError('Төхөөрөмжийн өгөгдлийн хувилбар буруу байна.');
  if (body.type !== undefined) throw new ContractError('Суурь зөвхөн уусан хэмжээг илгээнэ; төрөл заахгүй.');
  const entry = validateEntry({ id: body.id, amount: body.amount, type: 'drink', at: body.at, deviceId: validateId(body.deviceId) });
  return { ...entry, deviceId: entry.deviceId! };
}
