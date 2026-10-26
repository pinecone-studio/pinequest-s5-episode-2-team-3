import type { HealthSample } from '@capgo/capacitor-health';

// Pure helpers for Health Connect samples, kept apart from the plugin so tests run without a device.

// Local midnight to now: "today" as the person sees it, not UTC.
export function todayRange(now = new Date()): { startDate: string; endDate: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

// The watch and the phone can both record the same walk, and raw Health Connect records are not
// de-duplicated. Adding every source would count those steps twice, so each source is summed on
// its own and the largest one (usually the watch) is the day's value. Null when nothing was recorded.
export function totalOfBestSource(samples: readonly HealthSample[]): number | null {
  if (!samples.length) return null;
  const bySource = new Map<string, number>();
  for (const s of samples) {
    const key = s.sourceId ?? s.sourceName ?? '';
    bySource.set(key, (bySource.get(key) ?? 0) + s.value);
  }
  return Math.round(Math.max(...bySource.values()));
}

// The most recent heart rate reading, or null. Watches measure every few minutes, not continuously,
// so the time goes with it.
export function latestHeart(samples: readonly HealthSample[]): { bpm: number; at: string } | null {
  let last: HealthSample | null = null;
  for (const s of samples) if (!last || s.startDate > last.startDate) last = s;
  return last ? { bpm: Math.round(last.value), at: last.startDate } : null;
}

// Extra water on a day with exercise, from the watch's active calories. Everyday movement is already
// in the profile's activity level, so the first 300 kcal add nothing; beyond that about 1 ml per kcal
// (roughly what sweat costs), capped at 1 l. Never under a doctor's limit (kidney or heart failure).
export const BONUS_FROM_KCAL = 300;
export const BONUS_MAX_ML = 1000;
export function exerciseBonusMl(activeKcal: number | null, mode: 'goal' | 'limit'): number {
  if (mode === 'limit' || activeKcal === null || activeKcal <= BONUS_FROM_KCAL) return 0;
  return Math.min(BONUS_MAX_ML, Math.round((activeKcal - BONUS_FROM_KCAL) / 50) * 50);
}
