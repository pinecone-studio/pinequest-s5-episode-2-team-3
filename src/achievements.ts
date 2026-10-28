import './style.css';
import './shell.css';
import './pwa';
import { defaults, type AppState } from './data';
import { escape, number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { GROUPS, KINDS, STAGES, petLabel, petState, petSvg, readPetName, takeNewKinds, unlockedKinds, writePetName, type Group, type Kind, type PetState } from './pet';
import { activeKind, feed, petGame, pickKind, takeStageUp, takeStepBack, usableKinds, type Game } from './pet-game';
import { badgeSvg, LOOP_ICONS } from './badge-art';
import { ENERGY_DAYS, XP_PER_FEED, XP_PER_LEVEL } from './pet-config';
import type { Look, Pet3D } from './pet3d';
import './theme.css';

// "Амжилт" page as a small pet game: «Дусалхан» (pet.ts) roams the blue header and grows with days that
// counted (the goal reached, or under a doctor's limit, the limit kept). A counted day fills its bowl
// once; feeding it gives XP and a happy little meal (pet-game.ts). Below: next growth, the animals to
// collect (by the longest streak, so a break keeps them) and the badges.

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();
let shown = false;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const lockIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const dropIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z"/></svg>';
const sample = (best: number): PetState => ({ stage: 'big', mood: 'good', streak: 0, best, days: 30, nextStageIn: null, line: '' });

// The 3D pet (pet3d.ts, three.js) loads after the first paint; until then, or where WebGL is missing,
// the flat SVG pet stands in. `host3d` survives redraws so the live pet keeps walking.
let p3d: typeof import('./pet3d') | null = null;
let live: Pet3D | null = null;
let host3d: HTMLButtonElement | null = null;
// A picture of an animal: a 3D still when possible, else the SVG.
function art(p: PetState, name: string, id: string, kind: Kind, shine = 0): string {
  if (p3d) try { return `<img class="pet pet-img" src="${p3d.petImage({ kind, mood: p.mood, stage: p.stage, shine } satisfies Look)}" alt="">`; } catch { /* SVG below */ }
  return petSvg(p, name, id, kind, true);
}

// A bowl of water, the pet's food. `full` fills it when today's bowl is waiting.
const bowl = (full: boolean) => `<svg class="pg-bowl${full ? ' full' : ''}" viewBox="0 0 64 44" aria-hidden="true">
  <ellipse class="pg-bowl-water" cx="32" cy="14" rx="26" ry="7"/>
  <path class="pg-bowl-body" d="M4 14 Q6 40 32 40 Q58 40 60 14 Q58 21 32 21 Q6 21 4 14Z"/>
  <path class="pg-bowl-drop" d="M32 25 c-3 4 -4 6 -4 8 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -8Z"/></svg>`;

// Animals unlocked since the last visit; kept for this whole visit so the «Шинэ!» doesn't vanish on a redraw.
let fresh: Set<Kind> | null = null;

// The feed button under the pet, Pou-style.
function feedButton(g: Game): string {
  return g.canFeed ? `<button type="button" class="pg-feed" id="pg-feed">${LOOP_ICONS.bowl}Хооллох</button>`
    : g.fedToday ? '<button type="button" class="pg-feed done" disabled>Хооллосон ✓</button>'
    : `<button type="button" class="pg-feed" disabled>${state.mode === 'limit' ? 'Хязгаартаа багтаа' : 'Зорилгоо биелүүлээд хооллоно'}</button>`;
}

// Round gauges either side of the pet, like a pet game's status: food, growth, level and streak.
// Each is a button; a tap shows what it means.
const FLAME = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6 0 2 1 3.5 2.5 3.5C14 12 14 7 16 3Z" fill="#ff7a1a"/><path d="M16 15c.5 2.5 3.5 4 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1.5-3 2-3.5.3 1 .8 1.5 1.5 1.5-.5-2-.5-3.5 0-5Z" fill="#ffd34d"/></svg>';
const SPROUT = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28V15" stroke="#3d9a3a" stroke-width="2.6" stroke-linecap="round"/><path d="M16 17C16 10 10 7 5 8c0 6 5 9 11 9Z" fill="#5fcf5a"/><path d="M16 14c0-6 5-9 11-8 0 5-4 8-11 8Z" fill="#7fe07a"/><ellipse cx="16" cy="28" rx="7" ry="2" fill="#4aa8ff"/></svg>';
function orb(id: string, icon: string, part: number, label: string, tip: string, color: string): string {
  const c = 2 * Math.PI * 25;
  return `<button type="button" class="pg-orb" data-tip="${escape(tip)}" aria-label="${escape(tip)}" id="pg-orb-${id}">
    <svg class="pg-orb-ring" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="25" class="bg"/><circle cx="30" cy="30" r="25" class="fg" style="stroke:${color}" stroke-dasharray="${(Math.max(0, Math.min(1, part)) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <span class="pg-orb-ic">${icon}</span><b>${label}</b></button>`;
}
// The four gauges fold into one button at the top left; a tap drops them down in a column. Open or
// closed is kept for the visit, so a redraw (feeding, renaming) doesn't fold them again.
let orbsOpen = false;
const ORB_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="7.5" r="4" fill="#4aa8ff"/><circle cx="16.5" cy="7.5" r="4" fill="#ffc83d"/><circle cx="7.5" cy="16.5" r="4" fill="#5fcf5a"/><circle cx="16.5" cy="16.5" r="4" fill="#ff7a1a"/></svg>';
const orbMenu = (side: [string, string]) => `<div class="pg-orbs left${orbsOpen ? ' open' : ''}">
  <button type="button" class="pg-orb-toggle" id="pg-orbs-toggle" aria-expanded="${orbsOpen}" aria-controls="pg-orb-list" aria-label="Төлөв: хоол, өсөлт, түвшин, streak">${ORB_DOTS}<svg class="pg-orb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
  <div class="pg-orb-list" id="pg-orb-list"${orbsOpen ? '' : ' inert'}>${side[0]}${side[1]}</div></div>`;
function orbs(pet: PetState, g: Game): [string, string] {
  const at = g.stageIndex, cur = STAGES[at], next = STAGES[at + 1];
  const grow = next ? (pet.days - cur.from) / (next.from - cur.from) : 1;
  const keep = state.mode === 'limit' ? 'хязгаартаа багтаагаад' : 'зорилгоо биелүүлээд';
  return [
    orb('food', LOOP_ICONS.bowl, g.energy / ENERGY_DAYS, `${g.energy}/${ENERGY_DAYS}`, `Хоол: сүүлийн ${ENERGY_DAYS} өдрөөс ${g.energy}-д нь хооллосон. Зорилгоо биелүүлсэн өдөр бүр нэг аяга хоол авна.`, '#4aa8ff')
      + orb('grow', SPROUT, grow, next ? `${pet.days - cur.from}/${next.from - cur.from}` : 'Дээд', next ? `Өсөлт: дахиад ${number(next.from - pet.days)} өдөр ${keep} «${next.name}» шатанд хүрнэ.` : 'Өсөлт: хамгийн том хэлбэртээ хүрсэн!', '#5fcf5a'),
    orb('level', LOOP_ICONS.star, g.levelXp / XP_PER_LEVEL, `Lv ${g.level}`, `Түвшин ${g.level}: ${number(g.levelXp)} / ${number(XP_PER_LEVEL)} XP. Түвшин ахих тусам ${'гялалзана'}.`, '#ffc83d')
      + orb('streak', FLAME, Math.min(1, pet.streak / Math.max(1, KINDS.find(k => k.need > pet.streak)?.need ?? pet.streak)), `${number(pet.streak)}`, `Streak: ${number(pet.streak)} өдөр дараалан. Хамгийн урт нь ${number(pet.best)} өдөр.`, '#ff7a1a'),
  ];
}

const loopCard = () => `<section class="hx-card pg-loop" aria-label="Яаж тоглох вэ">${[
  [LOOP_ICONS.drink, state.mode === 'limit' ? 'Хязгаартаа багтаа' : 'Өдрийн зорилгоо биелүүл'],
  [LOOP_ICONS.bowl, 'Хоол / энерги ав'],
  [LOOP_ICONS.feed, 'Дусалхангаа хооллоо'],
  [LOOP_ICONS.star, 'Streak-ээ хадгалж шинэ амьтан нээ'],
].map(([i, t]) => `<div><span aria-hidden="true">${i}</span><small>${t}</small></div>`).join('<i aria-hidden="true">›</i>')}</section>`;

// Demo switch: treats the streak as 100 days so every animal can be seen and picked. Only the
// animals change; XP, badges and the real streak stay as they are. Remembered on this phone.
const DEMO_KEY = 'dusal-pet-demo-v1';
const DEMO_DAYS = Math.max(...KINDS.map(k => k.need));
let demo = (() => { try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; } })();
const reach = (days: number) => (demo ? Math.max(days, DEMO_DAYS) : days);

// Every animal. Collected ones (by the longest streak) stay forever, but the pet can only be one the
// current streak reaches; the others rest («Амарч байна») until the streak climbs back.
// Rarer animals look fancier: each step of five in the list adds a step of shine (glitter, glow,
// sparkles) on top of the level's, so climbing the collection is worth it.
const rank = (kind: Kind) => Math.floor(KINDS.findIndex(k => k.id === kind) / 5);
const shineOf = (kind: Kind, level: number) => Math.min(6, level + rank(kind));
let group: Group | 'all' = 'all';

function kindList(best: number, streak: number, picked: Kind): string {
  const open = unlockedKinds(best), usable = usableKinds(streak);
  const shown = KINDS.filter(k => group === 'all' || (k.tags as readonly Group[]).includes(group));
  const chips = ([['all', 'Бүгд'], ...Object.entries(GROUPS)] as [Group | 'all', string][]).map(([id, label]) =>
    `<button type="button" class="pg-chip${group === id ? ' on' : ''}" data-group="${id}" aria-pressed="${group === id}">${label}</button>`).join('');
  return `<section class="hx-card pet-kinds" aria-labelledby="pet-kinds-title">
    <h2 id="pet-kinds-title">Амьтдын цуглуулга <small>${open.length} / ${KINDS.length} цуглуулсан</small></h2>
    <button type="button" class="pg-demo${demo ? ' on' : ''}" id="pg-demo" aria-pressed="${demo}">${demo ? '✓ Демо: бүгд нээлттэй · Буцаах' : '✨ Бүгдийг нээх (демо)'}</button>
    <div class="pg-chips" role="group" aria-label="Ангилал">${chips}</div>
    <div class="pet-kind-grid" role="radiogroup" aria-labelledby="pet-kinds-title">${shown.map(k => {
      const got = open.includes(k.id), can = usable.includes(k.id), on = k.id === picked;
      return `<button type="button" class="pet-kind${on ? ' on' : ''}${got ? (can ? '' : ' resting') : ' locked'}" role="radio" aria-checked="${on}" data-kind="${k.id}"${can ? '' : ' aria-disabled="true"'}>
        ${got ? (can ? '' : '<span class="pet-lock moon" aria-hidden="true">☾</span>') : `<span class="pet-lock">${lockIcon()}</span>`}
        ${art(sample(best), k.name, `kind-${k.id}`, k.id, rank(k.id))}<b>${k.name}</b>
        ${on ? '<small class="pet-picked">Сонгогдсон ✓</small>' : can ? '<small>Сонгох</small>' : got ? `<small>Амарч байна · ${k.need} өдөр</small>` : `<small>${dropIcon}${k.need} өдөр дараалан</small>`}
        ${fresh?.has(k.id) ? '<span class="pet-new">Шинэ!</span>' : ''}</button>`;
    }).join('')}</div></section>`;
}

function badgeList(g: Game, best: number): string {
  return `<section class="hx-card pg-badges" aria-labelledby="pg-badges-title">
    <h2 id="pg-badges-title">Тэмдгүүд <small>Хамгийн урт streak: ${number(best)} өдөр</small></h2>
    <ul>${g.badges.map(b => `<li class="${b.got ? 'got' : ''}">${badgeSvg(b.id)}<b>${b.name}</b>
      <small>${b.got ? 'Авсан' : `${number(Math.min(best, b.need))} / ${number(b.need)} өдөр`}</small></li>`).join('')}</ul></section>`;
}

function render(): void {
  const name = readPetName();
  const real = petState(state.events, state.goal, state.mode, new Date(), name);
  // In the demo the pet shows its grown-up, happy form so every animal can be seen properly.
  const pet: PetState = demo && (real.stage === 'egg' || real.stage === 'baby') ? { ...real, stage: 'big', mood: real.mood === 'sick' || real.mood === 'weak' ? 'good' : real.mood } : real;
  const game = petGame(state.events, state.goal, state.mode, real);
  fresh ??= new Set(takeNewKinds(pet.best));
  const kind = activeKind(reach(pet.streak));
  const back = demo ? null : takeStepBack(kind);
  const stage = STAGES[game.stageIndex];
  const roam = pet.mood !== 'weak' && pet.stage !== 'egg';
  const side = orbs(real, game);
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('achievements')}</header>
      <div class="ach-top">
        <div class="hx-header ach-header"><span class="hx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><h1>Амжилт</h1><button type="button" class="pg-help" id="pg-help" aria-label="Яаж тоглох вэ">?</button></div>
        <div class="pg-stage" id="pg-stage">
          ${orbMenu(side)}
          <div class="pg-roam${roam ? ' on' : ''}${game.canFeed ? ' cheer' : ''}"><button type="button" class="pet-tap" id="pet-tap">${petSvg(pet, name, 'pet-big', kind)}</button></div>
        </div>
        ${feedButton(game)}
        <button type="button" class="pet-name" id="pet-name" aria-label="Нэр солих: ${escape(name)}">${escape(name)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
        <p class="pg-meta">Өсөлтийн үе ${game.stageIndex} · ${stage.name} · Түвшин ${number(game.level)}${shineOf(kind, game.shine) ? ` · <span class="pg-shine">✦ Гялбаа ${shineOf(kind, game.shine)}</span>` : ''}</p>
        <p class="pet-line" id="pet-line">${escape(game.canFeed ? `Өнөөдрийн зорилго биеллээ! ${name} хоолоо хүлээж байна.` : pet.line)}</p>
      </div>
      <div class="hydro hx-page ach-body">
        ${kindList(reach(pet.best), reach(pet.streak), kind)}
        ${badgeList(game, pet.best)}
      </div>
    </div></main>`;
  bindPet();
  place3d(pet, kind, roam, name, shineOf(kind, shineOf(kind, game.shine)));
  if (!shown) {
    shown = true;
    const reveals: Reveal[] = [];
    if (!demo && takeStageUp(real.stage)) reveals.push({ title: 'Мундаг байна!', text: `${name} чинь «${stage.name}» шатанд хүрлээ!`, svg: art({ ...pet, mood: 'joyful' }, name, 'rv-stage', kind, shineOf(kind, game.shine)) });
    if (back) {
      const was = KINDS.find(k => k.id === back)!;
      reveals.push({ title: `${name} амарч байна`, text: `Streak тасарсан тул ${was.name} түр амарч, ${name} ${KINDS.find(k => k.id === kind)!.name} хэлбэртээ буцлаа. ${number(was.need)} өдөр дараалан биелүүлбэл ${was.name} эргэн ирнэ!`, svg: art(pet, name, 'rv-back', kind, shineOf(kind, game.shine)) });
    }
    for (const k of KINDS) if (fresh.has(k.id)) reveals.push({ title: 'Шинэ амьтан нээгдлээ!', text: `${k.name} таны цуглуулгад нэмэгдлээ. Доороос сонгоорой.`, svg: art({ ...sample(pet.best), mood: 'joyful' }, k.name, `rv-${k.id}`, k.id) });
    showReveals(reveals);
  }
}

function place3d(pet: PetState, kind: Kind, roam: boolean, name: string, shine: number): void {
  if (!p3d) return;
  const stageBox = document.querySelector<HTMLDivElement>('#pg-stage')!;
  if (!host3d) {
    host3d = document.createElement('button');
    host3d.type = 'button';
    host3d.className = 'pg-3d';
    stageBox.append(host3d);
    try { live = p3d.mountPet3d(host3d); } catch { host3d.remove(); host3d = null; p3d = null; return; }
    host3d.addEventListener('click', () => {
      if (!live || live.dragged()) return;
      live.hop();
      const b = host3d!.getBoundingClientRect();
      heart(b.left + b.width * (0.42 + Math.random() * 0.16), b.top + b.height * 0.3);
    });
  }
  stageBox.append(host3d);
  stageBox.classList.add('has3d');
  host3d.setAttribute('aria-label', petLabel(pet, name, kind));
  live!.set({ kind, mood: pet.mood, stage: pet.stage, shine }, roam);
}

function heart(x: number, y: number): void {
  const h = document.createElement('span');
  h.className = 'pet-heart';
  h.setAttribute('aria-hidden', 'true');
  h.textContent = '❤';
  h.style.left = `${x}px`;
  h.style.top = `${y}px`;
  document.body.append(h);
  setTimeout(() => h.remove(), 1000);
}

// A short rising chime through Web Audio; silent where audio isn't allowed yet.
function chime(notes: number[]): void {
  try {
    const ctx = new AudioContext();
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.11;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), notes.length * 110 + 600);
  } catch { /* no sound */ }
}

// Little things flying out of a point: hearts, drops, sparkles.
function burst(x: number, y: number, chars: string[], count: number, spread = 90): void {
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'pg-particle';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = chars[i % chars.length];
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * spread * (0.6 + Math.random() * 0.5)}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * spread * (0.6 + Math.random() * 0.5) - 30}px`);
    document.body.append(s);
    setTimeout(() => s.remove(), 1200);
  }
}

// The meal: a bowl slides under the pet, it chomps, drops and hearts fly, then the page redraws with
// the new energy and XP. `feed` refuses a second claim, so fast taps do nothing more.
function eat(): void {
  if (!feed(state.events, state.goal, state.mode)) { render(); return; }
  const stageBox = document.querySelector<HTMLDivElement>('#pg-stage')!;
  const roam = stageBox.querySelector<HTMLDivElement>('.pg-roam')!;
  document.querySelector<HTMLButtonElement>('#pg-feed')?.setAttribute('disabled', '');
  roam.classList.remove('on', 'cheer');
  roam.classList.add('eating');
  live?.eat();
  const dish = document.createElement('div');
  dish.className = 'pg-dish';
  dish.innerHTML = bowl(true);
  stageBox.append(dish);
  chime([660, 880, 1046]);
  const box = (host3d ?? roam).getBoundingClientRect();
  const x = box.left + box.width / 2, y = box.top + box.height * 0.45;
  setTimeout(() => burst(x, y, ['💧', '💙', '✨'], 10), reduced() ? 0 : 700);
  const plus = document.createElement('span');
  plus.className = 'pg-plus';
  plus.textContent = `+${XP_PER_FEED} XP`;
  plus.style.left = `${x}px`; plus.style.top = `${box.top + box.height * 0.3}px`;
  document.body.append(plus);
  setTimeout(() => plus.remove(), 1600);
  setTimeout(() => { render(); document.querySelector<HTMLButtonElement>('#pet-tap')?.focus(); }, reduced() ? 300 : 1700);
}

interface Reveal { title: string; text: string; svg: string }
// Evolution and unlock reveals, one after another, each with a glow, particles and a chime.
function showReveals(list: Reveal[]): void {
  const r = list.shift();
  if (!r) return;
  const back = document.activeElement as HTMLElement | null;
  const dim = document.createElement('div');
  dim.className = 'hx-dim pg-reveal';
  dim.innerHTML = `<div class="pg-reveal-card" role="dialog" aria-modal="true" aria-labelledby="pg-rv-title">
    <div class="pg-rays" aria-hidden="true"></div><div class="pg-reveal-pet">${r.svg}</div>
    <h2 id="pg-rv-title">${escape(r.title)}</h2><p>${escape(r.text)}</p>
    <button type="button" class="hx-blue">Гайхалтай!</button></div>`;
  document.body.append(dim);
  const ok = dim.querySelector('button')!;
  ok.focus();
  chime([523, 659, 784, 1046]);
  const box = dim.querySelector('.pg-reveal-pet')!.getBoundingClientRect();
  burst(box.left + box.width / 2, box.top + box.height / 2, ['✨', '⭐', '💧', '💙'], 16, 130);
  const close = () => { dim.remove(); back?.focus(); showReveals(list); };
  ok.addEventListener('click', close);
  dim.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// A small speech bubble next to a gauge, gone after a few seconds or on the next tap.
function tip(b: HTMLButtonElement): void {
  document.querySelector('.pg-tip')?.remove();
  const t = document.createElement('div');
  t.className = 'pg-tip';
  t.setAttribute('role', 'status');
  t.textContent = b.dataset.tip ?? '';
  const stageBox = document.querySelector<HTMLDivElement>('#pg-stage')!;
  const sb = stageBox.getBoundingClientRect(), bb = b.getBoundingClientRect();
  t.style.top = `${bb.bottom - sb.top + 4}px`;
  // Beside the open column, level with the gauge that was tapped.
  t.style.top = `${bb.top - sb.top}px`;
  t.style.left = `${bb.right - sb.left + 14}px`;
  stageBox.append(t);
  setTimeout(() => t.remove(), 3500);
}

// How the game works, in a sheet from the «?» button.
function help(): void {
  const back = document.activeElement as HTMLElement | null;
  const dim = document.createElement('div');
  dim.className = 'hx-dim';
  dim.innerHTML = `<div class="hx-bottom pg-locked" role="dialog" aria-modal="true" aria-labelledby="pg-help-title"><h2 id="pg-help-title">Яаж тоглох вэ</h2>${loopCard()}
    <p class="pg-hint">Streak өсөх тусам ${readPetName()} шинэ амьтан болж хувирна, тасарвал өмнөх хэлбэртээ түр буцна. Түвшин ахих тусам улам гялалзана.</p><button type="button" class="hx-blue">Ойлголоо</button></div>`;
  document.body.append(dim);
  const ok = dim.querySelector<HTMLButtonElement>('.hx-blue')!;
  ok.focus();
  const close = () => { dim.remove(); back?.focus(); };
  ok.addEventListener('click', close);
  dim.addEventListener('click', e => { if (e.target === dim) close(); });
  dim.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// A locked animal: what it takes and how far along the user already is.
function lockedNote(kind: Kind, best: number, streak: number): void {
  const k = KINDS.find(x => x.id === kind)!;
  const resting = best >= k.need;
  const back = document.activeElement as HTMLElement | null;
  const dim = document.createElement('div');
  dim.className = 'hx-dim';
  dim.innerHTML = `<div class="hx-bottom pg-locked" role="dialog" aria-modal="true" aria-labelledby="pg-lk-title">
    <div class="pet-kind locked">${art(sample(best), k.name, 'lk', k.id)}</div>
    <h2 id="pg-lk-title">${k.name}</h2>
    <p>${resting ? `Цуглуулгад чинь байгаа ч одоо амарч байна. Дахиад ${number(k.need)} өдөр дараалан ${state.mode === 'limit' ? 'хязгаартаа багтвал' : 'зорилгоо биелүүлбэл'} буцаж ирнэ.` : `${number(k.need)} өдөр дараалан ${state.mode === 'limit' ? 'хязгаартаа багтвал' : 'зорилгоо биелүүлбэл'} нээгдэнэ.`}</p>
    <div class="pg-bar"><span style="width:${Math.min(100, ((resting ? streak : best) / k.need) * 100)}%"></span></div>
    <p class="pg-hint">${resting ? `Одоогийн streak: ${number(streak)} / ${number(k.need)} өдөр` : `Таны хамгийн урт streak: ${number(best)} / ${number(k.need)} өдөр`}</p>
    <button type="button" class="hx-blue">Ойлголоо</button></div>`;
  document.body.append(dim);
  const ok = dim.querySelector('button')!;
  ok.focus();
  const close = () => { dim.remove(); back?.focus(); };
  ok.addEventListener('click', close);
  dim.addEventListener('click', e => { if (e.target === dim) close(); });
  dim.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// A tap makes the pet hop with a heart; the name turns into a field (Enter or leaving it saves, Esc cancels).
function bindPet(): void {
  const tap = document.querySelector<HTMLButtonElement>('#pet-tap')!;
  tap.addEventListener('click', () => {
    tap.classList.remove('hop');
    void tap.offsetWidth;  // restart the hop on quick taps
    tap.classList.add('hop');
    const box = tap.getBoundingClientRect();
    heart(box.left + box.width * (0.38 + Math.random() * 0.2), box.top + box.height * 0.28);
  });
  document.querySelector<HTMLButtonElement>('#pg-feed')?.addEventListener('click', eat);
  document.querySelectorAll<HTMLButtonElement>('.pg-orb').forEach(b => b.addEventListener('click', () => tip(b)));
  document.querySelector<HTMLButtonElement>('#pg-orbs-toggle')?.addEventListener('click', e => {
    orbsOpen = !orbsOpen;
    const b = e.currentTarget as HTMLButtonElement;
    b.setAttribute('aria-expanded', String(orbsOpen));
    b.parentElement!.classList.toggle('open', orbsOpen);
    document.querySelector('#pg-orb-list')!.toggleAttribute('inert', !orbsOpen);
    if (!orbsOpen) document.querySelector('.pg-tip')?.remove();
  });
  document.querySelector<HTMLButtonElement>('#pg-help')?.addEventListener('click', help);
  const real = petState(state.events, state.goal, state.mode);
  const best = reach(real.best), streak = reach(real.streak);
  document.querySelectorAll<HTMLButtonElement>('[data-group]').forEach(b => b.addEventListener('click', () => {
    group = b.dataset.group as Group | 'all';
    render();
    document.querySelector<HTMLButtonElement>(`[data-group="${group}"]`)?.focus();
  }));
  document.querySelector<HTMLButtonElement>('#pg-demo')?.addEventListener('click', () => {
    demo = !demo;
    try { if (demo) localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY); } catch { /* this visit only */ }
    if (!demo) takeStepBack(activeKind(real.streak));  // leaving the demo isn't a «step back»
    render();
    document.querySelector<HTMLButtonElement>('#pg-demo')?.focus();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind as Kind;
    if (!usableKinds(streak).includes(kind)) { lockedNote(kind, best, streak); return; }
    pickKind(kind, streak);
    fresh?.delete(kind);
    // The grid scrolls sideways; keep it where it was instead of jumping back to the first animals.
    const x = document.querySelector('.pet-kind-grid')?.scrollLeft ?? 0;
    render();
    document.querySelector('.pet-kind-grid')?.scrollTo({ left: x });
    document.querySelector<HTMLButtonElement>(`[data-kind="${kind}"]`)?.focus({ preventScroll: true });
  }));
  const nameButton = document.querySelector<HTMLButtonElement>('#pet-name')!;
  nameButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'pet-name-input';
    input.maxLength = 20;
    input.value = readPetName();
    input.setAttribute('aria-label', 'Амьтны нэр');
    nameButton.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      if (keep) writePetName(input.value);
      render();
      document.querySelector<HTMLButtonElement>('#pet-name')?.focus();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
void import('./pet3d').then(m => { p3d = m; render(); }).catch(() => { /* keeps the SVG pet */ });
onExternalChange(() => void reload());
void reload();
