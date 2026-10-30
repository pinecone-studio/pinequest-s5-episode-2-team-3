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
// Only used when Health Connect's own totals are not available (health.ts).
export function totalOfBestSource(samples: readonly HealthSample[], from?: string): number | null {
  if (!samples.length) return null;
  const bySource = new Map<string, number>();
  for (const s of samples) {
    const key = s.sourceId ?? s.sourceName ?? '';
    bySource.set(key, (bySource.get(key) ?? 0) + (from ? sinceStart(s, from) : s.value));
  }
  return Math.round(Math.max(...bySource.values()));
}

// The part of a record after `from`: a walk from 23:40 to 00:20 counts half of its steps today.
function sinceStart(s: HealthSample, from: string): number {
  const start = Date.parse(s.startDate), end = Date.parse(s.endDate), cut = Date.parse(from);
  if (!(start < cut) || !(end > start)) return s.value;
  return end <= cut ? 0 : s.value * (end - cut) / (end - start);
}

// The most recent heart rate reading, or null. Watches measure every few minutes, not continuously,
// so the time goes with it.
export function latestHeart(samples: readonly HealthSample[]): { bpm: number; at: string } | null {
  let last: HealthSample | null = null;
  for (const s of samples) if (!last || s.startDate > last.startDate) last = s;
  return last ? { bpm: Math.round(last.value), at: last.startDate } : null;
}
