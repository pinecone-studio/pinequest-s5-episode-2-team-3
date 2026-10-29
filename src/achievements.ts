import './style.css';
import './shell.css';
import './pwa';
import { dayKey, defaults, type AppState } from './data';
import { escape, number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { hxHeader } from './hydrify';
import { chooseSheet, openAmountSheet } from './hx-edit';
import { readProfile } from './plan';
import { Toast, notify } from './components/Toast';
import { addWeight, dayKept, dayTotals, extraOver, gains, keptGainDiff, kg, md, readWeights, streaks, type WeightTag } from './progress-data';
import './theme.css';
import './progress.css';

// «Явц» page (kept at /achievements.html so old links work). For dialysis patients under a doctor's
// limit, top to bottom: the streak of days that kept the limit, a month calendar of kept and over
// days, the weight gained between dialysis sessions, a link to the weekly report for the nurse, and
// the 7 / 30 / 90 day milestones. With a goal instead of a limit the same page counts goal days.
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let monthOffset = 0; // 0 = this month, -1 = the one before …

const limitMode = () => state.mode === 'limit';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function streakCard(current: number, best: number): string {
  const what = limitMode() ? 'дараалан хязгаартаа багтсан' : 'дараалан зорилгоо биелүүлсэн';
  const today = limitMode() ? 'Өнөөдрийг хязгаартаа дуусгавал' : 'Өнөөдөр зорилгоо биелүүлбэл';
  return `<section class="hx-card pr-streak" aria-label="Streak">
      <span class="pr-streak-icon">${CHECK}</span>
      <div><p class="pr-streak-n">${number(current)} өдөр</p><p class="pr-streak-what">${what}</p>
      <p class="pr-streak-note">${today} ${number(current + 1)} болно · Хамгийн урт: ${number(best)}</p></div>
    </section>`;
}

// The month in a Monday-first grid: kept days green, over (or short of the goal) red, today outlined,
// future days and days without entries grey. "X/Y" counts the days before today.
function calendar(totals: Map<string, number>): string {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 12);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = dayKey();
  let kept = 0, past = 0;
  const cells = Array.from({ length: (first.getDay() + 6) % 7 }, () => '<li aria-hidden="true"></li>');
  for (let d = 1; d <= count; d++) {
    const k = dayKey(new Date(first.getFullYear(), first.getMonth(), d, 12));
    const total = totals.get(k) ?? 0;
    const ok = dayKept(total, state.goal, state.mode);
    if (k < today) { past++; if (ok) kept++; }
    const cls = k > today ? 'future' : k === today ? 'today' : !total ? 'none' : ok ? 'ok' : 'over';
    const said = cls === 'future' ? '' : cls === 'today' ? `өнөөдөр, ${number(total)} мл` : cls === 'none' ? 'бүртгэлгүй' : `${number(total)} мл, ${ok ? (limitMode() ? 'хязгаартаа' : 'биелсэн') : (limitMode() ? 'хэтэрсэн' : 'дутуу')}`;
    cells.push(`<li class="${cls}"><span aria-hidden="true">${d}</span>${said ? `<span class="visually-hidden">${d}: ${said}</span>` : ''}</li>`);
  }
  const title = `${first.getFullYear() === now.getFullYear() ? '' : `${first.getFullYear()} оны `}${first.getMonth() + 1}-р сар`;
  const legend = limitMode() ? ['Хязгаартаа', 'Хэтэрсэн'] : ['Биелсэн', 'Дутуу'];
  return `<section class="hx-card pr-cal" aria-labelledby="pr-cal-title">
      <div class="pr-cal-head">
        <div class="pr-cal-step"><button type="button" data-month="-1" aria-label="Өмнөх сар">‹</button><h2 id="pr-cal-title">${title}</h2><button type="button" data-month="1" aria-label="Дараах сар" ${monthOffset >= 0 ? 'disabled' : ''}>›</button></div>
        <p><b>${kept}/${past}</b> өдөр ${limitMode() ? 'хязгаартаа' : 'биелсэн'}</p>
      </div>
      <div class="pr-cal-week" aria-hidden="true">${['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(w => `<small>${w}</small>`).join('')}</div>
      <ol class="pr-cal-days">${cells.join('')}</ol>
      <p class="pr-legend"><span><i class="ok"></i>${legend[0]}</span><span><i class="over"></i>${legend[1]}</span></p>
    </section>`;
}

// The goal home only: how much past the goal was drunk in the calendar's month, up to today. Drinking
// more is not a fault for someone without a doctor's limit, so it is told as a plain amount.
function extraCard(totals: Map<string, number>): string {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 12);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = dayKey();
  const keys = Array.from({ length: count }, (_, i) => dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1, 12))).filter(k => k <= today);
  const x = extraOver(totals, state.goal, keys);
  const month = `${first.getMonth() + 1}-р сар`;
  return `<section class="hx-card pr-extra" aria-labelledby="pr-extra-title">
      <div class="pr-card-head"><h2 id="pr-extra-title">Илүү уусан</h2><small>${month}</small></div>
      ${x.ml ? `<p class="pr-extra-n">+${number(x.ml)} мл</p>
      <p class="pr-extra-what">${number(x.days)} өдөр зорилтоосоо илүү${x.top ? ` · хамгийн их ${md(x.top.key)}: +${number(x.top.ml)} мл` : ''}</p>`
        : `<p class="pr-empty">${month}д зорилтоосоо илүү уусан өдөр алга</p>`}
      <p class="pr-foot">Илүү уух нь буруу биш. Халуун, хөдөлгөөнтэй өдөр бие илүү ус хэрэгтэй.</p>
    </section>`;
}

// Weight gained between sessions, the last six as bars: orange from 4% of the profile weight, the
// newest darker.
function weightCard(): string {
  const list = gains(readWeights());
  const last = list.slice(-6);
  const top = Math.max(1, ...last.map(g => g.kg));
  const heavy = readProfile().weight * 0.04;
  const diff = keptGainDiff(list, state.events, state.goal);
  const bars = last.map((g, i) => `<li class="${g.kg >= heavy ? 'heavy' : ''}${i === last.length - 1 ? ' last' : ''}">
      <b aria-hidden="true">${kg(g.kg)}</b><i aria-hidden="true" style="height: ${Math.max(4, Math.round((Math.max(0, g.kg) / top) * 96))}px"></i><small aria-hidden="true">${md(g.to)}</small>
      <span class="visually-hidden">${md(g.from)}-аас ${md(g.to)} хүртэл ${kg(g.kg)} кг</span></li>`).join('');
  return `<section class="hx-card pr-weight" aria-labelledby="pr-weight-title">
      <div class="pr-card-head"><h2 id="pr-weight-title">Диализ хоорондын жин</h2><button type="button" class="pr-pill" id="pr-add-weight">+ Жин оруулах</button></div>
      ${last.length ? `<ol class="pr-gains">${bars}</ol>` : '<p class="pr-empty">Диализын өмнө, дараа жингээ оруулбал энд харагдана</p>'}
      ${diff !== null ? `<p class="pr-good">Хязгаартаа багтсан 7 хоногт диализ хоорондын жин <b>${kg(diff)} кг бага</b> нэмэгдсэн.</p>` : ''}
      ${last.length ? '<p class="pr-foot">кг · диализын өмнөх жингээс өмнөх удаагийн дараах жинг хассан</p>' : ''}
    </section>`;
}

const REPORT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5h6v1M9 10h6M9 14h6M9 18h3"/></svg>';
const reportLink = () => `<a class="hx-card pr-link" href="/nurse.html${escape(location.search)}">
    <span class="pr-link-icon">${REPORT_ICON}</span>
    <span class="pr-link-text"><b>Сувилагчид харуулах</b><small>7 хоногийн тайлан · диализ дээр үзүүлэх</small></span>
    <i aria-hidden="true">›</i>
  </a>`;

// 7 / 30 / 90 days, by the longest streak: reached green, the next one blue with its progress.
const MILESTONES = [7, 30, 90];
function milestones(best: number): string {
  const next = MILESTONES.find(m => best < m);
  return `<ul class="pr-miles" aria-label="Зорилтот өдрүүд">${MILESTONES.map(m => {
    if (best >= m) return `<li class="reached"><b>${m}</b><small>өдөр · хүрсэн</small></li>`;
    if (m === next) return `<li class="next"><b>${m}</b><small>өдөр · ${number(best)}/${m}</small><i class="pr-bar" aria-hidden="true"><span style="width: ${((best / m) * 100).toFixed(1)}%"></span></i></li>`;
    return `<li><b>${m}</b><small>өдөр</small></li>`;
  }).join('')}</ul>`;
}

// «+ Жин оруулах»: before or after dialysis, then the weight (today's date) on the amount keypad.
function enterWeight(): void {
  const today = readWeights().filter(w => w.date === dayKey());
  const tag: WeightTag = today.some(w => w.tag === 'before') && !today.some(w => w.tag === 'after') ? 'after' : 'before';
  chooseSheet('Жин оруулах', [['before', 'Диализын өмнө'], ['after', 'Диализын дараа']], tag, value => {
    const t = value as WeightTag;
    const lastKg = readWeights().at(-1)?.kg ?? readProfile().weight;
    openAmountSheet(t === 'before' ? 'Диализын өмнөх жин' : 'Диализын дараах жин', '⚖️', lastKg, v => {
      if (v < 10) { notify('Жин 10–250 кг байна.'); return; }
      if (!addWeight({ date: dayKey(), kg: v, tag: t })) { notify('Жинг хадгалж чадсангүй.'); return; }
      notify('Жинг хадгаллаа.');
      render();
    }, 'кг', 250, 1);
  });
}

function render(): void {
  const { current, best } = streaks(state.events, state.goal, state.mode);
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('achievements')}</header>
      <div class="hydro hx-page pr-page">
        ${hxHeader('Явц')}
        ${streakCard(current, best)}
        ${calendar(dayTotals(state.events))}
        ${limitMode() ? weightCard() + reportLink() : extraCard(dayTotals(state.events))}
        ${milestones(best)}
      </div>
    </div></main>
    ${Toast()}`;
  // After a key press focus goes back to the arrow; after a tap it would draw a focus ring.
  app.querySelectorAll<HTMLButtonElement>('[data-month]').forEach(b => b.addEventListener('click', e => {
    monthOffset = Math.min(0, monthOffset + Number(b.dataset.month));
    render();
    if (e.detail === 0) app.querySelector<HTMLButtonElement>(`[data-month="${b.dataset.month}"]:not(:disabled)`)?.focus();
  }));
  app.querySelector<HTMLButtonElement>('#pr-add-weight')?.addEventListener('click', enterWeight);
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
