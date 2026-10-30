import { escape, number } from './format';
import { KINDS, SALTABLE, type Kind } from './drinks';
import { arcAt, arcPoint, gaugeArt, gaugeStart, iconFor, moreButton } from './hydrify';
import { openDrinkSheet } from './drink-sheet';
import { logThirst, type Dialysis } from './progress-data';
import './home-limit.css';

// The home under a doctor's fluid limit (state.mode === 'limit'), for people on dialysis. The gauge only
// shows what is left: nothing is logged by dragging it while scrolling. Adding goes through «Уух»
// (the drink sheet) or the dial sheet, and any add that would pass the limit first shows by how much,
// with the amount that still fits. A real entry is never refused. «Цангаж байна» (in the «⋯» menu)
// offers ways to ease thirst without drinking. The goal (the limit) is never changed here.

// «≈ 1½ аяга»: ml in the user's main cup, always rounded down to a half (the dial: a quarter), so
// it never promises more than is left.
const PARTS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
export function cupsText(ml: number, cupMl: number, step = 0.5): string {
  const cups = Math.floor(Math.max(0, ml) / cupMl / step + 1e-9) * step;
  if (cups <= 0) return ml > 0 ? `${PARTS[String(step)]} аяганаас бага` : '0 аяга';
  const whole = Math.floor(cups);
  return `≈ ${whole || ''}${PARTS[String(cups - whole)] ?? ''} аяга`;
}

export const kindName = (kind: Kind | undefined, salty = false) =>
  (kind ? `${KINDS[kind].name}${SALTABLE.includes(kind) ? (salty ? ' · давстай' : ' · давсгүй') : ''}` : 'Ус');

// What every sheet needs from the home: today's total, the goal or limit, the main cup and how to
// add. Only under a limit (`limit`) does an add that would pass it stop at the popup first.
// `addOnce`, where set, adds without making it the next cup (the quick tiles use it).
type Add = (ml: number, kind: Kind | undefined, salty: boolean) => void;
export interface AddCtx { drink: number; goal: number; limit: boolean; cup: number; add: Add; addOnce?: Add }

// The gauge as a display: the arc fills to today's share of the limit and stays full past it, and the
// drop in the middle is the home gauge's, its waves floating the same way (hydrify.ts gaugeArt).
// The dial sheet below draws its own arc and ticks.
const TICKS = Array.from({ length: 9 }, (_, i) => (i + 1) / 10)
  .map(f => { const [a, b] = [arcPoint(f, 94), arcPoint(f, 102)]; return `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}"/>`; }).join('');
const ARC = (() => { const [s, e] = [arcPoint(0, 122), arcPoint(1, 122)]; return `M${s[0].toFixed(1)} ${s[1].toFixed(1)} A122 122 0 1 1 ${e[0].toFixed(1)} ${e[1].toFixed(1)}`; })();
// From this share of the doctor's limit the home warns that it is close (pace.ts says the same).
const WARN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20Z" fill="#f59e0b"/><path d="M12 10v5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="#fff"/></svg>';
export const NEAR_SHARE = 0.8;
export const nearLimit = (drink: number, goal: number) => drink >= goal * NEAR_SHARE && drink <= goal;
// This add is the one that brought the day close to the limit: said once, as it happens.
export const crossedNear = (before: number, after: number, goal: number) => before < goal * NEAR_SHARE && nearLimit(after, goal);

export function limitGauge(drink: number, goal: number, cup: number): string {
  const left = goal - drink;
  const frac = Math.min(1, drink / goal);
  // Close to the limit the arc turns amber and a line under it says how much is left; past it, red.
  const tone = left < 0 ? ' over' : nearLimit(drink, goal) ? ' near' : '';
  // Drawn where it last stood and eased on, «Үлдсэн» counting down with it (hydrify.ts gaugeStart).
  const start = gaugeStart('hl-drop-clip', frac, Math.max(0, left), v => `${number(v)} мл`);
  const center = left < 0
    ? `<p class="hl-over">Хязгаараас <b>${number(-left)} мл</b> илүү</p><p class="hl-calm">Маргааш дахиад хамт оролдъё</p>`
    : `<small>Үлдсэн</small><b class="hl-left" data-gauge-count>${number(start.value)} мл</b><span class="hl-cups">${cupsText(left, cup)}</span>`;
  return `<section class="hx-card hl-gauge-card${tone}" aria-label="Өнөөдөр ${number(drink)} / ${number(goal)} мл, ${left < 0 ? `хязгаараас ${number(-left)} мл илүү` : `үлдсэн ${number(left)} мл${tone ? ', хязгаарт ойртож байна' : ''}`}">
      <div class="hl-gauge" data-gauge-key="hl-drop-clip" aria-hidden="true">
        <svg viewBox="0 0 300 270">${gaugeArt(start.frac, 'hl-drop-clip')}</svg>
        <div class="hl-center">${center}</div>
      </div>
      ${tone === ' near' ? `<p class="hl-near" role="status">${WARN_ICON}<span><b>Хязгаарт ойртож байна</b> · ${number(left)} мл үлдсэн. Бага багаар уугаарай.</span></p>` : ''}
      <p class="hl-sum">${number(drink)} / ${number(goal)} мл уусан · эмчийн хязгаар</p>
      <div class="hx-actions hl-actions"><button type="button" class="hx-drink" data-limit-drink>Уух (${number(cup)} мл)</button>
        <button type="button" class="hx-cup" data-drink-sheet aria-haspopup="dialog" aria-label="Өөр зүйл, өөр хэмжээ сонгох">${iconFor(cup)}<span class="hx-swap" aria-hidden="true">⟳</span></button>${moreButton()}</div>
    </section>`;
}

const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
export const TILE_ICONS = {
  water: svg('<path d="M9 5h14l-1.6 23H10.6z" fill="#eef6fe"/><path d="M9.8 13h12.4l-1 15H10.8z" fill="#569df8"/>'),
  pill: svg('<rect x="9" y="8" width="14" height="18" rx="4" fill="#eef6fe" stroke="#569df8" stroke-width="1.6"/><rect x="11" y="4" width="10" height="5" rx="1.5" fill="#569df8"/><path d="M13 17h6" stroke="#569df8" stroke-width="2" stroke-linecap="round"/>'),
};

// Ус · Сүүтэй цай (a main cup each) and a 50 мл sip to take pills with, on top of the drink sheet.
// Not data-drink: hydration.ts adds every [data-drink] button straight away, past the limit check.
export type Quick = 'water' | 'medMix' | 'pill';
// A sachet or powder is usually stirred into about this much water.
export const MED_MIX_ML = 100;
export function quickTiles(cup: number): string {
  const tile = (id: Quick, icon: string, name: string, sub: string, label: string) =>
    `<button type="button" class="hl-tile" data-quick="${id}" aria-label="${escape(label)}">${icon}<span>${name}</span><small>${sub}</small></button>`;
  return `<div class="hl-quick" role="group" aria-label="Хурдан нэмэх">
      ${tile('water', TILE_ICONS.water, 'Ус', '1 аяга', `Ус, 1 аяга (${number(cup)} мл) нэмэх`)}
      ${tile('pill', TILE_ICONS.pill, 'Эм уухад', '50 мл', 'Эм уухад 50 мл ус нэмэх')}
      ${tile('medMix', KINDS.medMix.icon, 'Найруулсан эм', `${MED_MIX_ML} мл`, `Найруулсан эм, ${MED_MIX_ML} мл нэмэх`)}
    </div>`;
}
// What a quick tile adds: a cup of water or a dissolved medicine through the limit check, the pill sip always.
export function quickDrink(ctx: AddCtx, quick: Quick, warn = overLimit): void {
  if (quick === 'water') addChecked(ctx, ctx.cup, undefined, false, warn);
  else if (quick === 'medMix') addChecked(ctx, MED_MIX_ML, 'medMix', false, warn);
  else ctx.add(50, undefined, false);  // a sip for pills is never held back
}

// The next session from the dialysis days and time, and how long until it.
export function nextDialysis(d: Dialysis, now = new Date()): Date | null {
  if (!d.days.length) return null;
  const [h, m] = d.time.split(':').map(Number);
  for (let i = 0; i <= 7; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m);
    if (d.days.includes(at.getDay() || 7) && at > now) return at;
  }
  return null;
}
export function untilText(at: Date, now = new Date()): string {
  const min = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60000));
  const days = Math.floor(min / 1440), hours = Math.floor((min % 1440) / 60);
  if (days) return hours ? `${days} өдөр ${hours} цагийн дараа` : `${days} өдрийн дараа`;
  return hours ? `${hours} цагийн дараа` : `${min} минутын дараа`;
}

// A bottom sheet with a grab handle; Escape or a tap outside closes it and focus goes back.
export function sheet(className: string, html: string, label: string): { box: HTMLElement; close: () => void } {
  const back = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'hx-dim';
  box.innerHTML = `<div class="hx-bottom hl-sheet ${className}" role="dialog" aria-modal="true" aria-label="${escape(label)}"><span class="hl-grab" aria-hidden="true"></span>${html}</div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); back?.focus({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && [...document.querySelectorAll('.hx-dim')].at(-1) === box) close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  requestAnimationFrame(() => box.querySelector<HTMLElement>('[data-focus], button')?.focus({ preventScroll: true }));
  return { box, close };
}

// Adds unless it would pass the limit; then the popup says by how much first.
// `warn` is the popup; tests pass their own.
export function addChecked(ctx: AddCtx, ml: number, kind: Kind | undefined, salty = false, warn = overLimit): void {
  if (!ctx.limit || ctx.drink + ml <= ctx.goal) ctx.add(ml, kind, salty);
  else warn(ctx, ml, kind, salty);
}

const RED_DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4.2 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 3-6.8 6-11Z" fill="#e5484d"/><path d="M12 9v4.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.2" fill="#fff"/></svg>';
function overLimit(ctx: AddCtx, ml: number, kind: Kind | undefined, salty: boolean): void {
  const total = ctx.drink + ml, over = total - ctx.goal, fits = Math.max(0, ctx.goal - ctx.drink);
  const pct = (v: number) => `${((v / total) * 100).toFixed(2)}%`;
  const { box, close } = sheet('hl-overlimit', `
      <span class="hl-over-icon">${RED_DROP}</span>
      <h2>Хязгаараас ${number(over)} мл хэтэрнэ</h2>
      <p class="hl-over-text">Өнөөдөр ${number(ctx.drink)} мл уусан. <b>${escape(kindName(kind, salty))} ${number(ml)} мл</b> нэмбэл:</p>
      <div class="hl-over-card">
        <div class="hl-over-head"><b>${number(total)} мл</b><span>хязгаар ${number(ctx.goal)}</span></div>
        <div class="hl-over-bar" role="img" aria-label="${number(ctx.drink)} мл уусан, ${number(fits)} мл багтана, ${number(over)} мл хэтэрнэ"><i class="drunk" style="width: ${pct(Math.min(ctx.drink, total))}"></i><i class="fits" style="width: ${pct(Math.min(fits, ml))}"></i><i class="over" style="width: ${pct(over)}"></i></div>
        <div class="hl-over-foot"><span>Уусан ${number(ctx.drink)}</span><b>+${number(over)} хэтэрнэ</b></div>
      </div>
      ${fits >= 10 ? `<button type="button" class="hx-blue hl-wide" data-fit data-focus>${number(fits)} мл болгож нэмэх</button>` : ''}
      <button type="button" class="hl-outline hl-wide" data-full>Бүтнээр нь нэмэх (${number(ml)} мл)</button>
      <small class="hl-note">Уусан бол заавал бүртгээрэй. Үнэн бүртгэл сувилагчийн тайланд хэрэгтэй.</small>`, 'Хязгаараас хэтэрнэ');
  box.querySelector('[data-fit]')?.addEventListener('click', () => { close(); ctx.add(fits, kind, salty); });
  box.querySelector('[data-full]')!.addEventListener('click', () => { close(); ctx.add(ml, kind, salty); });
}

// «Цангаж байна»: ways to ease thirst without drinking; each opening is logged for the report.
const THIRST_TIPS: [string, string, string][] = [
  ['<path d="M8 6h8l-1 13H9z"/><path d="M10 10h4"/>', 'Жижиг аягаар, бага багаар уу', 'Том аяга хурдан дуусдаг'],
  ['<rect x="6" y="6" width="5" height="5" rx="1"/><rect x="13" y="9" width="5" height="5" rx="1"/><rect x="8" y="14" width="5" height="5" rx="1"/>', 'Мөс амандаа хайлуул', 'Мөс ч шингэнд тооцогдоно'],
  ['<path d="M5 12c2-3 5-4 7-4s5 1 7 4c-2 3-5 4-7 4s-5-1-7-4Z"/><path d="M9 12h6"/>', 'Амаа хүйтэн усаар зайл', 'Залгилгүй асгаарай'],
  ['<rect x="5" y="9" width="14" height="6" rx="3"/>', 'Чихэргүй бохь зажил', 'Шүлс ялгаруулж ам чийглэнэ'],
  ['<path d="M7 20h10"/><path d="M8 20l1-9h6l1 9"/><path d="M10 7h4M12 4v3"/>', 'Давстай хоолоо багасга', 'Давс цангааг ихэсгэнэ'],
];
export function openThirst(ctx: AddCtx): void {
  logThirst();
  const left = Math.max(0, ctx.goal - ctx.drink);
  const { box, close } = sheet('hl-thirst-sheet', `
      <h2>Цангаж байна уу?</h2>
      <p class="hl-sub">Шингэн уухгүйгээр цангааг багасгах аргууд</p>
      <ul class="hl-tips">${THIRST_TIPS.map(([d, b, s]) => `<li><span class="hl-tip-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg></span><span><b>${b}</b><small>${s}</small></span></li>`).join('')}</ul>
      <p class="hl-left-box">Өнөөдөр танд <b>${cupsText(left, ctx.cup)} (${number(left)} мл)</b> үлдсэн байна.</p>
      <button type="button" class="hx-blue hl-wide" data-ok data-focus>Ойлголоо</button>
      <button type="button" class="hl-text hl-wide" data-small>Жижиг аяга (100 мл) нэмэх</button>`, 'Цангаж байна уу?');
  box.querySelector('[data-ok]')!.addEventListener('click', close);
  box.querySelector('[data-small]')!.addEventListener('click', () => { close(); addChecked(ctx, 100, undefined); });
}

// «Хэр их уух вэ?»: drag the arc to the amount to add, 50 мл a step (a short buzz each). Blue up to
// what is left, orange past it, with a tick at the limit. −/+ and the arrow keys step by 50.
const STEP = 50;
export function openDial(ctx: AddCtx, kind: Kind | undefined, initial = ctx.cup, salty = false): void {
  const left = Math.max(0, ctx.goal - ctx.drink);
  const max = Math.ceil(Math.max(600, left + 200) / STEP) * STEP;
  let value = Math.min(max, Math.max(0, Math.round(initial / STEP) * STEP));
  const icon = kind ? KINDS[kind].icon : TILE_ICONS.water;
  const at = (f: number, r: number) => arcPoint(f, r).map(n => n.toFixed(1)) as [string, string];
  const tickIn = at(left / max, 108), tickOut = at(left / max, 140), tickLabel = at(left / max, 156);
  const zero = at(0, 88), end = at(1, 88);
  const { box, close } = sheet('hl-dial', `
      <div class="hl-dial-head"><h2>Хэр их уух вэ?</h2><span>Үлдсэн <b>${number(left)}</b> / ${number(ctx.goal)} мл</span></div>
      <div class="hl-dial-kind">${icon}<b>${escape(kindName(kind, salty))}</b><button type="button" class="hl-link" data-change>Солих</button></div>
      <div class="hl-dial-wrap" data-no-swipe>
        <svg viewBox="0 0 300 270" aria-hidden="true">
          <path class="hx-track" d="${ARC}" pathLength="100"/>
          <path class="hl-dial-fit" d="${ARC}" pathLength="100"/>
          <path class="hl-dial-over" d="${ARC}" pathLength="100"/>
          <g class="hx-ticks">${TICKS}</g>
          <text x="${zero[0]}" y="${zero[1]}" class="hl-dial-end">0</text><text x="${end[0]}" y="${end[1]}" class="hl-dial-end">${number(max)}</text>
          <line x1="${tickIn[0]}" y1="${tickIn[1]}" x2="${tickOut[0]}" y2="${tickOut[1]}" class="hl-dial-tick"/>
          <text x="${tickLabel[0]}" y="${tickLabel[1]}" class="hl-dial-tick-label">${number(left)}</text>
        </svg>
        <span class="hl-knob" role="slider" tabindex="0" data-focus aria-label="Нэмэх хэмжээ" aria-valuemin="0" aria-valuemax="${max}"></span>
        <div class="hl-dial-center"><b data-amount></b><span data-cups></span><span class="hl-chip" data-over hidden></span></div>
      </div>
      <p class="hl-legend"><span><i class="fit"></i>Хязгаартаа багтана</span><span><i class="over"></i>Хязгаараас хэтэрнэ</span></p>
      <small class="hl-hint">Нумыг чирнэ үү · 50 мл тутамд зогсоно</small>
      <div class="hl-dial-actions"><button type="button" class="hl-round" data-step="-1" aria-label="50 мл хасах">−</button><button type="button" class="hx-blue" data-add></button><button type="button" class="hl-round" data-step="1" aria-label="50 мл нэмэх">+</button></div>`, 'Хэр их уух вэ?');
  const fit = box.querySelector('.hl-dial-fit')!, over = box.querySelector('.hl-dial-over')!;
  const knob = box.querySelector<HTMLElement>('.hl-knob')!, addButton = box.querySelector<HTMLButtonElement>('[data-add]')!;
  const chip = box.querySelector<HTMLElement>('[data-over]')!;
  const show = () => {
    const f = value / max, l = Math.min(value, left) / max;
    fit.setAttribute('stroke-dasharray', `${(l * 100).toFixed(2)} 200`);
    over.setAttribute('stroke-dasharray', `${(Math.max(0, f - l) * 100).toFixed(2)} 200`);
    over.setAttribute('stroke-dashoffset', `${(-l * 100).toFixed(2)}`);
    const [x, y] = arcPoint(f, 122);
    knob.style.left = `${(x / 300) * 100}%`; knob.style.top = `${(y / 270) * 100}%`;
    knob.classList.toggle('over', value > left);
    knob.setAttribute('aria-valuenow', String(value));
    knob.setAttribute('aria-valuetext', `${number(value)} мл${value > left ? `, ${number(value - left)} мл хэтэрнэ` : ''}`);
    box.querySelector('[data-amount]')!.textContent = `+${number(value)} мл`;
    box.querySelector('[data-cups]')!.textContent = cupsText(value, ctx.cup, 0.25);
    chip.hidden = value <= left;
    chip.textContent = `⚠ ${number(value - left)} мл хэтэрнэ`;
    addButton.textContent = `Нэмэх · ${number(value)} мл`;
    addButton.disabled = value <= 0;
  };
  const set = (next: number) => {
    next = Math.min(max, Math.max(0, next));
    if (next !== value) navigator.vibrate?.(8);
    value = next;
    show();
  };
  const wrap = box.querySelector<HTMLElement>('.hl-dial-wrap')!, dial = wrap.querySelector<SVGSVGElement>('svg')!;
  let dragging = false;
  const follow = (e: PointerEvent) => { const p = arcAt(dial, e.clientX, e.clientY); if (p) set(Math.round((p.frac * max) / STEP) * STEP); };
  wrap.addEventListener('pointerdown', e => {
    const p = arcAt(dial, e.clientX, e.clientY);
    if (e.target !== knob && !(p && p.r > 92 && p.r < 152)) return;
    e.preventDefault();
    dragging = true;
    wrap.setPointerCapture(e.pointerId);
    follow(e);
  });
  wrap.addEventListener('pointermove', e => { if (dragging) follow(e); });
  wrap.addEventListener('pointerup', () => { dragging = false; });
  wrap.addEventListener('pointercancel', () => { dragging = false; });
  knob.addEventListener('keydown', e => {
    const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (by) { e.preventDefault(); set(value + by * STEP); }
  });
  box.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => set(value + Number(b.dataset.step) * STEP)));
  box.querySelector('[data-change]')!.addEventListener('click', () => { close(); openDrinkSheet(ctx, { kind, salty, ml: value }); });
  addButton.addEventListener('click', () => { close(); addChecked(ctx, value, kind, salty); });
  show();
}
