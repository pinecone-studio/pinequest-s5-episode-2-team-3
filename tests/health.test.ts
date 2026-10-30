import { expect, test } from 'bun:test';
import type { HealthSample } from '@capgo/capacitor-health';
import { latestHeart, todayRange, totalOfBestSource } from '../src/health-data';

const sample = (value: number, sourceId: string, startDate = '2026-10-26T03:00:00.000Z'): HealthSample =>
  ({ dataType: 'steps', value, unit: 'count', startDate, endDate: startDate, sourceId });

test('today starts at local midnight and ends now', () => {
  const now = new Date(2026, 9, 26, 14, 30);
  const { startDate, endDate } = todayRange(now);
  expect(new Date(startDate).getHours()).toBe(0);
  expect(new Date(startDate).getDate()).toBe(26);
  expect(endDate).toBe(now.toISOString());
});

test('no samples means no value, not zero', () => {
  expect(totalOfBestSource([])).toBeNull();
});

test('one source is summed', () => {
  expect(totalOfBestSource([sample(1200, 'watch'), sample(800, 'watch'), sample(40.4, 'watch')])).toBe(2040);
});

test('the same walk from watch and phone is not counted twice', () => {
  const watch = [sample(3000, 'com.sec.android.app.shealth'), sample(2500, 'com.sec.android.app.shealth')];
  const phone = [sample(4000, 'com.google.android.apps.fitness')];
  expect(totalOfBestSource([...watch, ...phone])).toBe(5500);
});

test('samples without a source id are grouped by name', () => {
  const s = (value: number, sourceName: string): HealthSample => ({ dataType: 'calories', value, unit: 'kilocalorie', startDate: '', endDate: '', sourceName });
  expect(totalOfBestSource([s(100, 'Samsung Health'), s(150, 'Samsung Health'), s(90, 'Fit')])).toBe(250);
});

test('the latest heart rate wins, whatever the order', () => {
  const hr = (bpm: number, at: string): HealthSample => ({ dataType: 'heartRate', value: bpm, unit: 'bpm', startDate: at, endDate: at });
  expect(latestHeart([hr(70, '2026-10-26T01:00:00.000Z'), hr(88.6, '2026-10-26T05:10:00.000Z'), hr(75, '2026-10-26T03:00:00.000Z')]))
    .toEqual({ bpm: 89, at: '2026-10-26T05:10:00.000Z' });
  expect(latestHeart([])).toBeNull();
});

test('a record crossing midnight counts only its part after midnight', () => {
  const walk: HealthSample = { dataType: 'steps', value: 800, unit: 'count', startDate: '2026-10-25T23:40:00.000Z', endDate: '2026-10-26T00:20:00.000Z', sourceId: 'watch' };
  const old: HealthSample = { ...walk, startDate: '2026-10-25T20:00:00.000Z', endDate: '2026-10-25T21:00:00.000Z' };
  expect(totalOfBestSource([walk, old, sample(100, 'watch')], '2026-10-26T00:00:00.000Z')).toBe(500);
});
