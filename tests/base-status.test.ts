import { describe, expect, test } from 'bun:test';
import { baseChip } from '../src/base-status';
import type { ScaleStatus } from '../src/scale-protocol';

const status = (s: Partial<ScaleStatus> = {}): ScaleStatus =>
  ({ calibrated: true, bottleSet: true, phase: 'bottle', weightG: 650, remainingMl: 450, capacityMl: 700, waiting: 0, ...s }) as ScaleStatus;

describe('baseChip', () => {
  test('nothing without Bluetooth', () => {
    expect(baseChip('unsupported', true, null)).toBeNull();
  });
  test('never paired: offers to link it', () => {
    expect(baseChip('off', false, null)).toEqual({ tone: 'off', text: 'Холбогдоогүй', note: '', cta: 'Холбох' });
  });
  test('connected with a bottle set: green, with the water left', () => {
    expect(baseChip('connected', true, status())).toEqual({ tone: 'ok', text: 'Саванд 450 мл', note: '', cta: 'Хэмжих' });
  });
  test('no empty bottle weight yet: asks for it', () => {
    expect(baseChip('connected', true, status({ bottleSet: false, remainingMl: null }))!.tone).toBe('warn');
  });
  test('not calibrated comes before the bottle', () => {
    expect(baseChip('connected', true, status({ calibrated: false, bottleSet: false }))!.text).toBe('Калибровк хийгдээгүй');
  });
  test('bottle lifted: still green, no amount', () => {
    expect(baseChip('connected', true, status({ remainingMl: null }))).toEqual({ tone: 'ok', text: 'Холбогдсон', note: '', cta: 'Хэмжих' });
  });
  test('drinks not sent yet show when the amount is unknown', () => {
    expect(baseChip('connected', true, status({ remainingMl: null, waiting: 2 }))!.note).toBe('2 илгээгдээгүй');
  });
  test('connecting and dropped', () => {
    expect(baseChip('connecting', true, null)!.tone).toBe('wait');
    expect(baseChip('off', true, null)).toEqual({ tone: 'off', text: 'Салсан', note: '', cta: 'Холбох' });
  });
});
