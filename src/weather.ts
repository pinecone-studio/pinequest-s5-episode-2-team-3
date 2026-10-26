import { dayKey } from './data';
import { escape, number } from './format';

// Today's weather where the phone is, as the body feels it: a rough position (one decimal, about
// 10 km) goes to Open-Meteo (free, no key) and comes back as today's highest "feels like"
// temperature, wind and humidity counted. Asked once a day and kept for that day. The home only
// asks when location was allowed before (onboarding's climate step asks the first time).
const KEY = 'dusal-weather-v1';
export interface Today { day: string; feels: number }

export type Climate = 'hot' | 'mild' | 'cold';
export const climateOf = (feels: number): Climate => (feels >= 28 ? 'hot' : feels <= 5 ? 'cold' : 'mild');
// Extra water on a hot day, on top of the goal (never under a doctor's limit).
export const extraFor = (feels: number) => (feels >= 33 ? 750 : feels >= 28 ? 500 : 0);

export function cachedWeather(): Today | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Today | null;
    return v && v.day === dayKey() && Number.isFinite(v.feels) ? v : null;
  } catch { return null; }
}

export async function fetchWeather(): Promise<Today> {
  const pos = await new Promise<GeolocationPosition>((ok, fail) =>
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 }));
  const lat = pos.coords.latitude.toFixed(1), lon = pos.coords.longitude.toFixed(1);
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=apparent_temperature_max&timezone=auto&forecast_days=1`);
  if (!res.ok) throw new Error('weather');
  const feels = Number((await res.json())?.daily?.apparent_temperature_max?.[0]);
  if (!Number.isFinite(feels)) throw new Error('weather');
  const today = { day: dayKey(), feels: Math.round(feels) };
  try { localStorage.setItem(KEY, JSON.stringify(today)); } catch { /* asked again next time */ }
  return today;
}

// For the home: today's value if already fetched, otherwise fetched only when location is allowed.
export async function weatherIfAllowed(): Promise<Today | null> {
  const cached = cachedWeather();
  if (cached) return cached;
  if (!('geolocation' in navigator)) return null;
  try {
    const state = (await navigator.permissions?.query({ name: 'geolocation' }))?.state;
    return state === 'granted' ? await fetchWeather() : null;
  } catch { return null; }
}

// The line under the home gauge: how today feels and, on a hot day, how much more to drink.
export function weatherChip(today: Today | null, mode: 'goal' | 'limit'): string {
  if (!today) return '';
  const extra = mode === 'goal' ? extraFor(today.feels) : 0;
  const icon = { hot: '☀️', mild: '⛅', cold: '❄️' }[climateOf(today.feels)];
  const tip = extra ? ` · Халуун тул <b>+${number(extra)} мл</b> нэмж уугаарай`
    : mode === 'limit' && today.feels >= 28 ? ' · Халуун ч эмчийн хязгаараа барина уу' : '';
  return `<p class="hx-weather" role="status"><span aria-hidden="true">${icon}</span> Өнөөдөр ${escape(String(today.feels))}°C мэт мэдрэгдэнэ${tip}</p>`;
}
