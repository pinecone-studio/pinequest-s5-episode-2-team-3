import type { ScalePhase } from './scale';
import type { ScaleStatus } from './scale-protocol';
import type { HealthDay } from './health';
import { number } from './format';

// What the home's «Төхөөрөмж» tiles say about the smart base and the smart watch (device-tiles.ts).
// Kept apart so it can be tested without Bluetooth or Health Connect.
// `cta`: «Холбох ›» at the bottom, only while it is not linked (and not linking).
export interface DeviceTile { connected: boolean; status: string; detail: string; cta: boolean }

// `bottle`: the name given to the chosen bottle (scale.ts savedBottles), said in place of «Сав».
export function baseTile(phase: ScalePhase, status: ScaleStatus | null, bottle?: string): DeviceTile {
  if (phase === 'connecting') return { connected: false, status: 'Холбогдож байна…', detail: '', cta: false };
  if (phase !== 'connected') return { connected: false, status: 'Холбогдоогүй', detail: '', cta: true };
  // Water left is known once the empty bottle's weight is set; until then the line says what to do.
  const detail = status?.remainingMl != null ? `${bottle || 'Сав'}: ${number(status.remainingMl)} мл`
    : status && !status.calibrated ? 'Калибровк хийгдээгүй'
    : status && !status.bottleSet ? 'Саваа тохируулах'
    : status?.waiting ? `${number(status.waiting)} уулт илгээгдээгүй` : '';
  return { connected: true, status: 'Холбогдсон', detail, cta: false };
}

// A linked watch shows its latest heart rate, else today's steps, else nothing more.
export function watchTile(day: HealthDay | null): DeviceTile {
  if (!day) return { connected: false, status: 'Холбогдоогүй', detail: '', cta: true };
  const detail = day.heart ? `Зүрх: ${number(day.heart.bpm)} цохилт/мин` : day.steps != null ? `${number(day.steps)} алхам` : '';
  return { connected: true, status: 'Холбогдсон', detail, cta: false };
}
