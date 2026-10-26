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
  last = c;
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

// "Өнөөдрийн дадал" (bento tiles): calories, heart rate with a word on it, weight from the profile,
// steps, and a wellness score out of 10 with the tip. The score adds up water against the goal (4),
// steps against 8,000 (3), a resting-range heart rate (2) and 300+ active kcal (1).
function wellness(day: HealthDay, c: Ctx): number {
  const water = c.mode === 'limit' ? (c.drink <= c.goal ? Math.min(1, c.drink / (c.goal * 0.6)) : 0.5) : Math.min(1, c.drink / c.goal);
  const steps = Math.min(1, (day.steps ?? 0) / 8000);
  const bpm = day.heart?.bpm;
  const heart = bpm == null ? 0.5 : bpm >= 50 && bpm <= 95 ? 1 : 0.4;
  return Math.round((water * 4 + steps * 3 + heart * 2 + ((day.activeKcal ?? 0) >= 300 ? 1 : 0)) * 10) / 10;
}
const heartWord = (bpm: number) => (bpm < 50 ? 'Удаан байна. Санаа зовоож байвал эмчид хандаарай.' : bpm <= 95 ? 'Тайван, жигд байна. Ингээд л байлгаарай.' : bpm <= 120 ? 'Бага зэрэг хурдан. Ус уугаад амсхийгээрэй.' : 'Хурдан байна. Тайвширч, ус ууна уу.');

const ICON = {
  fire: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2.3-4.8.3 1.7 1.2 2.8 2.2 3.3C11 9 11.5 6 12 3z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  weight: '<path d="M3 10v4M21 10v4M6 7v10M18 7v10M6 12h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
  shoe: '<path d="M3 15c0-2 .5-6 2-8l4 3c2 1.2 5 1.4 7 2l3 1c1.5.5 2 1.4 2 2.5V17H3z"/><path d="M3 19h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const icon = (d: string) => `<span class="hb-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${d}</svg></span>`;

let last: Ctx = { drink: 0, goal: 2000, mode: 'goal', feels: null };

export function watchCard(): string {
  const day = today();
  const badge = sample() ? '<span class="hx-badge">Жишээ</span>' : health.phase === 'on' ? '<span class="hx-badge on">⌚ Холбогдсон</span>' : '';
  const head = `<div class="hb-head"><h2 id="hx-watch-title">Өнөөдрийн дадал</h2>${badge}</div>`;
  if (!day) {
    const text = health.phase === 'missing' ? 'Health Connect суулгаж, Samsung Health-ээс синк асаагаарай.'
      : health.phase === 'denied' ? 'Зөвшөөрөл өгөөгүй байна. Дахин оролдоно уу.' : 'Galaxy Watch-ийн зүрхний цохилт, алхмыг харж, AI зөвлөгөө аваарай.';
    return `<section class="hx-habit" aria-labelledby="hx-watch-title">${head}<div class="hx-card"><p class="hx-watch-empty">${text}</p>
      ${health.phase !== 'missing' ? '<button type="button" class="hx-blue ac-wide" data-watch-connect>Цаг холбох</button>' : ''}</div></section>`;
  }
  const weight = (() => { try { return readProfile().weight; } catch { return null; } })();
  const score = wellness(day, last);
  const label = score >= 8 ? 'Маш сайн' : score >= 6 ? 'Сайн' : score >= 4 ? 'Дунд' : 'Сайжруулъя';
  const C = 2 * Math.PI * 40;
  return `<section class="hx-habit" aria-labelledby="hx-watch-title">${head}
    <div class="hb-grid">
      <div class="hb-tile green hb-kcal"><div class="hb-top"><h3>Калори</h3>${icon(ICON.fire)}</div><b>${day.activeKcal != null ? number(day.activeKcal) : '—'}</b><small>ккал</small></div>
      <div class="hb-tile cyan hb-heart"><div class="hb-top"><h3>Зүрхний цохилт</h3>${icon(ICON.heart)}</div>${day.heart ? `<p>${heartWord(day.heart.bpm)}</p>` : ''}<b>${day.heart ? day.heart.bpm : '—'}</b><small>уд/мин${day.heart ? ` · ${time(day.heart.at)}` : ''}</small></div>
      <div class="hb-tile cyan hb-weight"><div class="hb-top"><h3>Жин</h3>${icon(ICON.weight)}</div><b>${weight ?? '—'}</b><small>кг</small></div>
      <div class="hb-tile green hb-steps"><div class="hb-row"><div><b>${day.steps != null ? number(day.steps) : '—'}</b><small>алхам</small></div>${icon(ICON.shoe)}</div></div>
    </div>
    <div class="hb-tile green hb-score">
      <div class="hb-score-text"><small>Эрүүл мэндийн оноо · <strong>${label}</strong></small>
        ${tip ? `<p><span class="hx-tip-tag">${tip.ai ? '✨ AI зөвлөгөө' : '💡 Зөвлөгөө'}</span>${escape(tip.text)}</p>${tip.extraMl ? `<b class="hx-tip-extra">+${number(tip.extraMl)} мл нэмж уух</b>` : ''}` : ''}</div>
      <span class="hb-ring" role="img" aria-label="Оноо ${score} / 10"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" class="bg"/><circle cx="50" cy="50" r="40" class="fg" stroke-dasharray="${((score / 10) * C).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${score}/10</b></span>
    </div>
    ${health.message ? `<p class="hx-watch-empty">${escape(health.message)}</p>` : ''}
    ${sample() ? '<p class="ac-small center">Жишээ тоо. Android апп-д Galaxy Watch-ийн жинхэнэ мэдээлэл гарна.</p>' : ''}
  </section>`;
}

export function bindWatchCard(): void {
  document.querySelector('[data-watch-connect]')?.addEventListener('click', () => {
    if (health.phase === 'unsupported') { location.href = '/settings.html#linked'; return; }
    void health.connect();
  });
}
