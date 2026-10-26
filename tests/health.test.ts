import { expect, test } from 'bun:test';
import type { HealthSample } from '@capgo/capacitor-health';
import { exerciseBonusMl, latestHeart, todayRange, totalOfBestSource } from '../src/health-data';

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

test('an ordinary day adds no water', () => {
  expect(exerciseBonusMl(null, 'goal')).toBe(0);
  expect(exerciseBonusMl(0, 'goal')).toBe(0);
  expect(exerciseBonusMl(300, 'goal')).toBe(0);
});

test('exercise adds about 1 ml per kcal above 300, in 50 ml steps', () => {
  expect(exerciseBonusMl(320, 'goal')).toBe(0);
  expect(exerciseBonusMl(330, 'goal')).toBe(50);
  expect(exerciseBonusMl(612, 'goal')).toBe(300);
});

test('the extra water is capped at one litre', () => {
  expect(exerciseBonusMl(1300, 'goal')).toBe(1000);
  expect(exerciseBonusMl(5000, 'goal')).toBe(1000);
});

test('a doctor-set limit is never raised, however hard the workout', () => {
  expect(exerciseBonusMl(900, 'limit')).toBe(0);
  expect(exerciseBonusMl(5000, 'limit')).toBe(0);
});
