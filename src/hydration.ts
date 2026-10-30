import { entryIcon, entryName } from './drinks';
import './hydration.css';
import { number, time } from './format';
import { mdIcon } from './components/Icon';
import { dayKey, TYPES, type WaterEntry } from './data';
import { AVATARS, avatarSvg, openAvatarPicker, readAvatar, type Face } from './avatars';
import { lastDrink, minutesSince, paceText, sinceText, sinceTone, type Pace } from './pace';
import { icon } from './components/Icon';

// Home: a bottle buddy that fills toward the daily goal, a row of cups that add on a tap, and «Өөр» to swipe any amount.
// Tapping the button sends a drop into the bottle before the entry is saved.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Water offset from full for the chosen character (its own water band height).
const levelY = (frac: number) => AVATARS[readAvatar()].waterH * (1 - frac);
// Fill as last shown, so the next render rises from there (from empty on first paint).
let shownFrac = 0;
let shownDrink: number | null = null;

const ICONS = {
  glass: '<path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8Z"/>',
  mug: '<path d="M5 6h11v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="currentColor" stroke-width="2"/>',
  bottle: '<path d="M10 2h4v3l2 2.5V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7.5L10 5Z"/>',
  jug: '<path d="M9 2h6v2.5l2.5 3V20a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7.5L9 4.5Z"/>',
};
// Cup sizes to swipe through; the centred one is what the big button adds.
const CUPS = [
  { ml: 100, icon: ICONS.glass },
  { ml: 150, icon: ICONS.glass },
  { ml: 200, icon: ICONS.mug },
  { ml: 250, icon: ICONS.mug },
  { ml: 330, icon: ICONS.bottle },
  { ml: 500, icon: ICONS.bottle },
  { ml: 750, icon: ICONS.jug },
] as const;
// Cups add on a tap. The last item, «Өөр», opens the amount you swipe up or down instead, in a panel
// pinned above the tab bar so it is on screen however far down the cups sit.
let pourOpen = false;
// The amount to add, remembered between renders and across visits: the last amount poured.
const LAST_KEY = 'dusal-last-pour-v1';
let cup = (() => { try { const v = Number(localStorage.getItem(LAST_KEY)); return v >= 10 && v <= 3000 ? v : 250; } catch { return 250; } })();
const remember = (ml: number) => { cup = ml; try { localStorage.setItem(LAST_KEY, String(ml)); } catch { /* default next time */ } };
const POUR_MIN = 10, POUR_MAX = 3000, POUR_STEP_PX = 6, POUR_CANCEL_PX = 70;

// `behind` is the face for a day running behind the clock (pace.ts); otherwise the buddy is content.
export function buddySection(drink: number, goal: number, mode: 'goal' | 'limit', behind: Face | null = null): string {
  const frac = Math.min(1, drink / goal);
  // Under a doctor's limit the bottle never cheers for more: it warns as the limit gets close.
  const over = mode === 'limit' && drink > goal;
  const near = mode === 'limit' && !over && drink >= goal * 0.8;
  const done = mode === 'goal' && drink >= goal;
  const diff = goal - drink;
  const sub = over ? `Эмчийн хязгаараас ${number(-diff)} мл хэтэрсэн` : near ? `Хязгаарт ойртож байна · ${number(diff)} мл үлдсэн` : done ? `Зорилт биеллээ ${mdIcon('celebration')}` : mode === 'limit' ? `Хязгаар хүртэл ${number(diff)} мл` : `Дахиад ${number(diff)} мл`;
  const face = done ? 'beam' : over || near ? 'worried' : behind ?? 'happy';
  return `<div class="buddy${over ? ' over' : ''}${near ? ' near' : ''}${done ? ' done' : ''}" data-frac="${frac}" data-goal="${goal}" role="img" aria-label="Өнөөдөр ${number(drink)} / ${number(goal)} мл, ${Math.round((drink / goal) * 100)}%">
    <p class="buddy-pct">${Math.round((drink / goal) * 100)}<span>%</span></p>
    <div class="buddy-stage">${avatarSvg(readAvatar(), face, levelY(shownFrac), done)}
      <button type="button" class="avatar-btn" id="avatar-btn" aria-label="Дүр солих">${mdIcon('auto_awesome')}</button></div>
    <div class="buddy-text">
      <p class="buddy-total"><b id="today-drink">${number(drink)}</b><span>/ ${number(goal)} мл</span></p>
      <p class="buddy-sub">${sub}</p>
    </div>
  </div>`;
}

// Daily streak, Duolingo style: consecutive days that met the goal (or, under a doctor's limit,
// days with drinks logged that stayed within it). Today only adds once it counts, so an
// unfinished today never breaks the streak.
const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
type Mode = 'goal' | 'limit';

function dayTotals(events: readonly WaterEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); totals.set(k, (totals.get(k) ?? 0) + e.amount); }
  return totals;
}

export function dayCounter(events: readonly WaterEntry[], goal: number, mode: Mode): (key: string) => boolean {
  const totals = dayTotals(events);
  return k => { const t = totals.get(k) ?? 0; return mode === 'goal' ? t >= goal : t > 0 && t <= goal; };
}

// How each day went, as a small water drop whose face changes: beaming at the goal, smiling,
// calm, a little sad when little was drunk, sad with a tear and a soft red rim on a missed day.
type Mood = 'great' | 'good' | 'ok' | 'low' | 'missed' | 'wait' | 'over';
const MOOD_LABEL: Record<Mood, string> = { great: 'Биелсэн', good: '75%+', ok: '50%+', low: 'Бага', missed: 'Алгассан', wait: 'Хүлээж байна', over: 'Хэтэрсэн' };
const DROP = 'M12 2C12 2 4 11 4 17a8 8 0 0 0 16 0C20 11 12 2 12 2Z';
const FACES: Record<Mood, string> = {
  great: '<path d="M7.8 16.2q1.3-1.5 2.6 0M13.6 16.2q1.3-1.5 2.6 0" class="ln"/><path d="M9 18.6q3 3.6 6 0Z" class="fill"/>',
  good: '<circle cx="9.2" cy="16" r="1.2"/><circle cx="14.8" cy="16" r="1.2"/><path d="M9.6 18.8q2.4 2.2 4.8 0" class="ln"/>',
  ok: '<circle cx="9.2" cy="16" r="1.2"/><circle cx="14.8" cy="16" r="1.2"/><path d="M10 19.8h4" class="ln"/>',
  low: '<circle cx="9.2" cy="16.3" r="1.2"/><circle cx="14.8" cy="16.3" r="1.2"/><path d="M9.6 20.6q2.4-2 4.8 0" class="ln"/>',
  missed: '<path d="M7.8 14.8l2.4-1.1M16.2 14.8l-2.4-1.1" class="ln"/><circle cx="9.2" cy="16.4" r="1.2"/><circle cx="14.8" cy="16.4" r="1.2"/><path d="M9.8 20.8q2.2-1.8 4.4 0" class="ln"/><path d="M8.4 18.2q-.7 1.1 0 1.6q.7-.5 0-1.6Z" class="tear"/>',
  wait: '<circle cx="9.2" cy="16" r="1.2"/><circle cx="14.8" cy="16" r="1.2"/><circle cx="12" cy="19.8" r="1.1" class="ring"/>',
  over: '<path d="M7.8 14.6l2.6-1M16.2 14.6l-2.6-1" class="ln"/><circle cx="9.2" cy="16.4" r="1.2"/><circle cx="14.8" cy="16.4" r="1.2"/><path d="M9.6 20.6q2.4-2 4.8 0" class="ln"/>',
};
const dropFace = (m: Mood) => `<svg class="drop drop-${m}" viewBox="0 0 24 26" role="img" aria-label="${MOOD_LABEL[m]}"><path d="${DROP}" class="body"/>${m === 'great' ? '<circle cx="7.6" cy="18.6" r="1.3" class="blush"/><circle cx="16.4" cy="18.6" r="1.3" class="blush"/>' : ''}<path d="M8.6 9.6q-1.4 2-1.8 4" class="shine"/>${FACES[m]}</svg>`;
const LEGEND = {
  goal: (['great', 'good', 'ok', 'low', 'missed'] as Mood[]).map(m => `<span>${dropFace(m)}${MOOD_LABEL[m]}</span>`).join(''),
  limit: (['great', 'over', 'missed'] as Mood[]).map(m => `<span>${dropFace(m)}${m === 'great' ? 'Хязгаарт багтсан' : MOOD_LABEL[m]}</span>`).join(''),
};
// Days before the first ever drink are not "missed": the app simply wasn't in use yet.
function dayMood(events: readonly WaterEntry[], goal: number, mode: Mode): (key: string) => Mood | null {
  const totals = dayTotals(events), today = dayKey();
  const first = [...totals.keys()].sort()[0] ?? today;
  return k => {
    const t = totals.get(k) ?? 0;
    if (!t) return k === today ? 'wait' : k < first ? null : 'missed';
    if (mode === 'limit') return t <= goal ? 'great' : 'over';
    const f = t / goal;
    return f >= 1 ? 'great' : f >= .75 ? 'good' : f >= .5 ? 'ok' : 'low';
  };
}

const noon = (d: Date) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
const daysBack = (back: number) => { const d = noon(new Date()); d.setDate(d.getDate() - back); return d; };

function currentStreak(counts: (k: string) => boolean): number {
  let streak = 0;
  for (let back = counts(dayKey(daysBack(0))) ? 0 : 1; counts(dayKey(daysBack(back))); back++) streak++;
  return streak;
}

// Today's streak for reminders (schedule.ts), counted the same way as the chip.
export const streakNow = (events: readonly WaterEntry[], goal: number, mode: Mode) => currentStreak(dayCounter(events, goal, mode));

export function streakParts(events: readonly WaterEntry[], goal: number, mode: Mode): { chip: string; week: string } {
  const counts = dayCounter(events, goal, mode), mood = dayMood(events, goal, mode);
  const streak = currentStreak(counts);
  const chip = `<button type="button" class="streak${streak ? ' hot' : ''}" data-calendar aria-label="${streak} өдөр дараалан, календарь нээх"><span aria-hidden="true">${mdIcon('local_fire_department')}</span>${streak}</button>`;
  const week = `<div class="week-wrap"><div class="week-box"><div class="week-corners"><button type="button" class="week-cal" data-calendar aria-label="Сарын календарь нээх">${mdIcon('calendar_month')}</button>${chip}</div><ol class="week-strip" aria-label="Өдрүүд, хажуу тийш гүйлгэнэ">${STRIP.map(back => {
    const d = daysBack(back), k = dayKey(d);
    if (back < 0) return `<li class="future"><button type="button" disabled aria-label="${dayTitle(d)}"><span class="wd">${-back === STRIP_DAYS ? `${d.getMonth() + 1}/${d.getDate()}` : WEEKDAYS[d.getDay()]}</span><span class="mark"></span></button></li>`;
    const m = mood(k);
    return `<li class="m-${m ?? 'none'}${back === 0 ? ' today' : ' past'}"><button type="button" data-day="${k}" aria-label="${dayTitle(d)}, задаргаа харах"><span class="wd">${back === STRIP_DAYS ? `${d.getMonth() + 1}/${d.getDate()}` : WEEKDAYS[d.getDay()]}</span><span class="mark">${m ? dropFace(m) : ''}</span></button></li>`;
  }).join('')}</ol></div></div>`;
  return { chip, week };
}

// Hydrify home's week card: this week Monday to Sunday (as in the kit), each day a ring filled to its share of
// the goal (full and blue on a day that counted, orange past a doctor's limit), the streak and the
// month calendar in the head. Tapping a day opens its breakdown, as on the old strip.
export function hxWeekCard(events: readonly WaterEntry[], goal: number, mode: Mode): string {
  const counts = dayCounter(events, goal, mode), totals = dayTotals(events);
  const streak = currentStreak(counts);
  const today = dayKey(), C = 2 * Math.PI * 17;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i); return d; });
  return `<section class="hx-card hx-home-week" aria-labelledby="hx-week-title">
    <div class="hx-card-head"><h2 id="hx-week-title">Энэ долоо хоног</h2>
      <span class="hx-week-tools"><button type="button" class="hx-streak-chip${streak ? ' hot' : ''}" data-calendar aria-label="${streak} өдөр дараалан, календарь нээх">${mdIcon('local_fire_department')}${streak}</button>
      <button type="button" class="hx-cal-btn" data-calendar aria-label="Сарын календарь нээх"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></button></span></div>
    <ol class="hx-week-rings">${days.map(d => {
      const k = dayKey(d), future = k > today, ml = totals.get(k) ?? 0;
      const met = !future && k <= today && counts(k), over = mode === 'limit' && ml > goal;
      const frac = met && mode === 'goal' ? 1 : Math.min(1, ml / goal);
      return `<li class="${k === today ? 'today' : ''}${met ? ' met' : ''}${over ? ' over' : ''}"><small>${WEEKDAYS[d.getDay()].slice(0, 2)}</small>
        <button type="button" class="hx-day" ${future ? 'disabled' : `data-day="${k}"`} aria-label="${dayTitle(d)}: ${number(ml)} мл${met ? ', биелсэн' : ''}">
          <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="bg"/>${frac > 0 ? `<circle cx="20" cy="20" r="17" class="fg" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>` : ''}</svg><b>${met ? mdIcon('check') : d.getDate()}</b></button></li>`;
    }).join('')}</ol>
  </section>`;
}

// The strip under the cups: a week back and a week ahead of today, no further. Nearby days show
// weekday names, the far ends their date. It opens with today in the middle.
const STRIP_DAYS = 7;
const STRIP = Array.from({ length: STRIP_DAYS * 2 + 1 }, (_, i) => STRIP_DAYS - i);
const dayTitle = (d: Date) => `${d.getMonth() + 1}-р сарын ${d.getDate()}, ${WEEKDAYS[d.getDay()]}`;

// Where the strip was scrolled, kept across re-renders; null opens it on today.
let stripScroll: number | null = null;

// A month calendar of goal days with the current and best streak; ‹ › walk through months.
// Tapping a day in the strip opens that day's breakdown.
export function bindStreakCalendar(events: readonly WaterEntry[], goal: number, mode: Mode): void {
  document.querySelectorAll<HTMLButtonElement>('[data-calendar]').forEach(b => b.addEventListener('click', () => openCalendar(events, goal, mode)));
  document.querySelectorAll<HTMLButtonElement>('.hx-home-week [data-day]').forEach(b => b.addEventListener('click', () => openDay(events, goal, mode, b.dataset.day!)));
  const strip = document.querySelector<HTMLElement>('.week-strip');
  if (!strip) return;
  const today = strip.querySelector<HTMLElement>('li.today')!;
  strip.scrollLeft = stripScroll ?? today.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - today.offsetWidth) / 2;
  strip.addEventListener('scroll', () => { stripScroll = strip.scrollLeft; }, { passive: true });
  strip.querySelectorAll<HTMLButtonElement>('[data-day]').forEach(b => b.addEventListener('click', () => openDay(events, goal, mode, b.dataset.day!)));
}

// One day's breakdown: its drop, the total against the goal or limit, and every entry with its time.
function openDay(events: readonly WaterEntry[], goal: number, mode: Mode, key: string): void {
  const list = events.filter(e => dayKey(new Date(e.at)) === key).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const drunk = list.reduce((sum, e) => (e.type === 'drink' ? sum + e.amount : sum), 0);
  const pct = Math.round((drunk / goal) * 100);
  const over = mode === 'limit' && drunk > goal;
  const { box, close } = hxSheet('day-title', `<h2 id="day-title">${dayTitle(new Date(`${key}T12:00`))}</h2>
    <div class="hx-daysum">${ring(Math.min(1, drunk / goal), over, `${Math.min(999, pct)}%`, 64)}
      <div><p class="hx-daysum-ml"><b>${number(drunk)}</b> / ${number(goal)} мл</p><p class="hx-daysum-note">${mode === 'goal' ? (drunk >= goal ? `Зорилт биелсэн ${mdIcon('celebration')}` : `Зорилтын ${pct}%`) : over ? `Хязгаараас ${number(drunk - goal)} мл хэтэрсэн` : `Хязгаарын ${pct}%`}</p></div></div>
    ${list.length ? `<ul class="hx-list">${list.map(e => `<li class="${e.type}"><span class="hx-icon">${entryIcon(e)}</span><span class="hx-what"><b>${escape(entryName(e))}${e.type === 'drink' ? '' : ` · ${TYPES[e.type]}`}</b><small>${time(e.at)}</small></span><span class="hx-ml">${number(e.amount)} мл</span><span></span></li>`).join('')}</ul>` : '<p class="hx-empty">Энэ өдөр бүртгэл алга.</p>'}
    <div class="hx-sheet-actions single"><a class="hx-light ac-btn" href="/history.html">Түүх рүү</a><button type="button" class="hx-blue" data-close>Хаах</button></div>`);
  box.querySelector('[data-close]')!.addEventListener('click', close);
}

// A goal ring like the history page's: filled to a share, blue (orange past a doctor's limit).
function ring(frac: number, over: boolean, label: string, size = 40): string {
  const C = 2 * Math.PI * 17;
  return `<span class="hx-ring${over ? ' over' : ''}${frac >= 1 && !over ? ' full' : ''}" style="width: ${size}px; height: ${size}px"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="bg"/>${frac > 0 ? `<circle cx="20" cy="20" r="17" class="fg" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>` : ''}</svg><b>${label}</b></span>`;
}

// Bottom sheet in the Hydrify style, closed by Escape or a tap outside.
function hxSheet(labelledBy: string, html: string): { box: HTMLElement; close: () => void } {
  const box = document.createElement('div');
  box.className = 'hx-dim';
  box.innerHTML = `<div class="hx-bottom hx-cal-sheet" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">${html}</div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector<HTMLElement>('button, a')?.focus();
  return { box, close };
}

// Month of goal rings (kit 46) with the current and best streak; ‹ › walk through months and a day
// opens its breakdown.
function openCalendar(events: readonly WaterEntry[], goal: number, mode: Mode): void {
  const counts = dayCounter(events, goal, mode), totals = dayTotals(events);
  const keys = events.filter(e => e.type === 'drink').map(e => dayKey(new Date(e.at))).sort();
  let best = 0;
  if (keys.length) {
    let run = 0;
    for (const d = noon(new Date(`${keys[0]}T12:00`)), end = noon(new Date()); d <= end; d.setDate(d.getDate() + 1)) {
      run = counts(dayKey(d)) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  const today = dayKey();
  let month = noon(new Date()); month.setDate(1);
  const { box, close } = hxSheet('cal-title', '');
  const panel = box.querySelector<HTMLElement>('.hx-bottom')!;

  function draw(): void {
    const y = month.getFullYear(), m = month.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
    const len = new Date(y, m + 1, 0).getDate();
    let met = 0;
    const cells = Array.from({ length: first }, () => '<li></li>');
    for (let d = 1; d <= len; d++) {
      const k = dayKey(new Date(y, m, d, 12)), ml = totals.get(k) ?? 0;
      const ok = k <= today && counts(k), over = mode === 'limit' && ml > goal;
      if (ok) met++;
      const frac = ok && mode === 'goal' ? 1 : Math.min(1, ml / goal);
      cells.push(`<li class="${k === today ? 'today' : ''}${ok ? ' met' : ''}"><button type="button" ${k > today ? 'disabled' : `data-day="${k}"`} aria-label="${m + 1}-р сарын ${d}: ${number(ml)} мл${ok ? ', биелсэн' : ''}">${ring(frac, over, String(d))}</button></li>`);
    }
    const isNow = y === new Date().getFullYear() && m === new Date().getMonth();
    panel.innerHTML = `<h2 id="cal-title">Streak</h2>
      <div class="hx-cal-stats">
        <div><b>${mdIcon('local_fire_department')} ${currentStreak(counts)}</b><small>Одоогийн</small></div>
        <div><b>${mdIcon('emoji_events')} ${best}</b><small>Хамгийн урт</small></div>
        <div><b>${mdIcon('check_circle')} ${met}</b><small>Энэ сард</small></div>
      </div>
      <div class="hx-cal-month"><button type="button" data-m="-1" aria-label="Өмнөх сар">‹</button><b>${y} оны ${m + 1}-р сар</b><button type="button" data-m="1" aria-label="Дараах сар" ${isNow ? 'disabled' : ''}>›</button></div>
      <div class="hx-cal-week" aria-hidden="true">${['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(w => `<small>${w}</small>`).join('')}</div>
      <ol class="hx-cal-days">${cells.join('')}</ol>
      <p class="hx-cal-legend"><span><i class="full"></i>Биелсэн</span><span><i class="part"></i>Дутуу</span>${mode === 'limit' ? '<span><i class="over"></i>Хэтэрсэн</span>' : ''}<span><i></i>Бүртгэлгүй</span></p>
      <p class="ac-small center">${mode === 'goal' ? `Өдрийн зорилт ${number(goal)} мл` : `Эмчийн хязгаар ${number(goal)} мл`}</p>
      <div class="hx-sheet-actions single"><button type="button" class="hx-blue" data-close>Хаах</button></div>`;
    panel.querySelector('[data-close]')!.addEventListener('click', close);
    panel.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.addEventListener('click', () => {
      month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.m), 1, 12); draw();
    }));
    panel.querySelectorAll<HTMLButtonElement>('[data-day]').forEach(b => b.addEventListener('click', () => openDay(events, goal, mode, b.dataset.day!)));
  }
  draw();
  panel.querySelector<HTMLButtonElement>('[data-close]')!.focus();
}

// Under the bottle: how today is going against the clock, how long since the last drink, and one
// big button for a cup. Only a goal day running in waking hours gets the tinted "since" line and
// the button; under a doctor's limit it never urges more water.
const NOW_CUP = 250;
export function thirstSection(events: readonly WaterEntry[], drink: number, p: Pace, now = new Date()): string {
  const urge = p.kind === 'behind' || p.kind === 'ahead';
  const last = lastDrink(events, now);
  const tone = urge && last ? sinceTone(minutesSince(last, now)) : 'ok';
  return `<div class="thirst ${p.kind}">
    <p class="thirst-pace">${paceText(p, drink)}</p>
    <p class="thirst-since ${tone}" id="thirst-since" data-last="${last?.toISOString() ?? ''}" data-urge="${urge}">${mdIcon('schedule')}<span>${sinceText(last, now)}</span></p>
    ${urge ? `<button type="button" class="thirst-cta" data-drink="${NOW_CUP}">${mdIcon('water_drop')}Одоо 1 аяга уух · ${NOW_CUP} мл</button>` : ''}
  </div>`;
}

// Keeps "Сүүлд … өмнө уусан" current while the page stays open; each render replaces the timer.
let sinceTimer: ReturnType<typeof setInterval> | undefined;
function tickSince(): void {
  const line = document.querySelector<HTMLElement>('#thirst-since');
  if (!line) return;
  const last = line.dataset.last ? new Date(line.dataset.last) : null, now = new Date();
  line.querySelector('span')!.textContent = sinceText(last, now);
  if (line.dataset.urge === 'true' && last) line.className = `thirst-since ${sinceTone(minutesSince(last, now))}`;
}

// The Hydrify home's «Өөр» button and the same swipe panel as under the cup row.
export function pourButton(): string {
  return `<button type="button" class="hx-cup hx-pour${pourOpen ? ' on' : ''}" id="pour-toggle" aria-expanded="${pourOpen}" aria-controls="pour-panel" aria-label="Өөр хэмжээ шударч оруулах"><span aria-hidden="true">↕</span></button>`;
}
export function pourPanel(): string {
  return `<div class="pour-panel" id="pour-panel" role="dialog" aria-label="Өөр хэмжээ нэмэх" ${pourOpen ? '' : 'hidden'}>
      <button type="button" class="pour-close" id="pour-close" aria-label="Хаах">${icon('close')}</button><div class="big-add" id="big-add" data-drink="${cup}" role="slider" tabindex="0" aria-valuemin="${POUR_MIN}" aria-valuemax="${POUR_MAX}" aria-valuenow="${cup}" aria-valuetext="${number(cup)} мл" aria-label="Нэмэх хэмжээ. Дээш доош шударч өөрчилнө, тавихад нэмэгдэнэ (Enter)">
      <span class="pour-arrow up" aria-hidden="true">▲</span>
      <span class="swipe-amount">+<b id="big-add-ml">${number(cup)}</b> мл</span>
      <span class="pour-arrow down" aria-hidden="true">▼</span>
      <span class="swipe-text">Дээш доош шудар · тавихад нэмэгдэнэ</span></div></div>`;
}

export function drinkTiles(): string {
  return `<div class="adder">
    <div class="cups" id="cups" role="group" aria-label="Ус нэмэх (хажуу тийш гүйлгэнэ)">${CUPS.map(c =>
      `<button type="button" class="cup" data-drink="${c.ml}" aria-label="${c.ml} мл нэмэх">
        <svg viewBox="0 0 24 24" aria-hidden="true">${c.icon}</svg><span>${c.ml}</span></button>`).join('')}
      <button type="button" class="cup custom${pourOpen ? ' on' : ''}" id="pour-toggle" aria-expanded="${pourOpen}" aria-controls="pour-panel" aria-label="Өөр хэмжээ шударч оруулах">
        <span class="custom-icon" aria-hidden="true">↕</span><span>Өөр</span></button></div>
    <div class="pour-panel" id="pour-panel" role="dialog" aria-label="Өөр хэмжээ нэмэх" ${pourOpen ? '' : 'hidden'}>
      <button type="button" class="pour-close" id="pour-close" aria-label="Хаах">${icon('close')}</button><div class="big-add" id="big-add" data-drink="${cup}" role="slider" tabindex="0" aria-valuemin="${POUR_MIN}" aria-valuemax="${POUR_MAX}" aria-valuenow="${cup}" aria-valuetext="${number(cup)} мл" aria-label="Нэмэх хэмжээ. Дээш доош шударч өөрчилнө, тавихад нэмэгдэнэ (Enter)">
      <span class="pour-arrow up" aria-hidden="true">▲</span>
      <span class="swipe-amount">+<b id="big-add-ml">${number(cup)}</b> мл</span>
      <span class="pour-arrow down" aria-hidden="true">▼</span>
      <span class="swipe-text">Дээш доош шудар · тавихад нэмэгдэнэ</span></div></div>
  </div>`;
}

// Swipe the cup row; whichever cup sits in the middle becomes the big button's amount.
// Raise the water to its new level and count today's total up (or down after an undo),
// then wire the add buttons. `add` saves the entry and re-renders the page.
export function bindHydration(drink: number, add: (ml: number) => unknown, redraw: () => void): void {
  document.querySelector('#avatar-btn')?.addEventListener('click', () => openAvatarPicker(redraw));
  const buddy = document.querySelector<HTMLElement>('.buddy');
  if (buddy) {
    const frac = Number(buddy.dataset.frac);
    const water = buddy.querySelector<SVGGElement>('.buddy-water')!;
    const grew = frac > shownFrac + 0.001;
    if (shownDrink !== null && shownFrac < 1) {
      if (buddy.classList.contains('done')) celebrate(drink);
      if (buddy.classList.contains('over')) warnLimit(drink, Number(buddy.dataset.goal));
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      water.style.transform = `translateY(${levelY(frac)}px)`;
      if (grew) buddy.classList.add('pulse');
    }));
    shownFrac = frac;
  }
  if (shownDrink !== null) countUp(document.querySelector('#today-drink'), shownDrink, drink);
  shownDrink = drink;

  clearInterval(sinceTimer);
  sinceTimer = setInterval(tickSince, 30_000);

  bindCups();
  bindPourHandle(buddy, drink);
  document.querySelectorAll<HTMLElement>('[data-drink]').forEach(button => {
    button.addEventListener('click', async event => {
      // A pointer tap on the amount (detail > 0) is not a swipe: nudge the arrows instead.
      if (button.id === 'big-add' && event.detail > 0 && !swiped) {
        button.classList.remove('nudge'); void button.offsetWidth; button.classList.add('nudge');
        return;
      }
      swiped = false;
      // The panel closes once its amount is added, so the undo line under the cups is not hidden.
      if (button.id === 'big-add') pourOpen = false;
      const ml = Number(button.dataset.drink);
      if (reducedMotion()) { add(ml); return; }
      button.classList.remove('tapped');
      void button.offsetWidth;
      button.classList.add('tapped');
      await flyDrop(button, ml);
      add(ml);
    });
  });
}

function bindCups(): void {
  const toggle = document.querySelector<HTMLButtonElement>('#pour-toggle');
  const panel = document.querySelector<HTMLElement>('#pour-panel');
  if (!toggle || !panel) return;
  const setOpen = (open: boolean) => {
    pourOpen = open;
    panel.hidden = !open;
    toggle.classList.toggle('on', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector<HTMLElement>('#big-add')?.focus({ preventScroll: true });
    else toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => setOpen(!pourOpen));
  panel.querySelector('#pour-close')!.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  // Keep the «Өөр» item in view when it is open. Only as far as needed sideways: «center» also slid the app's
  // tab strip (tabs.ts) and left the page half off the screen.
  if (pourOpen) toggle.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Adding is a swipe on the big amount (no button): press and drag up to pour more, down to pour less
// (10 ml every few pixels, starting from the last amount poured). The handle shows the amount and the
// character's water rises with it as a preview; letting go adds it on top of today's total.
// A tap without dragging only nudges the arrows. Letting go is undone two ways before it
// counts: slide the finger sideways off the amount (it turns into "Цуцлах"), or bring it back
// to where it started. After adding, the undo line still offers «Буцаах». Keyboard: arrows
// change it, Enter adds.
let swiped = false;
function bindPourHandle(buddy: HTMLElement | null, drink: number): void {
  const add = document.querySelector<HTMLElement>('#big-add');
  if (!add) return;
  const label = add.querySelector('#big-add-ml')!, text = add.querySelector('.swipe-text')!;
  const water = buddy?.querySelector<SVGGElement>('.buddy-water');
  const gauge = document.querySelector<HTMLElement>('.hx-gauge');
  const goal = Number(buddy?.dataset.goal ?? gauge?.dataset.goal) || 1;
  const show = (ml: number) => {
    add.dataset.drink = String(ml);
    label.textContent = number(ml);
    add.setAttribute('aria-valuenow', String(ml)); add.setAttribute('aria-valuetext', `${number(ml)} мл`);
  };
  const preview = (ml: number | null) => {
    // Hydrify gauge: the water in the drop and the arc rise with the amount (same numbers as hxGauge).
    if (!water && gauge) {
      const f = Math.min(1, (drink + (ml ?? 0)) / goal);
      gauge.querySelector<SVGGElement>('.hx-water')!.style.transform = `translateY(${(196 - f * 92).toFixed(1)}px)`;
      const arc = gauge.querySelector('.hx-progress')!;
      arc.setAttribute('stroke-dasharray', `${(f * 100).toFixed(1)} 100`);
      arc.classList.toggle('empty', f <= 0);
      gauge.classList.toggle('pouring', ml !== null);
      return;
    }
    if (!water) return;
    water.style.transform = `translateY(${levelY(Math.min(1, (drink + (ml ?? 0)) / goal))}px)`;
    buddy!.classList.toggle('pouring', ml !== null);
  };
  const IDLE = 'Дээш доош шудар · тавихад нэмэгдэнэ';
  let startX = 0, startY: number | null = null, base = 0, moved = false, cancel = false, home = true;
  add.addEventListener('pointerdown', e => {
    startX = e.clientX; startY = e.clientY; base = Number(add.dataset.drink); moved = false; cancel = false;
    add.setPointerCapture(e.pointerId);
  });
  add.addEventListener('pointermove', e => {
    if (startY === null) return;
    const dy = startY - e.clientY, dx = Math.abs(e.clientX - startX);
    if (!moved && Math.abs(dy) < POUR_STEP_PX && dx < POUR_STEP_PX) return;
    moved = true;
    cancel = dx > POUR_CANCEL_PX;
    home = Math.abs(dy) < POUR_STEP_PX;
    const ml = Math.max(POUR_MIN, Math.min(POUR_MAX, base + Math.round(dy / POUR_STEP_PX) * 10));
    show(ml); preview(cancel ? null : ml);
    add.classList.toggle('cancel', cancel);
    add.classList.toggle('ready', !cancel && !home);
    add.classList.toggle('up', !cancel && dy > 0); add.classList.toggle('down', !cancel && dy < 0);
    text.innerHTML = cancel ? `${mdIcon('close')} Цуцлах · тавибал нэмэгдэхгүй` : home ? 'Эхэндээ буцсан · нэмэгдэхгүй' : 'Тавьвал нэмэгдэнэ · хажуу тийш = цуцлах';
  });
  const finish = (commit: boolean) => {
    if (startY === null) return;
    startY = null;
    add.classList.remove('ready', 'up', 'down', 'cancel'); text.textContent = IDLE;
    if (commit && moved && !cancel && !home) { remember(Number(add.dataset.drink)); swiped = true; add.click(); return; }
    show(base); preview(null);
  };
  add.addEventListener('pointerup', () => finish(true));
  add.addEventListener('pointercancel', () => finish(false));
  add.addEventListener('keydown', e => {
    const by = { ArrowUp: 10, ArrowDown: -10, PageUp: 100, PageDown: -100 }[e.key];
    if (by) { e.preventDefault(); show(Math.max(POUR_MIN, Math.min(POUR_MAX, Number(add.dataset.drink) + by))); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remember(Number(add.dataset.drink)); swiped = true; add.click(); }
  });
}

function center(element: Element): { x: number; y: number } {
  const r = element.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// A drop arcs from the add button into the bottle; "+250 мл" rises from it as it lands.
// Both live on <body> so they survive the re-render that follows the save.
async function flyDrop(from: Element, ml: number): Promise<void> {
  const buddy = document.querySelector('.buddy svg') ?? document.querySelector('.hx-gauge svg');
  if (!buddy) return;
  await dropInto(center(from), center(buddy), ml);
}

// The base counted a sip on its own: a drop falls into the bottle from above with "+120 мл",
// and a small "Суурь: 120 мл ус уулаа" chip says where it came from (the page has already re-rendered).
export async function deviceDrop(ml: number): Promise<void> {
  const buddy = document.querySelector('.buddy svg') ?? document.querySelector('.hx-gauge svg');
  if (!buddy) return;
  const chip = document.createElement('span');
  chip.className = 'fx-device';
  chip.setAttribute('role', 'status');
  chip.textContent = `Суурь: ${number(ml)} мл ус уулаа`;
  document.body.append(chip);
  chip.addEventListener('animationend', () => chip.remove());
  if (reducedMotion()) return;
  const end = center(buddy);
  await dropInto({ x: end.x, y: end.y - 150 }, end, ml);
}

async function dropInto(start: { x: number; y: number }, end: { x: number; y: number }, ml: number): Promise<void> {
  if (end.y < 0 || end.y > innerHeight) return;
  const drop = document.createElement('span');
  drop.className = 'fx-drop';
  drop.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/></svg>';
  document.body.append(drop);
  const dx = end.x - start.x, dy = end.y - start.y;
  const lift = Math.min(80, Math.abs(dx) * 0.5 + 30);
  const at = (t: number, s: number) => `translate(${start.x + dx * t}px, ${start.y + dy * t - lift * 4 * t * (1 - t)}px) scale(${s})`;
  await drop.animate([
    { transform: at(0, 0.4), opacity: 0 },
    { transform: at(0.15, 1.15), opacity: 1, offset: 0.15 },
    { transform: at(1, 0.6), opacity: 0.9 },
  ], { duration: 520, easing: 'cubic-bezier(.45, 0, .55, 1)' }).finished.catch(() => {});
  drop.remove();
  const label = Object.assign(document.createElement('span'), { className: 'fx-float', textContent: `+${number(ml)} мл` });
  label.style.left = `${end.x}px`;
  label.style.top = `${end.y - 54}px`;
  document.body.append(label);
  label.addEventListener('animationend', () => label.remove());
}

// Doctor's limit crossed: no confetti, a calm warning card instead (tap to close).
function warnLimit(drink: number, limit: number): void {
  document.querySelector('.fx-cheer')?.remove();
  const card = document.createElement('div');
  card.className = 'fx-cheer warn';
  card.setAttribute('role', 'alert');
  card.innerHTML = `<div class="fx-cheer-card"><span class="fx-cheer-big">${mdIcon('warning', 'md-warn')}</span><b>Эмчийн хязгаараас хэтэрлээ</b><span>${number(drink)} / ${number(limit)} мл · Өнөөдөр дахиж уухаас зайлсхий</span></div>`;
  document.body.append(card);
  const close = () => card.remove();
  card.addEventListener('click', close);
  setTimeout(close, 4500);
}

// Goal reached: confetti falls over the page and a card cheers for a few seconds (tap to close).
function celebrate(drink: number): void {
  document.querySelector('.fx-cheer')?.remove();
  const cheer = document.createElement('div');
  cheer.className = 'fx-cheer';
  cheer.setAttribute('role', 'status');
  cheer.innerHTML = `<div class="fx-cheer-card"><span class="fx-cheer-big">${mdIcon('celebration', 'md-fire')}</span><b>Зорилт биеллээ!</b><span>Өнөөдөр ${number(drink)} мл уулаа</span></div>`;
  document.body.append(cheer);
  const close = () => cheer.remove();
  cheer.addEventListener('click', close);
  setTimeout(close, 3200);
  if (reducedMotion()) return;
  const colors = ['#00bedc', '#6fdcef', '#ff9ec4', '#f6c344', '#3f9a4f', '#e0613a'];
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement('i');
    bit.className = 'fx-confetti';
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[i % colors.length];
    cheer.append(bit);
    const drift = (Math.random() - .5) * 160, spin = (Math.random() - .5) * 900;
    bit.animate([
      { transform: 'translate(0, -20px) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, 105vh) rotate(${spin}deg)`, opacity: .9 },
    ], { duration: 1800 + Math.random() * 1200, delay: Math.random() * 400, easing: 'cubic-bezier(.25, .6, .4, 1)', fill: 'forwards' });
  }
}

function countUp(element: HTMLElement | null, from: number, to: number): void {
  if (!element || from === to || reducedMotion()) return;
  const start = performance.now(), duration = 700;
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    element.textContent = number(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(frame);
  };
  element.textContent = number(from);
  requestAnimationFrame(frame);
}
