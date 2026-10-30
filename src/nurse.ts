import './style.css';
import './shell.css';
import './pwa';
import './nav';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, defaults, type AppState, type WaterEntry } from './data';
import { escape, number } from './format';
import { load, onExternalChange } from './storage';
import { readMember } from './member';
import { KINDS, isSalty, kindOf, type Kind } from './drinks';
import { forbidden } from './drink-flags';
import { CONDITIONS, readProfile } from './plan';
import { Toast, notify } from './components/Toast';
import { WEEKDAY_LONG, WEEKDAY_SHORT, dayTotals, dialysisLabel, gains, kg, md, readDialysis, readDryWeight, readThirst, readWeights, shiftDay, weekday, type Gain } from './progress-data';
import './theme.css';
import './progress.css';

// «Сувилагчид харуулах» (on dialysis) or «Эмчид харуулах»: the last seven finished days on one screen,
// with today so far apart, as it is not over yet. For dialysis the weight gained between sessions
// comes first, beside the water drunk in between and the doctor's dry weight; then the days against
// the limit, what needs a word (thirst, salty or ruled-out drinks, late drinking) and what the fluid
// came from. Printed to PDF (on Android through the system's print dialog) or shared as plain text.
// With a goal instead of a limit the same report reads against the goal.
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();

const limitMode = () => state.mode === 'limit';
const onDialysis = () => readProfile().condition === 'kidney';
const signed = (n: number) => (n > 0 ? `+${number(n)}` : n < 0 ? `−${number(-n)}` : '0');
const signedKg = (n: number) => (n < 0 ? `−${kg(-n)}` : `+${kg(n)}`);
// After this hour a drink counts as late: much of the day's fluid this late often means a thirsty night.
const EVENING = 18;
const LATE_SHARE = 40;

interface Day { key: string; total: number; logged: boolean; dialysis: boolean }
interface Interval extends Gain { ml: number; pct: number | null }
interface Report {
  days: Day[]; dialysis: number[]; name: string; title: string; today: number;
  bad: number; logged: number; average: number; max: Day | null;
  intervals: Interval[]; dry: number | null; lastAfter: number | null;
  thirst: number; salty: number; ruledOut: [string, number][]; late: number | null;
  events: WaterEntry[];
}

const drinks = (events: readonly WaterEntry[]) => events.filter(e => e.type === 'drink');

function report(): Report {
  const today = dayKey(), end = shiftDay(today, -1), start = shiftDay(end, -6);
  const totals = dayTotals(state.events), session = readDialysis();
  const dialysis = onDialysis() ? session.days.map(d => d % 7) : [];
  const loggedDays = new Set(drinks(state.events).map(e => dayKey(new Date(e.at))));
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(start, i);
    return { key, total: totals.get(key) ?? 0, logged: loggedDays.has(key), dialysis: dialysis.includes(weekday(key)) };
  });
  const logged = days.filter(d => d.logged);
  const max = logged.reduce<Day | null>((m, d) => (!m || d.total > m.total ? d : m), null);
  const week = drinks(state.events).filter(e => { const k = dayKey(new Date(e.at)); return k >= start && k <= end; });

  // Between two sessions: from the end of one (its day at the session time) to the start of the next.
  const at = (key: string) => new Date(`${key}T${session.time}`).getTime();
  const dry = readDryWeight();
  const intervals = onDialysis() ? gains(readWeights()).filter(g => g.to >= start && g.to <= today).reverse().map(g => ({
    ...g,
    ml: drinks(state.events).reduce((sum, e) => { const t = Date.parse(e.at); return t >= at(g.from) && t < at(g.to) ? sum + e.amount : sum; }, 0),
    pct: dry ? Math.round((g.kg / dry) * 1000) / 10 : null,
  })) : [];

  const ruled = new Map<Kind, number>();
  for (const e of week) { const k = kindOf(e); if (k && forbidden(k, isSalty(e))) ruled.set(k, (ruled.get(k) ?? 0) + 1); }
  const all = week.reduce((s, e) => s + e.amount, 0);
  const late = week.reduce((s, e) => (new Date(e.at).getHours() >= EVENING ? s + e.amount : s), 0);

  return {
    days, dialysis, max, intervals, dry,
    name: readMember()?.name ?? 'Нэргүй',
    title: `${md(start)} – ${md(end)}, ${end.slice(0, 4)}`,
    today: totals.get(today) ?? 0,
    // Over the limit (or, with a goal, short of it), among the days anything was logged.
    bad: logged.filter(d => (limitMode() ? d.total > state.goal : d.total < state.goal)).length,
    logged: logged.length,
    average: logged.length ? Math.round(logged.reduce((s, d) => s + d.total, 0) / logged.length) : 0,
    lastAfter: onDialysis() ? readWeights().filter(w => w.tag === 'after').at(-1)?.kg ?? null : null,
    thirst: readThirst().filter(t => { const k = dayKey(new Date(t.at)); return k >= start && k <= end; }).length,
    salty: week.filter(isSalty).length,
    ruledOut: [...ruled].map(([k, n]) => [KINDS[k].name, n]),
    late: all ? Math.round((late / all) * 100) : null,
    events: week,
  };
}

const dayName = (d: Day) => `${md(d.key)} ${WEEKDAY_SHORT[weekday(d.key)]}${d.dialysis ? ' · диализ' : ''}`;
// Days between the two sessions, when there was more than one (a weekend).
const restDays = (g: Gain) => Math.round((Date.parse(`${g.to}T12:00`) - Date.parse(`${g.from}T12:00`)) / 864e5) - 1;
const gainLine = (g: Gain) => `${md(g.from)} → ${md(g.to)}${restDays(g) >= 2 ? ` (амралтын ${restDays(g)} хоног)` : ''}`;

function whoCard(r: Report): string {
  const p = readProfile();
  const limit = `${limitMode() ? 'Эмчийн хязгаар' : 'Зорилт'}: ${number(state.goal)} мл / өдөр`;
  const about = [`${p.age} нас`, p.condition === 'none' ? '' : p.condition === 'other' && p.conditionNote ? p.conditionNote : CONDITIONS[p.condition]].filter(Boolean).join(' · ');
  return `<section class="hx-card nr-who">
      <h2>${escape(r.name)}</h2>
      <p>${escape(about)}</p>
      <p>${r.title} · 7 хоног${r.dialysis.length ? ` · Диализ: ${dialysisLabel(r.dialysis)}` : ''}</p>
      <div class="nr-pills"><span class="nr-pill">${limit}</span>${r.dry ? `<span class="nr-pill">Хуурай жин: ${kg(r.dry)} кг</span>` : ''}</div>
      <p class="nr-today">Өнөөдөр одоогоор <b>${number(r.today)} мл</b>${limitMode() ? ` · ${r.today > state.goal ? `${number(r.today - state.goal)} мл хэтэрсэн` : `${number(state.goal - r.today)} мл үлдсэн`}` : ''}</p>
    </section>`;
}

// On dialysis, first: each gain between sessions with the water drunk in that time, and its share of the dry weight.
function weightCard(r: Report): string {
  if (!onDialysis()) return '';
  const rows = r.intervals.map(g => `<li><span>${gainLine(g)}</span><b>${signedKg(g.kg)} кг${g.pct !== null ? ` <small>(${g.pct}%)</small>` : ''}</b>
      <small>энэ хооронд ${number(g.ml)} мл уусан</small></li>`).join('');
  return `<section class="hx-card nr-weight" aria-labelledby="nr-weight-title">
      <h2 id="nr-weight-title">Диализ хоорондын жин</h2>
      ${rows ? `<ul>${rows}</ul>` : '<p class="nr-note">Энэ 7 хоногт диализын өмнө, дараах жин оруулаагүй байна.</p>'}
      ${r.lastAfter !== null ? `<p class="nr-note">Сүүлийн диализын дараа ${kg(r.lastAfter)} кг${r.dry ? ` · хуурай жингээс ${signedKg(Math.round((r.lastAfter - r.dry) * 10) / 10)} кг` : ''}</p>` : ''}
      <p class="nr-note">Өвчтөн өөрөө оруулсан жин${r.dry ? ' · хувь нь хуурай жинтэй харьцуулсан' : ''}</p>
    </section>`;
}

function tiles(r: Report): string {
  return `<ul class="nr-tiles">
      <li class="${r.bad ? 'bad' : ''}"><b>${r.bad}/${r.logged}</b><small>өдөр ${limitMode() ? 'хэтэрсэн' : 'дутуу'}</small></li>
      <li><b>${number(r.average)}</b><small>мл / өдөр дундаж</small></li>
      <li><b>${r.max ? number(r.max.total) : '—'}</b><small>мл хамгийн их${r.max ? ` (${md(r.max.key)})` : ''}</small></li>
    </ul>`;
}

// Each day against the limit: over in bold red on a faint red row, under in green; a day with nothing logged says so.
function table(r: Report): string {
  const rows = r.days.map(d => {
    if (!d.logged) return `<tr class="none"><th scope="row">${dayName(d)}</th><td colspan="2">бүртгэлгүй</td></tr>`;
    const diff = d.total - state.goal;
    const bad = limitMode() ? diff > 0 : diff < 0;
    const tone = !diff ? '' : bad ? 'bad' : 'good';
    return `<tr class="${bad ? 'bad' : ''}"><th scope="row">${dayName(d)}</th><td>${number(d.total)} мл</td><td class="${tone}">${signed(diff)}</td></tr>`;
  }).join('');
  const next = r.max ? r.dialysis.includes(weekday(shiftDay(r.max.key, 1))) : false;
  const notes = [
    r.max ? `Хамгийн их нь ${WEEKDAY_LONG[weekday(r.max.key)]} гараг (${md(r.max.key)})${next ? ', диализын өмнөх өдөр' : ''}.` : '',
    r.logged < 7 ? `${7 - r.logged} өдөр бүртгэлгүй: тэр өдрүүдийн дүн тооцоонд ороогүй.` : '',
  ].filter(Boolean).map(n => `<p class="nr-note">${n}</p>`).join('');
  return `<section class="hx-card nr-days" aria-labelledby="nr-days-title">
      <h2 id="nr-days-title">Өдөр бүр</h2>
      <table><thead><tr><th scope="col">Өдөр</th><th scope="col">Нийт</th><th scope="col">${limitMode() ? 'Хязгаараас' : 'Зорилтоос'}</th></tr></thead><tbody>${rows}</tbody></table>
      ${notes}
    </section>`;
}

// What to talk about: «Цангаж байна» opened, salty milk tea or soup, drinks the doctor ruled out, and how much came late.
function attention(r: Report): string[] {
  return [
    r.thirst ? `Цангасан: <b>${r.thirst} удаа</b>` : '',
    r.salty ? `Давстай сүүтэй цай, шөл: <b>${r.salty} аяга</b>` : '',
    r.ruledOut.length ? `Эмчийн хориглосон: <b>${r.ruledOut.map(([name, n]) => `${escape(name)} ${n} удаа`).join(', ')}</b>` : '',
    r.late !== null && r.late >= LATE_SHARE ? `Уусан шингэний <b>${r.late}%</b> нь ${EVENING}:00-аас хойш` : '',
  ].filter(Boolean);
}
function attentionCard(r: Report): string {
  const list = attention(r);
  return `<section class="hx-card nr-watch" aria-labelledby="nr-watch-title">
      <h2 id="nr-watch-title">Анхаарах зүйлс</h2>
      ${list.length ? `<ul>${list.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="nr-note">Энэ 7 хоногт онцгой зүйл бүртгэгдээгүй.</p>'}
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

const plain = (html: string) => html.replace(/<[^>]+>/g, '');

// The same report as plain text, for sharing.
function summary(r: Report): string {
  const lines = [
    `Дусал · 7 хоногийн тайлан`, r.name, `${r.title}${r.dialysis.length ? ` · Диализ: ${dialysisLabel(r.dialysis)}` : ''}`,
    `${limitMode() ? 'Эмчийн хязгаар' : 'Зорилт'}: ${number(state.goal)} мл / өдөр${r.dry ? ` · Хуурай жин: ${kg(r.dry)} кг` : ''}`,
    `Өнөөдөр одоогоор: ${number(r.today)} мл`, '',
  ];
  if (r.intervals.length) lines.push('Диализ хоорондын жин:', ...r.intervals.map(g => `${gainLine(g)}: ${signedKg(g.kg)} кг${g.pct !== null ? ` (${g.pct}%)` : ''}, ${number(g.ml)} мл уусан`), '');
  lines.push(
    `${limitMode() ? 'Хэтэрсэн' : 'Дутуу'} өдөр: ${r.bad}/${r.logged}`, `Дундаж: ${number(r.average)} мл / өдөр`,
    ...(r.max ? [`Хамгийн их: ${number(r.max.total)} мл (${md(r.max.key)})`] : []), '',
    ...r.days.map(d => `${dayName(d)}: ${d.logged ? `${number(d.total)} мл (${signed(d.total - state.goal)})` : 'бүртгэлгүй'}`),
  );
  const notes = attention(r);
  if (notes.length) lines.push('', 'Анхаарах зүйлс:', ...notes.map(n => `- ${plain(n)}`));
  const from = sources(r.events);
  if (from.length) lines.push('', `Юунаас: ${from.map(s => `${s.label} ${s.pct}%`).join(', ')}`);
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

// The Android app's WebView does nothing on window.print(), so there the page goes to the system's
// print dialog (PrintPlugin.java) as one HTML document with its styles inlined.
const printer = Capacitor.getPlatform() === 'android' ? registerPlugin<{ print(o: { html: string; name: string }): Promise<void> }>('DusalPrint') : null;
function printable(): string {
  const css = [...document.styleSheets].map(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText).join('\n'); } catch { return ''; } }).join('\n');
  return `<!doctype html><html lang="mn" class="${document.documentElement.className}" data-theme="light"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>7 хоногийн тайлан</title><style>${css}</style></head><body>${app.innerHTML}</body></html>`;
}
async function toPdf(r: Report): Promise<void> {
  if (!printer) { window.print(); return; }
  try { await printer.print({ html: printable(), name: `Дусал тайлан ${r.name} ${r.title}` }); } catch { notify('PDF гаргаж чадсангүй.'); }
}

function render(): void {
  const r = report();
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app nr-main" tabindex="-1"><div class="app-shell">
      <div class="hydro hx-page pr-page nr-page">
        <div class="hx-header nr-header"><a class="hx-back" href="/achievements.html" id="nr-back" aria-label="Буцах">‹</a><h1>7 хоногийн тайлан</h1><span></span></div>
        ${whoCard(r)}
        ${weightCard(r)}
        ${tiles(r)}
        ${table(r)}
        ${attentionCard(r)}
        ${sourceCard(r)}
        <div class="nr-actions"><button type="button" class="nr-pdf" id="nr-pdf">PDF татах</button><button type="button" class="nr-share" id="nr-share">Хуваалцах</button></div>
        <p class="nr-foot">ДУСАЛ-ын бүртгэл · эмчилгээний шийдвэрийг эмч гаргана</p>
      </div>
    </div></main>
    ${Toast()}`;
  // Inside the app's tab frame the back link stays in this frame (nav.ts would hand a tab link to the host).
  app.querySelector<HTMLAnchorElement>('#nr-back')!.addEventListener('click', e => { e.preventDefault(); location.href = `/achievements.html${location.search}`; });
  app.querySelector<HTMLButtonElement>('#nr-pdf')!.addEventListener('click', () => void toPdf(r));
  app.querySelector<HTMLButtonElement>('#nr-share')!.addEventListener('click', () => void share(r));
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
