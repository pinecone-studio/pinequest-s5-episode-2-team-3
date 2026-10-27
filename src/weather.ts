// Today's weather nudges the daily goal: hot or very dry days add water, mild ones leave it as is.
// The saved goal never changes; only today's target shown on the home does. A doctor's limit is never raised.
import { API_URL } from './api';
import { dayKey } from './data';
import { escape, number } from './format';

export interface WeatherAdvice {
  weather: { now: number; max: number; min: number; feelsMax: number; humidity: number; uv: number };
  deltaMl: number;
  reason: string;
  source: 'ai' | 'rule';
}

const KEY = 'dusal-weather-v1';
// Ulaanbaatar, when the location is unknown or not allowed.
const FALLBACK = { lat: 47.92, lon: 106.92 };

let advice: WeatherAdvice | null = null;

function cached(goal: number): WeatherAdvice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved && saved.day === dayKey() && saved.goal === goal ? saved.advice : null;
  } catch {
    return null;
  }
}

function where(): Promise<{ lat: number; lon: number }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(FALLBACK),
      { timeout: 6000, maximumAge: 3 * 3600_000 },
    );
  });
}

// Loads today's advice once per day and goal; calls onReady when it changes what the home shows.
export async function loadWeather(goal: number, onReady: () => void): Promise<void> {
  advice = cached(goal);
  if (advice) return onReady();
  try {
    const { lat, lon } = await where();
    const response = await fetch(`${API_URL}/api/weather?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&goal=${goal}`);
    if (!response.ok) return;
    advice = await response.json() as WeatherAdvice;
    try { localStorage.setItem(KEY, JSON.stringify({ day: dayKey(), goal, advice })); } catch { /* fetched again next time */ }
    onReady();
  } catch {
    // Offline: the saved goal stays as it is.
  }
}

export function todayGoal(goal: number, mode: 'goal' | 'limit'): number {
  if (!advice || mode === 'limit') return goal;
  return Math.max(500, goal + advice.deltaMl);
}

// A small chip in the home's top-left corner: icon, today's high and the change to the goal. The reason
// is kept for the tooltip and screen readers only.
export function weatherChip(mode: 'goal' | 'limit'): string {
  if (!advice) return '';
  const w = advice.weather;
  const icon = w.feelsMax >= 25 ? '☀️' : w.max <= -10 ? '❄️' : '⛅';
  const delta = mode === 'limit' || !advice.deltaMl ? '' : `<b>${advice.deltaMl > 0 ? '+' : '−'}${number(Math.abs(advice.deltaMl))} мл</b>`;
  return `<p class="weather-chip" title="${escape(advice.reason)}" aria-label="${escape(`Цаг агаар ${w.max}°. ${advice.reason}`)}"><span aria-hidden="true">${icon}</span><span>${w.max}°</span>${delta}</p>`;
}

// Today's "feels like" for the next 24 hours, as it would be felt, straight from Open-Meteo with a
// rough position (one decimal, about 10 km). Used once by onboarding's climate step; not cached.
export type Climate = 'hot' | 'mild' | 'cold';
export const climateOf = (feels: number): Climate => (feels >= 28 ? 'hot' : feels <= 5 ? 'cold' : 'mild');
export async function fetchWeather(): Promise<{ feels: number }> {
  const pos = await new Promise<GeolocationPosition>((ok, fail) =>
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 }));
  const lat = pos.coords.latitude.toFixed(1), lon = pos.coords.longitude.toFixed(1);
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=apparent_temperature_max&timezone=auto&forecast_days=1`);
  if (!res.ok) throw new Error('weather');
  const feels = Number((await res.json())?.daily?.apparent_temperature_max?.[0]);
  if (!Number.isFinite(feels)) throw new Error('weather');
  return { feels: Math.round(feels) };
}

// The highest "feels like" today from the loaded advice, for the watch card's tip.
export const todayFeels = (): number | null => advice?.weather.feelsMax ?? null;
