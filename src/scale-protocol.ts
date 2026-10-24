import { validateEntry, validateId, type WaterEntry } from '../shared/contracts';

// Bluetooth LE contract with the smart base; must match firmware/firmware.ino. All numbers little-endian.
export const SCALE_SERVICE = 'd05a1000-6c2b-4b8e-9f3a-2f1e0c7a5b01';
export const STATUS_CHAR = 'd05a1001-6c2b-4b8e-9f3a-2f1e0c7a5b01';
export const DRINK_CHAR = 'd05a1002-6c2b-4b8e-9f3a-2f1e0c7a5b01';
export const ACK_CHAR = 'd05a1003-6c2b-4b8e-9f3a-2f1e0c7a5b01';
export const ID_CHAR = 'd05a1004-6c2b-4b8e-9f3a-2f1e0c7a5b01';

const PHASES = ['moving', 'empty', 'present'] as const;
export interface ScaleStatus {
  calibrated: boolean;
  bottleSet: boolean;              // the empty bottle's weight is known, so water left can be measured
  phase: typeof PHASES[number];
  weightG: number;                 // everything on the scale
  remainingMl: number | null;      // null while unknown: no bottle set, lifted or moving
  capacityMl: number;              // most water seen since the bottle was set
  waiting: number;                 // drinks the app has not confirmed yet
}
export interface ScaleDrink { boot: number; n: number; amountMl: number; secondsAgo: number | null }

// flags u8, phase u8, weightG i16, remainingMl i16 (-1 unknown), capacityMl u16, waiting u8.
export function parseStatus(view: DataView): ScaleStatus {
  const phase = view.byteLength >= 9 ? PHASES[view.getUint8(1)] : undefined;
  if (!phase) throw new Error('Суурийн төлөв буруу байна.');
  const flags = view.getUint8(0);
  const remaining = view.getInt16(4, true);
  return {
    calibrated: (flags & 1) !== 0,
    bottleSet: (flags & 2) !== 0,
    phase,
    weightG: view.getInt16(2, true),
    remainingMl: remaining < 0 ? null : remaining,
    capacityMl: view.getUint16(6, true),
    waiting: view.getUint8(8),
  };
}

// The oldest unconfirmed drink: boot u32, n u32, amountMl u16, secondsAgo u32. Empty when none is waiting.
// secondsAgo 0xFFFFFFFF: the drink is from before the scale's last restart and it cannot tell when.
export function parseDrink(view: DataView): ScaleDrink | null {
  if (view.byteLength < 14) return null;
  const ago = view.getUint32(10, true);
  return { boot: view.getUint32(0, true), n: view.getUint32(4, true), amountMl: view.getUint16(8, true), secondsAgo: ago === 0xffffffff ? null : ago };
}

export function ackBytes(drink: ScaleDrink): DataView {
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, drink.boot, true);
  view.setUint32(4, drink.n, true);
  return view;
}

export function deviceIdFrom(view: DataView): string {
  return validateId(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)));
}

// Same ID as the Wi-Fi firmware used (deviceId-e-boot-n), so a resent drink is recognised and never saved twice.
// A drink from before a restart has no time of its own; it is logged when it arrives.
export function drinkEntry(deviceId: string, drink: ScaleDrink, received = Date.now()): WaterEntry {
  return validateEntry({
    id: `${deviceId}-e-${drink.boot}-${drink.n}`,
    amount: drink.amountMl,
    type: 'drink',
    at: new Date(received - (drink.secondsAgo ?? 0) * 1000).toISOString(),
    deviceId,
  });
}
