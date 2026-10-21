import './hydration.css';
import { number } from './format';
import { dayKey, type WaterEntry } from './data';
import { AVATARS, avatarSvg, openAvatarPicker, readAvatar } from './avatars';

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
// Cups add on a tap. The last item, «Өөр», opens the amount you swipe up or down instead.
let pourOpen = false;
// The amount to add, remembered between renders and across visits: the last amount poured.
const LAST_KEY = 'dusal-last-pour-v1';
let cup = (() => { try { const v = Number(localStorage.getItem(LAST_KEY)); return v >= 10 && v <= 3000 ? v : 250; } catch { return 250; } })();
const remember = (ml: number) => { cup = ml; try { localStorage.setItem(LAST_KEY, String(ml)); } catch { /* default next time */ } };
const POUR_MIN = 10, POUR_MAX = 3000, POUR_STEP_PX = 6, POUR_CANCEL_PX = 70;

export function buddySection(drink: number, goal: number, mode: 'goal' | 'limit'): string {
  const frac = Math.min(1, drink / goal);
  // Under a doctor's limit the bottle never cheers for more: it warns as the limit gets close.
  const over = mode === 'limit' && drink > goal;
  const near = mode === 'limit' && !over && drink >= goal * 0.8;
  const done = mode === 'goal' && drink >= goal;
  const diff = goal - drink;
  const sub = over ? `Эмчийн хязгаараас ${number(-diff)} мл хэтэрсэн` : near ? `Хязгаарт ойртож байна · ${number(diff)} мл үлдсэн` : done ? 'Зорилт биеллээ 🎉' : mode === 'limit' ? `Хязгаар хүртэл ${number(diff)} мл` : `Дахиад ${number(diff)} мл`;
  const face = done ? 'beam' : over || near ? 'worried' : mode === 'goal' && frac < 0.25 ? 'sad' : 'happy';
  return `<div class="buddy${over ? ' over' : ''}${near ? ' near' : ''}${done ? ' done' : ''}" data-frac="${frac}" data-goal="${goal}" role="img" aria-label="Өнөөдөр ${number(drink)} / ${number(goal)} мл, ${Math.round((drink / goal) * 100)}%">
    <p class="buddy-pct">${Math.round((drink / goal) * 100)}<span>%</span></p>
    <div class="buddy-stage">${avatarSvg(readAvatar(), face, levelY(shownFrac), done)}
      <button type="button" class="avatar-btn" id="avatar-btn" aria-label="Дүр солих">✨</button></div>
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

function dayCounter(events: readonly WaterEntry[], goal: number, mode: Mode): (key: string) => boolean {
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

export function streakParts(events: readonly WaterEntry[], goal: number, mode: Mode): { chip: string; week: string } {
  const counts = dayCounter(events, goal, mode), mood = dayMood(events, goal, mode);
  const streak = currentStreak(counts);
  const chip = `<button type="button" class="streak${streak ? ' hot' : ''}" data-calendar aria-label="${streak} өдөр дараалан, календарь нээх"><span aria-hidden="true">🔥</span>${streak}</button>`;
  const week = `<div class="week-wrap"><ol class="week-strip" aria-label="Сүүлийн 7 хоног">${[6, 5, 4, 3, 2, 1, 0].map(back => {
    const d = daysBack(back), m = mood(dayKey(d));
    return `<li class="m-${m ?? 'none'}${back === 0 ? ' today' : ' past'}"><span class="wd">${WEEKDAYS[d.getDay()]}</span><span class="mark">${m ? dropFace(m) : ''}</span></li>`;
  }).join('')}</ol><button type="button" class="text-button cal-open" data-calendar>Сарын календарь →</button></div>`;
  return { chip, week };
}

// A month calendar of goal days with the current and best streak; ‹ › walk through months.
export function bindStreakCalendar(events: readonly WaterEntry[], goal: number, mode: Mode): void {
  document.querySelectorAll<HTMLButtonElement>('[data-calendar]').forEach(b => b.addEventListener('click', () => openCalendar(events, goal, mode)));
}

function openCalendar(events: readonly WaterEntry[], goal: number, mode: Mode): void {
  const counts = dayCounter(events, goal, mode), mood = dayMood(events, goal, mode);
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
  const box = document.createElement('div');
  box.className = 'cal';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'cal-title');
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  function draw(): void {
    const y = month.getFullYear(), m = month.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
    const len = new Date(y, m + 1, 0).getDate();
    let met = 0;
    const cells = Array.from({ length: first }, () => '<li class="pad"></li>');
    for (let d = 1; d <= len; d++) {
      const k = dayKey(new Date(y, m, d, 12));
      if (counts(k)) met++;
      if (k > today) { cells.push(`<li class="future"><span class="n">${d}</span></li>`); continue; }
      const face = mood(k);
      cells.push(`<li class="m-${face ?? 'none'}${k === today ? ' today' : ' past'}"><span class="n">${d}</span><span class="f">${face ? dropFace(face) : ''}</span></li>`);
    }
    box.innerHTML = `<div class="cal-card">
      <div class="cal-top"><h2 id="cal-title">Streak</h2><button type="button" class="cal-close" aria-label="Хаах">✕</button></div>
      <div class="cal-stats">
        <div><b>🔥 ${currentStreak(counts)}</b><span>Одоогийн</span></div>
        <div><b>🏆 ${best}</b><span>Хамгийн урт</span></div>
        <div><b>✅ ${met}</b><span>Энэ сард</span></div>
      </div>
      <div class="cal-nav"><button type="button" data-m="-1" aria-label="Өмнөх сар">‹</button><b>${y} оны ${m + 1}-р сар</b><button type="button" data-m="1" aria-label="Дараах сар">›</button></div>
      <ol class="cal-grid" aria-label="${y} оны ${m + 1}-р сар">${['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(w => `<li class="wd">${w}</li>`).join('')}${cells.join('')}</ol>
      <p class="cal-legend">${LEGEND[mode]}</p>
      <p class="cal-note">${mode === 'goal' ? `Өдрийн зорилт ${number(goal)} мл` : `Эмчийн хязгаар ${number(goal)} мл`}</p>
    </div>`;
    box.querySelector('.cal-close')!.addEventListener('click', close);
    box.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.addEventListener('click', () => {
      month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.m), 1, 12); draw();
    }));
    box.querySelector<HTMLButtonElement>('.cal-close')!.focus();
  }
  box.addEventListener('click', e => { if (e.target === box) close(); });
  draw();
}

export function drinkTiles(): string {
  return `<div class="adder">
    <div class="cups" id="cups" role="group" aria-label="Ус нэмэх (хажуу тийш гүйлгэнэ)">${CUPS.map(c =>
      `<button type="button" class="cup" data-drink="${c.ml}" aria-label="${c.ml} мл нэмэх">
        <svg viewBox="0 0 24 24" aria-hidden="true">${c.icon}</svg><span>${c.ml}</span></button>`).join('')}
      <button type="button" class="cup custom${pourOpen ? ' on' : ''}" id="pour-toggle" aria-expanded="${pourOpen}" aria-controls="pour-panel" aria-label="Өөр хэмжээ шударч оруулах">
        <span class="custom-icon" aria-hidden="true">↕</span><span>Өөр</span></button></div>
    <div class="pour-panel" id="pour-panel" ${pourOpen ? '' : 'hidden'}><div class="big-add" id="big-add" data-drink="${cup}" role="slider" tabindex="0" aria-valuemin="${POUR_MIN}" aria-valuemax="${POUR_MAX}" aria-valuenow="${cup}" aria-valuetext="${number(cup)} мл" aria-label="Нэмэх хэмжээ. Дээш доош шударч өөрчилнө, тавихад нэмэгдэнэ (Enter)">
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
  toggle.addEventListener('click', () => {
    pourOpen = !pourOpen;
    panel.hidden = !pourOpen;
    toggle.classList.toggle('on', pourOpen);
    toggle.setAttribute('aria-expanded', String(pourOpen));
    if (pourOpen) panel.querySelector<HTMLElement>('#big-add')?.focus({ preventScroll: true });
  });
  // Keep the «Өөр» item in view when it is open.
  if (pourOpen) toggle.scrollIntoView({ block: 'nearest', inline: 'center' });
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
  const goal = Number(buddy?.dataset.goal) || 1;
  const show = (ml: number) => {
    add.dataset.drink = String(ml);
    label.textContent = number(ml);
    add.setAttribute('aria-valuenow', String(ml)); add.setAttribute('aria-valuetext', `${number(ml)} мл`);
  };
  const preview = (ml: number | null) => {
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
    text.textContent = cancel ? '✕ Цуцлах · тавибал нэмэгдэхгүй' : home ? 'Эхэндээ буцсан · нэмэгдэхгүй' : 'Тавьвал нэмэгдэнэ · хажуу тийш = цуцлах';
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
  const buddy = document.querySelector('.buddy svg');
  if (!buddy) return;
  const start = center(from), end = center(buddy);
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
  card.innerHTML = `<div class="fx-cheer-card"><span class="fx-cheer-big">⚠️</span><b>Эмчийн хязгаараас хэтэрлээ</b><span>${number(drink)} / ${number(limit)} мл · Өнөөдөр дахиж уухаас зайлсхий</span></div>`;
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
  cheer.innerHTML = `<div class="fx-cheer-card"><span class="fx-cheer-big">🎉</span><b>Зорилт биеллээ!</b><span>Өнөөдөр ${number(drink)} мл уулаа</span></div>`;
  document.body.append(cheer);
  const close = () => cheer.remove();
  cheer.addEventListener('click', close);
  setTimeout(close, 3200);
  if (reducedMotion()) return;
  const colors = ['#2f80ed', '#7fb2f5', '#ff9ec4', '#f6c344', '#3f9a4f', '#e0613a'];
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
