import './style.css';
import './shell.css';
import './pwa';
import { dayKey, defaults, type AppState } from './data';
import { escape, number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { hxHeader } from './hydrify';
import './theme.css';

// "Тайлан" page, Hydrify layout (demo): weekly / monthly / yearly tabs, a period stepper, drink
// completion bars, a hydration line, and where the water was logged (base or by hand).
type Span = 'week' | 'month' | 'year';
interface Bucket { label: string; ml: number; days: number }

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let span: Span = 'week';
let offset = 0; // 0 = this period, -1 = the one before …
let picked = -1;

const MONTHS = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];

function totals(): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of state.events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); m.set(k, (m.get(k) ?? 0) + e.amount); }
  return m;
}

// The period's buckets and its title: seven days, the days of a month, or twelve months.
function buckets(): { list: Bucket[]; title: string } {
  const t = totals();
  const now = new Date(); now.setHours(12, 0, 0, 0);
  if (span === 'week') {
    const end = new Date(now); end.setDate(end.getDate() + offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - 6 + i); return d; });
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return { list: days.map(d => ({ label: String(d.getDate()), ml: t.get(dayKey(d)) ?? 0, days: 1 })), title: `${fmt(days[0])} – ${fmt(days[6])}, ${days[6].getFullYear()}` };
  }
  if (span === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const list = Array.from({ length: count }, (_, i) => { const d = new Date(first); d.setDate(i + 1); return { label: String(i + 1), ml: t.get(dayKey(d)) ?? 0, days: 1 }; });
    return { list, title: `${first.getFullYear()} оны ${MONTHS[first.getMonth()]} сар` };
  }
  const year = now.getFullYear() + offset;
  const list = MONTHS.map((m, i) => {
    const count = new Date(year, i + 1, 0).getDate();
    let ml = 0;
    for (let d = 1; d <= count; d++) ml += t.get(dayKey(new Date(year, i, d, 12))) ?? 0;
    return { label: String(i + 1), ml, days: count };
  });
  return { list, title: `${year} он` };
}

// One chart shape for both cards: bars or a line over the same values, with the y axis labels and
// the tooltip text the card gives. The picked bucket (or the last one) is highlighted.
type Kind = 'bar' | 'line';
const kinds: Record<'done' | 'water', Kind> = { done: 'bar', water: 'line' };

function chart(list: Bucket[], values: number[], top: number, axis: string[], tip: (v: number) => string, kind: Kind): string {
  const sel = picked >= 0 && picked < list.length ? picked : list.length - 1;
  const labels = `<div class="rp-labels" aria-hidden="true">${list.map((b, i) => `<span>${list.length > 12 && i % 5 && i !== list.length - 1 ? '' : escape(b.label)}</span>`).join('')}</div>`;
  const axisHtml = `<div class="rp-axis" aria-hidden="true">${axis.map(a => `<span>${a}</span>`).join('')}</div>`;
  const h = (v: number) => Math.max(0, Math.min(100, (v / top) * 100));
  if (kind === 'bar') {
    return `<div class="rp-bars">${axisHtml}<div class="rp-plot">${list.map((b, i) => `<button type="button" class="rp-bar${i === sel ? ' on' : ''}" data-pick="${i}" aria-label="${escape(b.label)}: ${escape(tip(values[i]))}">
      <i style="height: ${h(values[i])}%">${i === sel ? `<span class="rp-tip">${tip(values[i])}</span>` : ''}</i></button>`).join('')}</div>${labels}</div>`;
  }
  const x = (i: number) => (list.length === 1 ? 50 : (i / (list.length - 1)) * 100);
  const y = (v: number) => 100 - h(v);
  const pts = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return `<div class="rp-line">${axisHtml}<div class="rp-plot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="rp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#369fff" stop-opacity=".22"/><stop offset="1" stop-color="#369fff" stop-opacity="0"/></linearGradient></defs>
        <polygon class="rp-area" points="0,100 ${pts} 100,100"/>
        <polyline class="rp-path" points="${pts}" vector-effect="non-scaling-stroke"/>
      </svg>
      ${list.length <= 12 ? values.map((v, i) => `<button type="button" class="rp-dot${i === sel ? ' on' : ''}" data-pick="${i}" aria-label="${escape(list[i].label)}: ${escape(tip(v))}" style="left: ${x(i)}%; top: ${y(v)}%"></button>`).join('') : ''}
      <span class="rp-tip line" style="left: ${x(sel)}%; top: ${y(values[sel])}%">${tip(values[sel])}</span>
    </div>${labels}</div>`;
}

function toggle(card: 'done' | 'water'): string {
  const btn = (k: Kind, label: string, d: string) => `<button type="button" data-kind="${card}:${k}" aria-pressed="${kinds[card] === k}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg></button>`;
  return `<div class="rp-toggle">${btn('bar', 'Баганан график', '<path d="M7 17v-5M12 17V7M17 17v-8"/>')}${btn('line', 'Шугаман график', '<path d="M5 16l4.5-4.5 3 3L19 8"/>')}</div>`;
}

function doneChart(list: Bucket[]): string {
  const pct = list.map(b => Math.round((b.ml / b.days / state.goal) * 100));
  return chart(list, pct, 100, ['100%', '80%', '60%', '40%', '20%', '0%'], v => `${v}%`, kinds.done);
}
function waterChart(list: Bucket[]): string {
  const ml = list.map(b => Math.round(b.ml / b.days));
  const top = Math.max(2500, ...ml) * 1.1;
  return chart(list, ml, top, [1, .8, .6, .4, .2, 0].map(f => `${((top * f) / 1000).toFixed(1).replace(/\.0$/, '')}L`), v => `${number(v)}<small>мл</small>`, kinds.water);
}

// Where the water was logged: by the smart base, by hand, or on the widget.
function sources(): string {
  let base = 0, hand = 0;
  for (const e of state.events) if (e.type === 'drink') { if (e.deviceId) base += e.amount; else hand += e.amount; }
  const all = base + hand || 1;
  const C = 2 * Math.PI * 40;
  const b = (base / all) * C;
  return `<div class="rp-donut">
    <div class="rp-ring" role="img" aria-label="Суурь ${Math.round((base / all) * 100)}%, гараар ${Math.round((hand / all) * 100)}%">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" class="hand"/><circle cx="50" cy="50" r="40" class="base" stroke-dasharray="${b.toFixed(1)} ${C.toFixed(1)}"/></svg>
      <p><b>${number(Math.round((base + hand) / 1000))}L</b><small>нийт</small></p>
    </div>
    <ul class="rp-legend"><li><i class="base"></i>Ухаалаг суурь (${Math.round((base / all) * 100)}%)</li><li><i class="hand"></i>Гараар (${Math.round((hand / all) * 100)}%)</li></ul>
  </div>`;
}

function render(): void {
  const { list, title } = buckets();
  const tab = (key: Span, label: string) => `<button type="button" role="tab" aria-selected="${span === key}" data-span="${key}">${label}</button>`;
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('report')}</header>
      <div class="hydro hx-page">
        ${hxHeader('Тайлан')}
        <div class="rp-tabs" role="tablist" aria-label="Хугацаа">${tab('week', '7 хоног')}${tab('month', 'Сар')}${tab('year', 'Жил')}</div>
        <div class="rp-range"><button type="button" data-step="-1" aria-label="Өмнөх">‹</button><b>${escape(title)}</b><button type="button" data-step="1" aria-label="Дараах" ${offset >= 0 ? 'disabled' : ''}>›</button></div>
        <section class="hx-card"><div class="hx-card-head"><h2>Зорилтын биелэлт</h2>${toggle('done')}</div>${doneChart(list)}</section>
        <section class="hx-card"><div class="hx-card-head"><h2>Ус</h2>${toggle('water')}</div>${waterChart(list)}</section>
        <section class="hx-card"><div class="hx-card-head"><h2>Хаанаас бүртгэсэн</h2></div>${sources()}</section>
      </div>
    </div></main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-span]').forEach(b => b.addEventListener('click', () => { span = b.dataset.span as Span; offset = 0; picked = -1; render(); }));
  app.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => { offset = Math.min(0, offset + Number(b.dataset.step)); picked = -1; render(); }));
  app.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b => b.addEventListener('click', () => { const [card, k] = b.dataset.kind!.split(':'); kinds[card as 'done' | 'water'] = k as Kind; render(); }));
  app.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(b => b.addEventListener('click', () => { picked = Number(b.dataset.pick); render(); }));
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
