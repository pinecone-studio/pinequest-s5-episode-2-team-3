import Anthropic from '@anthropic-ai/sdk';
import { PlanError } from './plan.js';

// GET /api/weather?lat=&lon=&goal=: today's weather (Open-Meteo, no key) and how much more or less
// water it calls for on top of the saved goal. The AI decides the amount; a simple rule covers for it.

const MAX_UP = 1000;
const MAX_DOWN = 300;

const SYSTEM = `You adjust a person's daily water goal in Mongolia for today's weather.
Hot days, strong sun and dry air raise sweat and breathing losses; only a bitter cold day (a high of -15°C or lower) dries people out a little.
Mild and ordinary cold days need no change: deltaMl 0. Never cut more than ${MAX_DOWN} ml or add more than ${MAX_UP} ml.
"reason" is one short Mongolian (Cyrillic) sentence a child or an elder can follow, about the weather and water only.`;

const SCHEMA = {
  type: 'object',
  properties: {
    deltaMl: { type: 'integer', description: 'Millilitres to add (positive) or remove (negative) for today' },
    reason: { type: 'string' },
  },
  required: ['deltaMl', 'reason'],
  additionalProperties: false,
};

const clampDelta = ml => Math.round(Math.min(MAX_UP, Math.max(-MAX_DOWN, Number(ml) || 0)) / 50) * 50;

// Used when the AI is off or fails, so the home still adapts to the weather.
function ruleDelta(w) {
  const t = w.feelsMax;
  if (t >= 32) return { deltaMl: 750, reason: 'Өнөөдөр маш халуун тул ердийнхөөсөө илүү ус уугаарай.' };
  if (t >= 27) return { deltaMl: 500, reason: 'Халуун өдөр хөлрөх тул илүү ус хэрэгтэй.' };
  if (t >= 23) return { deltaMl: 250, reason: 'Дулаахан өдөр бага зэрэг илүү ус уугаарай.' };
  if (w.max <= -15) return { deltaMl: 200, reason: 'Хүйтэн хуурай агаар биеийг хатаадаг тул бага зэрэг илүү уугаарай.' };
  return { deltaMl: 0, reason: 'Өнөөдрийн цаг агаар ердийн, зорилт хэвээрээ.' };
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1`
    + '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,uv_index_max'
    + '&current=temperature_2m';
  const response = await fetch(url);
  if (!response.ok) throw new PlanError(502, 'Цаг агаарын мэдээ авч чадсангүй.');
  const data = await response.json();
  const d = data.daily ?? {};
  const pick = key => Number(d[key]?.[0]);
  const w = {
    date: d.time?.[0],
    now: Math.round(Number(data.current?.temperature_2m)),
    max: Math.round(pick('temperature_2m_max')),
    min: Math.round(pick('temperature_2m_min')),
    feelsMax: Math.round(pick('apparent_temperature_max')),
    humidity: Math.round(pick('relative_humidity_2m_mean')),
    uv: Math.round(pick('uv_index_max')),
  };
  if (!w.date || !Number.isFinite(w.max) || !Number.isFinite(w.min)) throw new PlanError(502, 'Цаг агаарын мэдээ уншигдсангүй.');
  return w;
}

async function aiDelta(w, goal, env) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 200,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Saved daily goal: ${goal} ml\nToday: high ${w.max}°C, low ${w.min}°C, feels like up to ${w.feelsMax}°C, humidity ${w.humidity}%, UV ${w.uv}`,
    }],
  });
  const text = response.content.find(block => block.type === 'text')?.text;
  const plan = JSON.parse(text ?? '');
  return { deltaMl: clampDelta(plan.deltaMl), reason: String(plan.reason ?? '').slice(0, 300) };
}

export async function weatherAdjust(searchParams, env) {
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  const goal = Number(searchParams.get('goal'));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && Number.isInteger(goal) && goal >= 500 && goal <= 6000)) {
    throw new PlanError(400, 'lat, lon, goal (500–6000 мл) зөв байх ёстой.');
  }
  // About 10 km and one goal per day share one answer, so the AI runs rarely.
  const rLat = lat.toFixed(1), rLon = lon.toFixed(1);
  const w = await fetchWeather(rLat, rLon);
  const cacheKey = new Request(`https://dusal-cache/weather/${w.date}/${rLat}/${rLon}/${goal}`);
  const cache = globalThis.caches?.default;
  const hit = cache && await cache.match(cacheKey);
  if (hit) return hit.json();

  let advice, source = 'ai';
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error('no key');
    advice = await aiDelta(w, goal, env);
    // On a day the rule calls ordinary (neither warm nor bitter cold) the goal stays: the AI once added
    // 200 ml for a high of 0°C «because it is cold».
    const rule = ruleDelta(w);
    if (!rule.deltaMl && advice.deltaMl) advice = rule;
  } catch {
    advice = ruleDelta(w);
    source = 'rule';
  }
  const result = { weather: w, ...advice, source };
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'Cache-Control': 'max-age=10800' } }));
  return result;
}
