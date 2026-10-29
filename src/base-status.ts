import type { ScalePhase } from './scale';
import type { ScaleStatus } from './scale-protocol';
import { number } from './format';

// What the home says about the Bluetooth base, from its connection and its last status. Kept apart from
// base-chip.ts so it can be tested without Bluetooth.
export type BaseTone = 'ok' | 'warn' | 'wait' | 'off';
// One row on the home, like «Эмчийн заавар»: «Ухаалаг суурь», its state under it, and a pill to act.
export interface BaseChip { tone: BaseTone; text: string; note: string; cta: string }

export function baseChip(phase: ScalePhase, saved: boolean, status: ScaleStatus | null): BaseChip | null {
  if (phase === 'unsupported') return null;
  // Never paired: the home's way in to linking it.
  if (phase === 'off' && !saved) return { tone: 'off', text: 'Холбогдоогүй', note: '', cta: 'Холбох' };
  if (phase === 'connecting') return { tone: 'wait', text: 'Холбогдож байна…', note: '', cta: 'Нээх' };
  if (phase === 'off') return { tone: 'off', text: 'Салсан', note: '', cta: 'Холбох' };
  if (status && !status.calibrated) return { tone: 'warn', text: 'Калибровк хийгдээгүй', note: '', cta: 'Тохируулах' };
  // Water left is only known once the empty bottle's weight is set; until then the base can't measure.
  if (status && !status.bottleSet) return { tone: 'warn', text: 'Саваа тохируулах хэрэгтэй', note: '', cta: 'Тохируулах' };
  const left = status?.remainingMl;
  const waiting = status?.waiting ? `${number(status.waiting)} илгээгдээгүй` : '';
  // The green dot already says it is linked, so the line gives the water left when it is known.
  return { tone: 'ok', text: left != null ? `Саванд ${number(left)} мл` : 'Холбогдсон', note: waiting, cta: 'Хэмжих' };
}
