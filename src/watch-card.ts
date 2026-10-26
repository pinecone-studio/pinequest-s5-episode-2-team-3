import { escape, number, time } from './format';
import { health, type HealthDay } from './health';
import { API_URL } from './api';
import { readProfile } from './plan';

// Home card with the watch's day (heart rate, steps, active calories through Health Connect) and
// one AI tip built from those numbers and today's water. Without a watch (web, iOS) the card shows
// clearly marked sample numbers so the demo still makes sense. The tip is asked at most once an
// hour for the same numbers; without AI a short rule-based tip stands in.
export interface Insight { text: string; extraMl: number; ai: boolean }
interface Ctx { drink: number; goal: number; mode: 'goal' | 'limit'; feels: number | null }

const SAMPLE: HealthDay = { steps: 8432, activeKcal: 412, heart: { bpm: 78, at: new Date(Date.now() - 12 * 60_000).toISOString() } };
const KEY = 'dusal-insight-v1';

const sample = () => health.phase === 'unsupported';
const today = (): HealthDay | null => (health.phase === 'on' ? health.day : sample() ? SAMPLE : null);

// Without AI: sweat from steps or calories, heat, and a high resting pulse, in plain words.
function localTip(day: HealthDay, c: Ctx): Insight {
  if (c.mode === 'limit') return { text: 'Эмчийн хязгаартаа багтааж, усаа өдрийн турш жигд хуваарилаарай.', extraMl: 0, ai: false };
  const sweat = (day.steps ?? 0) >= 10000 || (day.activeKcal ?? 0) >= 500;
  const hot = (c.feels ?? 0) >= 28;
  const extra = (sweat ? 250 : 0) + (hot ? 250 : 0);
  const left = Math.max(0, c.goal + extra - c.drink);
  const pulse = day.heart && day.heart.bpm > 100 && (day.steps ?? 0) < 3000 ? ' Тайван үедээ зүрх хурдан цохилж байвал ус уугаад амраарай.' : '';
  const why = sweat && hot ? 'Их хөдөлж, гадаа халуун байгаа' : sweat ? 'Өнөөдөр их хөдөлсөн' : hot ? 'Гадаа халуун байгаа' : '';
  return { text: `${why ? `${why} тул ` : ''}${left ? `өнөөдөр дахиад ${number(left)} мл уугаарай.` : 'өнөөдрийн усаа хангалттай уусан байна!'}${pulse}`.replace(/^ө/, 'Ө'), extraMl: extra, ai: false };
}

let tip: Insight | null = null;
let asking = '';
let failed = ''; // the numbers whose request failed: not asked again until they change

// Asks the backend for the tip once per hour and set of numbers; redraws when it answers.
export function loadInsight(c: Ctx, aiReady: boolean | null, redraw: () => void): void {
  const day = today();
  if (!day) { tip = null; return; }
  const round = (v: number | null | undefined, by: number) => (v == null ? '' : Math.round(v / by));
  const sig = [new Date().getHours(), round(c.drink, 250), c.goal, c.mode, round(day.steps, 1000), round(day.activeKcal, 100), round(day.heart?.bpm, 10), c.feels ?? ''].join('|');
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.sig === sig) { tip = saved.tip; return; }
  } catch { /* ask again */ }
  tip = localTip(day, c);
  if (!aiReady || asking === sig || failed === sig) return;
  asking = sig;
  const condition = (() => { try { return readProfile().condition; } catch { return 'none'; } })();
  fetch(`${API_URL}/api/insight`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drink: c.drink, goal: c.goal, mode: c.mode, hour: new Date().getHours(), condition, steps: day.steps, activeKcal: day.activeKcal, bpm: day.heart?.bpm, feels: c.feels }),
  }).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((a: { text: string; extraMl: number }) => {
    tip = { text: a.text, extraMl: a.extraMl, ai: true };
    try { localStorage.setItem(KEY, JSON.stringify({ sig, tip })); } catch { /* asked again next hour */ }
    redraw();
  }).catch(() => { failed = sig; /* the rule-based tip stays */ }).finally(() => { if (asking === sig) asking = ''; });
}

export function watchCard(): string {
  const day = today();
  const head = `<div class="hx-card-head"><h2 id="hx-watch-title">Цагнаас</h2>${sample() ? '<span class="hx-badge">Жишээ</span>' : health.phase === 'on' ? '<span class="hx-badge on">⌚ Холбогдсон</span>' : ''}</div>`;
  if (!day) {
    const text = health.phase === 'missing' ? 'Health Connect суулгаж, Samsung Health-ээс синк асаагаарай.'
      : health.phase === 'denied' ? 'Зөвшөөрөл өгөөгүй байна. Дахин оролдоно уу.' : 'Galaxy Watch-ийн зүрхний цохилт, алхмыг харж, AI зөвлөгөө аваарай.';
    return `<section class="hx-card hx-watch" aria-labelledby="hx-watch-title">${head}<p class="hx-watch-empty">${text}</p>
      ${health.phase !== 'missing' ? '<button type="button" class="hx-blue ac-wide" data-watch-connect>Цаг холбох</button>' : ''}</section>`;
  }
  const tile = (icon: string, value: string, label: string, sub = '') => `<div class="hx-watch-tile"><span aria-hidden="true">${icon}</span><b>${value}</b><small>${label}${sub ? ` · ${sub}` : ''}</small></div>`;
  return `<section class="hx-card hx-watch" aria-labelledby="hx-watch-title">${head}
    <div class="hx-watch-tiles">
      ${tile('❤️', day.heart ? `${day.heart.bpm}` : '—', 'уд/мин', day.heart ? time(day.heart.at) : '')}
      ${tile('👟', day.steps != null ? number(day.steps) : '—', 'алхам')}
      ${tile('🔥', day.activeKcal != null ? number(day.activeKcal) : '—', 'ккал')}
    </div>
    ${tip ? `<div class="hx-tip" role="status"><p><span class="hx-tip-tag">${tip.ai ? '✨ AI зөвлөгөө' : '💡 Зөвлөгөө'}</span>${escape(tip.text)}</p>${tip.extraMl ? `<b class="hx-tip-extra">+${number(tip.extraMl)} мл нэмж уух</b>` : ''}</div>` : ''}
    ${health.message ? `<p class="hx-watch-empty">${escape(health.message)}</p>` : ''}
    ${sample() ? '<p class="ac-small center">Android апп-д Galaxy Watch-ийн жинхэнэ мэдээлэл гарна.</p>' : ''}
  </section>`;
}

export function bindWatchCard(): void {
  document.querySelector('[data-watch-connect]')?.addEventListener('click', () => {
    if (health.phase === 'unsupported') { location.href = '/settings.html#linked'; return; }
    void health.connect();
  });
}
