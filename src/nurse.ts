import './style.css';
import './shell.css';
import './pwa';
import './nav';
import { dayKey, defaults, type AppState, type WaterEntry } from './data';
import { escape, number } from './format';
import { load, onExternalChange } from './storage';
import { readMember } from './member';
import { kindOf } from './drinks';
import { Toast, notify } from './components/Toast';
import { WEEKDAY_LONG, WEEKDAY_SHORT, dayTotals, dialysisLabel, gains, kg, md, readDialysisDays, readWeights, shiftDay, weekday, type Gain } from './progress-data';
import './theme.css';
import './progress.css';

// «Сувилагчид харуулах»: the last seven days on one screen to show at dialysis. Who and the limit,
// days over it, the average and the most, each day against the limit, what the fluid came from,
// and the weight gained between sessions. Printed (PDF) or shared as plain text. With a goal instead
// of a limit the same report reads against the goal.
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();

const limitMode = () => state.mode === 'limit';
const signed = (n: number) => (n > 0 ? `+${number(n)}` : n < 0 ? `−${number(-n)}` : '0');
const signedKg = (n: number) => (n < 0 ? `−${kg(-n)}` : `+${kg(n)}`);

interface Day { key: string; total: number; dialysis: boolean }
interface Report {
  days: Day[]; dialysis: number[]; name: string; title: string;
  bad: number; average: number; max: Day | null; gains: Gain[]; events: WaterEntry[];
}

function report(): Report {
  const today = dayKey(), start = shiftDay(today, -6);
  const totals = dayTotals(state.events), dialysis = readDialysisDays();
  const days = Array.from({ length: 7 }, (_, i) => { const key = shiftDay(start, i); return { key, total: totals.get(key) ?? 0, dialysis: dialysis.includes(weekday(key)) }; });
  const logged = days.filter(d => d.total > 0);
  const max = logged.reduce<Day | null>((m, d) => (!m || d.total > m.total ? d : m), null);
  return {
    days, dialysis, max,
    name: readMember()?.name ?? 'Нэргүй',
    title: `${md(start)} – ${md(today)}, ${today.slice(0, 4)}`,
    // Over the limit, or (with a goal) short of it.
    bad: days.filter(d => (limitMode() ? d.total > state.goal : d.total < state.goal)).length,
    average: logged.length ? Math.round(logged.reduce((s, d) => s + d.total, 0) / logged.length) : 0,
    gains: gains(readWeights()).filter(g => g.to >= start && g.to <= today),
    events: state.events.filter(e => e.type === 'drink' && dayKey(new Date(e.at)) >= start),
  };
}

const dayName = (d: Day) => `${md(d.key)} ${WEEKDAY_SHORT[weekday(d.key)]}${d.dialysis ? ' · диализ' : ''}`;
// Days between the two sessions, when there was more than one (a weekend).
const restDays = (g: Gain) => Math.round((Date.parse(`${g.to}T12:00`) - Date.parse(`${g.from}T12:00`)) / 864e5) - 1;
const gainLine = (g: Gain) => `${md(g.from)} → ${md(g.to)}${restDays(g) >= 2 ? ` (амралтын ${restDays(g)} хоног)` : ''}`;

function whoCard(r: Report): string {
  const limit = `${limitMode() ? 'Эмчийн хязгаар' : 'Зорилт'}: ${number(state.goal)} мл / өдөр`;
  return `<section class="hx-card nr-who">
      <h2>${escape(r.name)}</h2>
      <p>${r.title}${r.dialysis.length ? ` · Диализ: ${dialysisLabel(r.dialysis)}` : ''}</p>
      <span class="nr-pill">${limit}</span>
    </section>`;
}

function tiles(r: Report): string {
  return `<ul class="nr-tiles">
      <li class="${r.bad ? 'bad' : ''}"><b>${r.bad}/7</b><small>өдөр ${limitMode() ? 'хэтэрсэн' : 'дутуу'}</small></li>
      <li><b>${number(r.average)}</b><small>мл / өдөр дундаж</small></li>
      <li><b>${r.max ? number(r.max.total) : '—'}</b><small>мл хамгийн их${r.max ? ` (${md(r.max.key)})` : ''}</small></li>
    </ul>`;
}

// Each day against the limit: over in bold red on a faint red row, under in green.
function table(r: Report): string {
  const rows = r.days.map(d => {
    const diff = d.total - state.goal;
    const bad = d.total > 0 && (limitMode() ? diff > 0 : diff < 0);
    const tone = !d.total || !diff ? '' : bad ? 'bad' : 'good';
    return `<tr class="${bad ? 'bad' : ''}"><th scope="row">${dayName(d)}</th><td>${d.total ? `${number(d.total)} мл` : '—'}</td><td class="${tone}">${d.total ? signed(diff) : '—'}</td></tr>`;
  }).join('');
  const next = r.max ? r.dialysis.includes(weekday(shiftDay(r.max.key, 1))) : false;
  const note = r.max ? `<p class="nr-note">Хамгийн их нь ${WEEKDAY_LONG[weekday(r.max.key)]} гараг (${md(r.max.key)})${next ? ', диализын өмнөх өдөр' : ''}.</p>` : '';
  return `<section class="hx-card nr-days" aria-labelledby="nr-days-title">
      <h2 id="nr-days-title">Өдөр бүр</h2>
      <table><thead><tr><th scope="col">Өдөр</th><th scope="col">Нийт</th><th scope="col">${limitMode() ? 'Хязгаараас' : 'Зорилтоос'}</th></tr></thead><tbody>${rows}</tbody></table>
      ${note}
    </section>`;
}

// What the fluid came from: water, milk tea, soup and everything else, by the drink kind.
const SOURCES = [['water', 'Ус'], ['milkTea', 'Сүүтэй цай'], ['soup', 'Шөл'], ['other', 'Бусад']] as const;
function sources(events: readonly WaterEntry[]): { key: string; label: string; pct: number }[] {
  const ml: Record<string, number> = { water: 0, milkTea: 0, soup: 0, other: 0 };
  for (const e of events) { const k = kindOf(e); ml[!k ? 'water' : k === 'milkTea' || k === 'soup' ? k : 'other'] += e.amount; }
  const all = Object.values(ml).reduce((s, v) => s + v, 0);
  return all ? SOURCES.map(([key, label]) => ({ key, label, pct: Math.round((ml[key] / all) * 100) })).filter(s => s.pct > 0) : [];
}
function sourceCard(r: Report): string {
  const list = sources(r.events);
  return `<section class="hx-card nr-from" aria-labelledby="nr-from-title">
      <h2 id="nr-from-title">Юунаас</h2>
      ${list.length ? `<div class="nr-stack" aria-hidden="true">${list.map(s => `<i class="${s.key}" style="flex-grow: ${s.pct}"></i>`).join('')}</div>
      <p class="nr-from-legend">${list.map(s => `<span><i class="${s.key}"></i>${s.label} ${s.pct}%</span>`).join('')}</p>` : '<p class="nr-note">Энэ 7 хоногт бүртгэл алга.</p>'}
    </section>`;
}

function weightCard(r: Report): string {
  if (!limitMode() && !r.gains.length) return '';
  return `<section class="hx-card nr-weight" aria-labelledby="nr-weight-title">
      <h2 id="nr-weight-title">Диализ хоорондын жин</h2>
      ${r.gains.length ? `<ul>${r.gains.map(g => `<li>${gainLine(g)}: <b>${signedKg(g.kg)} кг</b></li>`).join('')}</ul>` : '<p class="nr-note">Энэ 7 хоногт жин оруулаагүй байна.</p>'}
      <p class="nr-note">Өвчтөн өөрөө оруулсан жин</p>
    </section>`;
}

// The same report as plain text, for sharing.
function summary(r: Report): string {
  const lines = [
    'Дусал · 7 хоногийн тайлан', r.name, `${r.title}${r.dialysis.length ? ` · Диализ: ${dialysisLabel(r.dialysis)}` : ''}`,
    `${limitMode() ? 'Эмчийн хязгаар' : 'Зорилт'}: ${number(state.goal)} мл / өдөр`, '',
    `${limitMode() ? 'Хэтэрсэн' : 'Дутуу'} өдөр: ${r.bad}/7`, `Дундаж: ${number(r.average)} мл / өдөр`,
    ...(r.max ? [`Хамгийн их: ${number(r.max.total)} мл (${md(r.max.key)})`] : []), '',
    ...r.days.map(d => `${dayName(d)}: ${d.total ? `${number(d.total)} мл (${signed(d.total - state.goal)})` : '—'}`),
  ];
  const from = sources(r.events);
  if (from.length) lines.push('', `Юунаас: ${from.map(s => `${s.label} ${s.pct}%`).join(', ')}`);
  if (r.gains.length) lines.push('', 'Диализ хоорондын жин:', ...r.gains.map(g => `${gainLine(g)}: ${signedKg(g.kg)} кг`));
  lines.push('', 'ДУСАЛ-ын бүртгэл · эмчилгээний шийдвэрийг эмч гаргана');
  return lines.join('\n');
}

async function share(r: Report): Promise<void> {
  const text = summary(r);
  if (navigator.share) {
    try { await navigator.share({ title: '7 хоногийн тайлан', text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); notify('Тайланг хуулж авлаа.'); } catch { notify('Хуваалцаж чадсангүй.'); }
}

function render(): void {
  const r = report();
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app nr-main" tabindex="-1"><div class="app-shell">
      <div class="hydro hx-page pr-page nr-page">
        <div class="hx-header nr-header"><a class="hx-back" href="/achievements.html" id="nr-back" aria-label="Буцах">‹</a><h1>7 хоногийн тайлан</h1><span></span></div>
        ${whoCard(r)}
        ${tiles(r)}
        ${table(r)}
        ${sourceCard(r)}
        ${weightCard(r)}
        <div class="nr-actions"><button type="button" class="nr-pdf" id="nr-pdf">PDF татах</button><button type="button" class="nr-share" id="nr-share">Хуваалцах</button></div>
        <p class="nr-foot">ДУСАЛ-ын бүртгэл · эмчилгээний шийдвэрийг эмч гаргана</p>
      </div>
    </div></main>
    ${Toast()}`;
  // Inside the app's tab frame the back link stays in this frame (nav.ts would hand a tab link to the host).
  app.querySelector<HTMLAnchorElement>('#nr-back')!.addEventListener('click', e => { e.preventDefault(); location.href = `/achievements.html${location.search}`; });
  app.querySelector<HTMLButtonElement>('#nr-pdf')!.addEventListener('click', () => window.print());
  app.querySelector<HTMLButtonElement>('#nr-share')!.addEventListener('click', () => void share(r));
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
