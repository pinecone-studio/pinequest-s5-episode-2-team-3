import { describe, expect, test } from 'bun:test';
import { baseTile, watchTile } from '../src/device-status';
import type { ScaleStatus } from '../src/scale-protocol';
import type { HealthDay } from '../src/health';

const status = (s: Partial<ScaleStatus> = {}): ScaleStatus =>
  ({ calibrated: true, bottleSet: true, phase: 'bottle', weightG: 650, remainingMl: 620, capacityMl: 700, waiting: 0, ...s }) as ScaleStatus;
const day = (d: Partial<HealthDay> = {}): HealthDay => ({ steps: null, activeKcal: null, heart: null, ...d }) as HealthDay;

describe('baseTile', () => {
  test('not linked, or no Bluetooth: «Холбогдоогүй» with «Холбох ›»', () => {
    for (const phase of ['off', 'unsupported'] as const) expect(baseTile(phase, null)).toEqual({ connected: false, status: 'Холбогдоогүй', detail: '', cta: true });
  });
  test('linking: no «Холбох ›» while it tries', () => {
    expect(baseTile('connecting', null)).toEqual({ connected: false, status: 'Холбогдож байна…', detail: '', cta: false });
  });
  test('linked: the water left in the bottle', () => {
    expect(baseTile('connected', status())).toEqual({ connected: true, status: 'Холбогдсон', detail: 'Сав: 620 мл', cta: false });
    expect(baseTile('connected', status(), 'Цэнхэр сав').detail).toBe('Цэнхэр сав: 620 мл');
  });
  test('linked without a bottle set, or not calibrated: says what to do', () => {
    expect(baseTile('connected', status({ bottleSet: false, remainingMl: null })).detail).toBe('Саваа тохируулах');
    expect(baseTile('connected', status({ calibrated: false, remainingMl: null })).detail).toBe('Калибровк хийгдээгүй');
  });
  test('«Шууд уух»: the weight, and what has gone from the whole it started at', () => {
    const now = status({ bottleSet: false, remainingMl: null, phase: 'present', weightG: 642 });
    expect(baseTile('connected', now, undefined, 900).detail).toBe('Суурин дээр 642 г · 258 мл уусан');
    expect(baseTile('connected', now, undefined, 642).detail).toBe('Суурин дээр 642 г');
    expect(baseTile('connected', status({ bottleSet: false, remainingMl: null, phase: 'moving' }), undefined, 900).detail).toBe('Жин хэмжиж байна…');
  });
  test('linked, bottle lifted, before any reading: nothing more', () => {
    expect(baseTile('connected', status({ remainingMl: null })).detail).toBe('');
    expect(baseTile('connected', null).detail).toBe('');
  });
});

describe('watchTile', () => {
  test('not linked: «Холбох ›»', () => {
    expect(watchTile(null)).toEqual({ connected: false, status: 'Холбогдоогүй', detail: '', cta: true });
  });
  test('heart rate first, then steps, else nothing', () => {
    expect(watchTile(day({ heart: { bpm: 72, at: '' }, steps: 4000 })).detail).toBe('Зүрх: 72 цохилт/мин');
    expect(watchTile(day({ steps: 4210 })).detail).toBe('4,210 алхам');
    expect(watchTile(day()).detail).toBe('');
  });
});
