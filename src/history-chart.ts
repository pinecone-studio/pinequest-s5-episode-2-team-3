import { dayKey, type AppState } from './data';
import { number } from './format';

// History chart: each day's bar is stacked from what was drunk up to the goal, what was drunk
// beyond it (over a doctor's limit: the excess) and what was spilled, against the goal line,
// for a week, a month or a year, plus the average, the days the goal was met and the total.
type Span = 'week' | 'month' | 'year';
const SPANS: Record<Span, string> = { week: '7 хоног', month: 'Сар', year: 'Жил' };
const WD = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];
let span: Span = 'week';
let offset = 0;
let picked: number | null = null;

interface Bar { label: string; tick: string; value: number; spill: number; key: string; days: number; met: number; future: boolean }

const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12);

function bars(state: AppState): { bars: Bar[]; title: string } {
  const totals = new Map<string, number>(), spills = new Map<string, number>();
  for (const e of state.events) {
    const map = e.type === 'drink' ? totals : e.type === 'spill' ? spills : null;
    if (map) { const k = dayKey(new Date(e.at)); map.set(k, (map.get(k) ?? 0) + e.amount); }
  }
  const met = (v: number) => state.mode === 'goal' ? v >= state.goal : v > 0 && v <= state.goal;
  const today = dayKey();
  const now = new Date();
  const day = (d: Date, tick: string): Bar => {
    const k = dayKey(d), v = totals.get(k) ?? 0, sp = spills.get(k) ?? 0;
    return { label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, tick, value: v, spill: sp, key: k, days: v || sp ? 1 : 0, met: met(v) ? 1 : 0, future: k > today };
  };
  if (span === 'week') {
    const start = noon(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    const list = WD.map((w, i) => day(noon(start.getFullYear(), start.getMonth(), start.getDate() + i), w));
    return { bars: list, title: `${list[0].label.slice(5)} – ${list[6].label.slice(5)}` };
  }
  if (span === 'month') {
    const y = now.getFullYear(), m = now.getMonth() + offset;
    const first = noon(y, m, 1), len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const list = Array.from({ length: len }, (_, i) => day(noon(first.getFullYear(), first.getMonth(), i + 1), [1, 5, 10, 15, 20, 25, 30].includes(i + 1) ? String(i + 1) : ''));
    return { bars: list, title: `${first.getFullYear()} оны ${first.getMonth() + 1}-р сар` };
  }
  const y = now.getFullYear() + offset;
  const list = Array.from({ length: 12 }, (_, m) => {
    const len = new Date(y, m + 1, 0).getDate();
    let sum = 0, spilled = 0, days = 0, metDays = 0;
    for (let d = 1; d <= len; d++) {
      const k = dayKey(noon(y, m, d)), v = totals.get(k) ?? 0, sp = spills.get(k) ?? 0;
      if (v || sp) { sum += v; spilled += sp; days++; }
      if (met(v)) metDays++;
    }
    return { label: `${y} оны ${m + 1}-р сар (өдрийн дундаж)`, tick: String(m + 1), value: days ? Math.round(sum / days) : 0, spill: days ? Math.round(spilled / days) : 0, key: `${y}-${m}`, days, met: metDays, future: noon(y, m, 1) > now };
  });
  return { bars: list, title: `${y} он` };
}

export function chartSection(state: AppState): string {
  const { bars: list, title } = bars(state);
  const logged = list.filter(b => b.days);
  const sumDays = list.reduce((s, b) => s + b.days, 0);
  const total = span === 'year' ? list.reduce((s, b) => s + b.value * b.days, 0) : list.reduce((s, b) => s + b.value, 0);
  const avg = sumDays ? Math.round(total / sumDays) : 0;
  const metDays = list.reduce((s, b) => s + b.met, 0);

  const W = 340, H = 190, top = 14, bottom = 24, left = 4, right = 4;
  const max = Math.max(state.goal * 1.25, ...list.map(b => b.value + b.spill), 1);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const slot = (W - left - right) / list.length;
  const bw = Math.max(3, Math.min(26, slot * 0.62));
  const goalY = y(state.goal);
  const sel = picked !== null && picked < list.length ? list[picked] : null;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="hc-svg" role="img" aria-label="${title}: өдрийн дундаж ${number(avg)} мл">
    ${list.map((b, i) => {
      const x = left + slot * i + (slot - bw) / 2, base = H - bottom;
      const px = (v: number) => (H - top - bottom) * v / max;
      // A year bar is a month's daily average, so it is "met" when that average reaches the goal.
      const ok = span === 'year' ? (state.mode === 'goal' ? b.value >= state.goal : b.value > 0 && b.value <= state.goal) : b.met > 0;
      const within = Math.min(b.value, state.goal), beyond = Math.max(0, b.value - state.goal);
      const segs: [string, number][] = [[`hc-seg drink${ok ? ' met' : ''}`, within], [`hc-seg ${state.mode === 'limit' ? 'over' : 'extra'}`, beyond], ['hc-seg spill', b.spill]];
      const total = px(b.value + b.spill);
      let yAt = base;
      const rects = segs.filter(([, v]) => v > 0).map(([cls, v]) => { const hh = Math.max(2, px(v)); yAt -= hh; return `<rect class="${cls}" x="${x}" y="${yAt}" width="${bw}" height="${hh}"/>`; }).join('');
      const r = Math.min(6, bw / 2);
      return `<g class="hc-col${b.future ? ' future' : ''}${picked === i ? ' picked' : ''}" data-i="${i}">
        <rect class="hc-hit" x="${left + slot * i}" y="0" width="${slot}" height="${H - bottom}"/>
        <rect class="hc-track" x="${x}" y="${top}" width="${bw}" height="${H - bottom - top}" rx="${r}"/>
        ${total ? `<clipPath id="hc-c${i}"><rect x="${x}" y="${base - Math.max(3, total)}" width="${bw}" height="${Math.max(3, total)}" rx="${r}"/></clipPath><g clip-path="url(#hc-c${i})">${rects}</g>` : ''}
        ${b.tick ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="hc-tick${b.key === dayKey() ? ' today' : ''}">${b.tick}</text>` : ''}
      </g>`;
    }).join('')}
    <line x1="0" x2="${W}" y1="${goalY}" y2="${goalY}" class="hc-goal"/>
    <text x="${W - 2}" y="${goalY - 5}" text-anchor="end" class="hc-goal-label">${state.mode === 'limit' ? 'Хязгаар' : 'Зорилт'} ${number(state.goal)}</text>
  </svg>`;
  return `<section class="hc" aria-labelledby="hc-title">
    <div class="hc-tabs" role="tablist">${(Object.keys(SPANS) as Span[]).map(s => `<button type="button" role="tab" aria-selected="${s === span}" data-span="${s}">${SPANS[s]}</button>`).join('')}</div>
    <div class="hc-nav"><button type="button" data-shift="-1" aria-label="Өмнөх">‹</button><b id="hc-title">${title}</b><button type="button" data-shift="1" aria-label="Дараах" ${offset >= 0 ? 'disabled' : ''}>›</button></div>
    <div class="hc-stats">
      <div><b>${number(avg)}</b><span>мл / өдөр дундаж</span></div>
      <div><b>${metDays}</b><span>${state.mode === 'limit' ? 'хязгаарт багтсан' : 'зорилт биелсэн'} өдөр</span></div>
      <div><b>${(total / 1000).toFixed(1)}</b><span>л нийт</span></div>
    </div>
    <ul class="hc-legend">
      <li><i class="drink"></i>Уусан</li>
      <li><i class="${state.mode === 'limit' ? 'over' : 'extra'}"></i>${state.mode === 'limit' ? 'Хязгаараас хэтэрсэн' : 'Илүү уусан'}</li>
      <li><i class="spill"></i>Асгасан</li>
    </ul>
    <p class="hc-picked" aria-live="polite">${sel ? picked_(sel, state) : logged.length ? 'Багана дээр дарж задаргааг харна' : 'Энэ хугацаанд бүртгэл алга'}</p>
    <div class="hc-chart">${svg}</div>
  </section>`;
}

// The picked day broken down, each part also as a share of the goal (e.g. "+20%").
function picked_(b: Bar, state: AppState): string {
  const pct = (v: number) => `${Math.round((v / state.goal) * 100)}%`;
  const beyond = Math.max(0, b.value - state.goal);
  const parts = [`уусан <b>${number(b.value)}</b> мл (${pct(b.value)})`];
  if (beyond) parts.push(`${state.mode === 'limit' ? 'хэтэрсэн' : 'илүү'} <b>+${number(beyond)}</b> (${pct(beyond)})`);
  if (b.spill) parts.push(`асгасан <b>${number(b.spill)}</b> (${pct(b.spill)})`);
  return `<b>${b.label}</b><br>${parts.join(' · ')}`;
}

export function bindChart(host: HTMLElement, state: () => AppState): void {
  const redraw = () => { host.innerHTML = chartSection(state()); };
  host.onclick = event => {
    const t = event.target as Element;
    const tab = t.closest<HTMLButtonElement>('[data-span]');
    if (tab) { span = tab.dataset.span as Span; offset = 0; picked = null; redraw(); return; }
    const shift = t.closest<HTMLButtonElement>('[data-shift]');
    if (shift && !shift.disabled) { offset = Math.min(0, offset + Number(shift.dataset.shift)); picked = null; redraw(); return; }
    const col = t.closest<SVGGElement>('[data-i]');
    if (col) { const i = Number(col.dataset.i); picked = picked === i ? null : i; redraw(); }
  };
  redraw();
}
