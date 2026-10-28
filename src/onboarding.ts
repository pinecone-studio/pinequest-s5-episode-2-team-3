import './onboarding.css';
import { escape, number } from './format';
import { mdIcon } from './components/Icon';
import { ACTIVITIES, CONDITIONS, PROFILE_KEY, calcPlan, readProfile, writeProfile, type Activity, type Condition, type Plan, type Profile } from './plan';
import { saveMember, readMember } from './member';
import { signInWithGoogle } from './google-signin';
import { readSettings, writeSettings } from './schedule';
import { openAmountSheet } from './hx-edit';
import { about } from './prefs';
import { climateOf, fetchWeather } from './weather';

// First visit, Hydrify layout (demo): two walkthrough slides, a sign-up form (name kept on this
// phone; email and password are not sent anywhere), nine one-question steps with a progress bar
// (sex, height, weight, age, wake-up, bedtime, activity, climate, condition), a "making your plan"
// ring, then the daily amount from calcPlan (+500 мл in a hot climate), shown in the unit picked.
const SEEN_KEY = 'dusal-onboarded-v1';

export function needsOnboarding(): boolean {
  try { return !localStorage.getItem(SEEN_KEY) && !localStorage.getItem(PROFILE_KEY); } catch { return false; }
}
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: ask again next time */ } };

type Sex = 'male' | 'female' | 'none';
type Screen = 'walk' | 'signup' | 'step' | 'making' | 'ready';
const QUESTIONS = 9;
type Climate = 'hot' | 'mild' | 'cold';
const CLIMATES: Record<Climate, { label: string; icon: string; extra: number }> = {
  hot: { label: 'Халуун', icon: '<circle cx="16" cy="16" r="6.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.4" stroke-linecap="round"><path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4M6.5 6.5l2.8 2.8M22.7 22.7l2.8 2.8M6.5 25.5l2.8-2.8M22.7 9.3l2.8-2.8"/></g>', extra: 500 },
  mild: { label: 'Дунд зэрэг', icon: '<circle cx="12" cy="12" r="5.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v3M2 12h3M4.9 4.9l2.1 2.1M19.1 4.9 17 7"/></g><path d="M10 27a5 5 0 0 1 .6-10A7 7 0 0 1 24 15.5a5.8 5.8 0 0 1 .5 11.5z" fill="#cfe6fd" stroke="#9fd0fb" stroke-width="1.2"/>', extra: 0 },
  cold: { label: 'Хүйтэн', icon: '<g stroke="#369fff" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M12.5 5.5 16 8.5l3.5-3M12.5 26.5 16 23.5l3.5 3M4.5 14l4.4-1-1.3-4.4M27.5 18l-4.4 1 1.3 4.4M4.5 18l4.4 1-1.3 4.4M27.5 14l-4.4-1 1.3-4.4"/></g>', extra: 0 },
};
// The result in the unit picked on the last screen (kit 19).
const UNITS = { ml: { label: 'мл', per: 1, digits: 0 }, l: { label: 'л', per: 1000, digits: 2 }, us: { label: 'US oz', per: 29.5735, digits: 0 }, uk: { label: 'UK oz', per: 28.4131, digits: 0 } } as const;
type Unit = keyof typeof UNITS;

// The figure on the height and weight steps (kit 10–12), drawn from the numbers so it changes as
// the wheel turns: BMI widens the shoulders, chest, waist (a belly from about BMI 25), hips, arms
// and legs; height scales the whole figure from the feet up. Women get narrower shoulders, wider
// hips, longer hair and a top. Height 175 cm and BMI 22 is the drawing's base size. Every part is a
// smooth outline through a few points (thigh, knee, calf, ankle…), shaded at the edges to look round.
type Pt = [number, number];
const f1 = (n: number) => n.toFixed(1);
// A closed Catmull-Rom curve through the points.
function smooth(pts: Pt[]): string {
  const n = pts.length, at = (i: number) => pts[(i + n) % n];
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`;
  }
  return `${d}Z`;
}
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [160 - x, y]);

function body(sex: Sex | null, weight: number, height: number): string {
  const bmi = weight / (height / 100) ** 2;
  const w = Math.max(0.72, Math.min(1.9, bmi / 22));
  const belly = Math.max(0, Math.min(1.3, (bmi - 24) / 9));
  const f = sex === 'female';
  const s = Math.max(0.78, Math.min(1.12, height / 175));
  const S = (f ? 25 : 30) * (0.8 + 0.2 * w), C = (f ? 21 : 24) * w, W = (f ? 17 : 21) * w + belly * 9;
  const H = (f ? 26 : 22) * w + belly * 3, lw = w ** 0.6, nw = (f ? 5.5 : 6.5) * lw ** 0.7;
  const Wb = W + 4 * belly;
  const R = (dx: number, y: number): Pt => [80 + dx, y];
  const skin = '#f2b48c', shade = '#d9946a', line = '#c47f5a', hair = '#3b2a20';
  const detail = (d: string, o = 0.55, sw = 0.9) => `<path d="${d}" stroke="${line}" stroke-width="${sw}" stroke-linecap="round" fill="none" opacity="${o}"/>`;
  const both = (make: (d: 1 | -1) => string) => make(-1) + make(1);
  const X = (dx: number) => f1(80 + dx);

  // Torso: neck base, trapezius, shoulder, chest, ribs, waist, hips, down to the crotch.
  const torsoR: Pt[] = [R(nw + 1, 50), R(nw + 8, 54.5), R(S - 1.5, 58.5), R(C + 1, 72), R(C, 86), R((C + Wb) / 2 + belly * 2, 102), R(Wb, 116), R(W + 1.5, 128), R(H, 140), R(H - 0.5, 152), R(4, 157)];
  const torso = smooth([...torsoR, ...mirror(torsoR).reverse()]);

  // Legs: a centre line and half-width at the hip, thigh, knee, calf and ankle.
  const ck = 5 + 0.3 * H, ca = 8 + w, kw = 5.4 * lw;
  const legKeys: [number, number, number][] = [
    [142, H / 2, H / 2],
    [165, H * 0.48 + 0.5, H * 0.47],
    [188, (H * 0.45 + ck) / 2, (H * 0.4 + kw) / 2 + 1.2 * lw],
    [212, ck, kw],
    [236, ck * 0.4 + ca * 0.6 + 0.4, 6.4 * lw],
    [260, ca, 4 * lw],
    [281, ca, 3.4 * lw],
  ];
  const legR = smooth([
    ...legKeys.map(([y, c, h]): Pt => R(c + h, y)),
    ...legKeys.slice(1).reverse().map(([y, c, h]): Pt => R(Math.max(0.8, c - h), y)),
    R(1, 150),
  ]);
  const legAt = (y: number) => { const i = legKeys.findIndex(k => k[0] >= y); const [a, b] = [legKeys[i - 1], legKeys[i]]; const t = (y - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const footR = smooth([R(ca - 3.6, 277), R(ca + 3.6, 277), R(ca + 4.8, 282), R(ca + 8.5, 285.5), R(ca + 8, 289), R(ca - 3.6, 289.5), R(ca - 4.8, 285)]);

  // Arms: shoulder cap, upper arm, elbow, forearm, wrist, hand; they hang clear of the belly and hips.
  const ua = Math.max(S + 0.5, C + 2 * lw) + belly * 1.5;
  const ex = Math.max(ua + 0.5, Wb + 4.4 * lw + 1), wx = Math.max(H + 3.4 * lw + 1.5, ex - 2), hc = wx + 0.5;
  const armKeys: [number, number, number][] = [[68, S + 0.5, 6 * lw], [90, ua, 5 * lw], [112, ex, 4 * lw], [126, (ex + wx) / 2, 4.6 * lw], [150, wx, 3 * lw], [162, hc, 4 * lw], [174, hc, 3 * lw]];
  const armR = smooth([
    R(S - 2, 57.5), ...armKeys.map(([y, c, h]): Pt => R(c + h, y)), R(hc, 178.5),
    ...armKeys.slice(1).reverse().map(([y, c, h]): Pt => R(c - h, y)), R(C - 1, 76), R(S - 7, 62),
  ]);

  // Shorts over the hips and the top of the thighs.
  const [sc, sh] = legAt(178);
  const shorts = `M${X(-H - 1.5)} 136 L${X(H + 1.5)} 136 L${X(sc + sh + 1.5)} 178 L${X(Math.max(1, sc - sh - 1))} 180 L80 ${f ? 162 : 160} L${X(-Math.max(1, sc - sh - 1))} 180 L${X(-sc - sh - 1.5)} 178Z`;

  const head = smooth(f
    ? [[80, 7], [91, 12], [93, 25], [89, 35], [84, 40], [80, 41], [76, 40], [71, 35], [67, 25], [69, 12]]
    : [[80, 6], [92, 12], [94, 26], [90, 36], [84, 41], [80, 42], [76, 41], [70, 36], [66, 26], [68, 12]]);
  const neck = `M${X(-nw)} 34 L${X(nw)} 34 L${X(nw + 1)} 53 L${X(-nw - 1)} 53Z`;

  const chest = f
    ? `<path d="M${X(-C + 0.5)} 75 C${X(-C * 0.5)} 70 ${X(-3)} 78 80 80 C${X(3)} 78 ${X(C * 0.5)} 70 ${X(C - 0.5)} 75 L${X(C - 1)} 97 Q80 101 ${X(-C + 1)} 97Z" fill="#212121"/>
       ${both(d => `<path d="M${X(d * C * 0.55)} 74 L${X(d * (nw + 4))} 54" stroke="#212121" stroke-width="2.2" stroke-linecap="round"/>`)}
       ${both(d => `<path d="M${X(d * C * 0.85)} 91 Q${X(d * C * 0.42)} 99 ${X(d)} 91" stroke="#4a4a4a" stroke-width="1" fill="none"/>`)}`
    : both(d => detail(`M${X(d * C * 0.85)} 80 Q${X(d * C * 0.55)} 93 ${X(d * 1.5)} 88`) + `<circle cx="${X(d * C * 0.52)}" cy="84" r="1.1" fill="#c57e5e"/>`)
      + (bmi < 26 ? detail('M80 91V118', 0.3) + [101, 110].map(y => both(d => detail(`M${X(d * 1.5)} ${y} q${f1(d * 3)} 1 ${f1(d * 6)} 0`, 0.3))).join('') : '');

  const face = `${both(d => `<ellipse cx="${X(d * 14)}" cy="26" rx="2.6" ry="4.5" fill="${shade}"/>`)}
    <path d="${head}" fill="url(#ob-skin)"/>
    ${both(d => `<ellipse cx="${X(d * 5.2)}" cy="25" rx="1.7" ry="1.25" fill="#2b1d14"/><path d="M${X(d * 8)} 20.8 q${f1(-d * 2.8)} -1.6 ${f1(-d * 5.6)} -.3" stroke="${hair}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`)}
    ${detail('M80 26q-1.2 4 .2 5.4q1 .3 1.6-.2', 0.8)}
    <path d="M77 35.3q3 1.5 6 0" stroke="${f ? '#d9776f' : '#b5705a'}" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <ellipse cx="80" cy="44" rx="${f1(nw)}" ry="2.2" fill="${shade}" opacity=".6"/>`;

  return `<svg class="ob-body" viewBox="0 -36 160 336" role="img" aria-label="${height} см, ${weight} кг">
    <defs><linearGradient id="ob-skin" x1="0" x2="1"><stop offset="0" stop-color="${shade}"/><stop offset=".3" stop-color="${skin}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${shade}"/></linearGradient></defs>
    <ellipse cx="80" cy="292" rx="${f1(34 * w)}" ry="5" fill="#e9e9e9"/>
    <g transform="translate(80 292) scale(${s.toFixed(3)}) translate(-80 -292)">
      ${f ? `<path d="${smooth([[64, 24], [65, 7], [80, 1], [95, 7], [96, 24], [98, 46], [93, 55], [80, 50], [67, 55], [62, 46]])}" fill="${hair}"/>` : ''}
      <path d="${neck}" fill="${shade}"/>
      <path d="${legR}" fill="url(#ob-skin)"/>
      <path d="${legR}" transform="matrix(-1 0 0 1 160 0)" fill="url(#ob-skin)"/>
      <path d="${footR}" fill="${skin}"/><path d="${footR}" transform="matrix(-1 0 0 1 160 0)" fill="${skin}"/>
      ${both(d => detail(`M${X(d * (ck - 3))} 214 Q${X(d * ck)} 217.5 ${X(d * (ck + 3))} 214`, 0.5) + detail(`M${X(d * (ca + 1.5))} 287 h${f1(d * 5)}`, 0.35, 0.7))}
      <path d="${torso}" fill="url(#ob-skin)"/>
      ${belly > 0.05 ? `<ellipse cx="80" cy="${f1(118 + 4 * belly)}" rx="${f1(W * 0.72)}" ry="${f1(10 + 9 * belly)}" fill="${shade}" opacity=".3"/>` : ''}
      ${both(d => detail(`M${X(d * (nw + 1))} 55.5 Q${X(d * S * 0.5)} 52.5 ${X(d * (S - 4))} 57`))}
      ${chest}
      <ellipse cx="80" cy="${f1(124 + 3 * belly)}" rx="1.1" ry="1.6" fill="${line}" opacity=".7"/>
      ${both(d => detail(`M${X(d * W * 0.8)} 126 Q${X(d * W * 0.45)} 134 ${X(d * 6)} 138`, 0.4))}
      <path d="${shorts}" fill="#212121"/><path d="M${X(-H - 1.5)} 140 H${X(H + 1.5)}" stroke="#3d3d3d" stroke-width="2"/>
      <path d="${armR}" fill="url(#ob-skin)"/><path d="${armR}" transform="matrix(-1 0 0 1 160 0)" fill="url(#ob-skin)"/>
      ${both(d => detail(`M${X(d * (ex - 2.5))} 112 q${f1(d * 1.5)} 1.2 ${f1(d * 3)} 0`, 0.5)
        + [-1.4, 0, 1.4].map(o => detail(`M${X(d * (hc + o))} 167 v${o ? 6 : 8}`, 0.45, 0.6)).join('')
        + `<ellipse cx="${X(d * (hc - 3.4 * lw))}" cy="164" rx="1.6" ry="4" fill="${skin}" stroke="${line}" stroke-width=".5" stroke-opacity=".6"/>`)}
      ${face}
      ${f ? `<path d="${smooth([[66, 22], [67, 9], [80, 3.5], [93, 9], [94, 22], [89, 13], [79, 11], [72, 14]])}" fill="${hair}"/>`
        : `<path d="${smooth([[66, 20], [65.5, 11], [71, 5], [80, 2.5], [89, 5], [94.5, 11], [94, 20], [91.5, 13.5], [85, 10.5], [75, 10.5], [68.5, 13.5]])}" fill="${hair}"/>`}
    </g>
  </svg>`;
}
const FOR_ALL: Condition[] = ['none', 'stones', 'kidney', 'heart', 'other'];
const FOR_WOMEN: Condition[] = ['pregnant', 'breastfeeding'];
const ACT_ICONS = { low: 'weekend', medium: 'directions_walk', high: 'directions_run' } as const satisfies Record<Activity, string>;

const SLIDES = [
  { title: 'Дусал – таны усны туслах!', text: 'Биеийн жингийн 1–2%-ийн ус алдахад л ядаргаа, толгой өвдөлт эхэлдэг. Усаа бүртгэж, зорилтоо биелүүлээрэй.' },
  { title: 'Ухаалаг суурь өөрөө тоолно', text: 'Саваа суурин дээр тавихад уусан усыг тань автоматаар бүртгэнэ. Эмч хязгаар тогтоосон бол тэр хязгаарыг дагана.' },
];

// The phone mockup on the walkthrough: the home gauge, drawn small.
const MOCK = `<svg class="ob-mock" viewBox="0 0 220 300" aria-hidden="true">
  <rect x="6" y="6" width="208" height="320" rx="34" fill="#1f2a37"/><rect x="14" y="14" width="192" height="306" rx="28" fill="#f5f5f5"/>
  <rect x="80" y="20" width="60" height="14" rx="7" fill="#1f2a37"/>
  <text x="110" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="#212121">Нүүр</text>
  <rect x="24" y="76" width="172" height="190" rx="12" fill="#fff"/>
  <path d="M60 210 A62 62 0 1 1 160 210" fill="none" stroke="#eeeeee" stroke-width="12" stroke-linecap="round"/>
  <path d="M60 210 A62 62 0 0 1 150 112" fill="none" stroke="#369fff" stroke-width="12" stroke-linecap="round"/>
  <path d="M110 120c-14 18-22 28-22 40a22 22 0 0 0 44 0c0-12-8-22-22-40z" fill="#f5f5f5"/>
  <path d="M90 162a20 20 0 0 0 40 0c0-4-1-7-2-10-12 4-24 4-38 10z" fill="#197fff"/>
  <text x="110" y="208" text-anchor="middle" font-size="20" font-weight="800" fill="#212121">1650</text>
  <rect x="64" y="228" width="72" height="22" rx="11" fill="#369fff"/><text x="100" y="243" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">Уух (300 мл)</text>
  <circle cx="152" cy="239" r="11" fill="#fff" stroke="#eeeeee"/>
</svg>`;

// The walkthrough pictures: the 3D pets from the achievements page (pet3d.ts, loaded on demand), three
// per slide, floating among bubbles. Until three.js arrives, or without WebGL, the phone mockup shows.
type PetPics = typeof import('./pet3d');
const CAST: [import('./pet').Kind, import('./pet').PetMood][][] = [
  [['cat', 'good'], ['drop', 'joyful'], ['bunny', 'good']],
  [['bear', 'joyful'], ['dragon', 'joyful'], ['unicorn', 'joyful']],
];
function cast(pics: PetPics | null, slide: number): string {
  if (!pics) return MOCK;
  try {
    const img = (kind: import('./pet').Kind, mood: import('./pet').PetMood, cls: string) =>
      `<img class="ob-pet ${cls}" src="${pics.petImage({ kind, mood, stage: 'big', shine: cls === 'mid' ? 2 : 0 }, 320)}" alt="">`;
    const [a, b, c] = CAST[slide];
    return `<div class="ob-pets" aria-hidden="true">${img(a[0], a[1], 'side l')}${img(c[0], c[1], 'side r')}${img(b[0], b[1], 'mid')}
      ${Array.from({ length: 9 }, (_, i) => `<span class="ob-bubble" style="--x:${(i * 37) % 100}%;--d:${(i % 4) * 0.9}s;--s:${8 + (i % 3) * 6}px"></span>`).join('')}</div>`;
  } catch { return MOCK; }
}
const petPic = (pics: PetPics | null, mood: import('./pet').PetMood, cls: string, fallback: string) => {
  if (!pics) return fallback;
  try { return `<img class="${cls}" src="${pics.petImage({ kind: 'drop', mood, stage: 'big', shine: 2 }, 320)}" alt="">`; } catch { return fallback; }
};

export function showOnboarding(onDone: (plan: Plan) => void): void {
  let pics: PetPics | null = null;
  const p: Profile = { ...readProfile() };
  const times = readSettings();
  let sex: Sex | null = null;
  let climate: Climate = 'mild';
  let weather = ''; // the line under the climate cards: where the choice came from
  let hUnit: 'cm' | 'ft' = 'cm';
  let wUnit: 'kg' | 'lb' = 'kg';
  let unit: Unit = 'ml';
  let custom: number | null = null; // "Тохируулах" on the result
  let screen: Screen = 'walk';
  let slide = 0;
  let step = 1;
  let name = readMember()?.name ?? '';
  let agreed = false;
  const box = document.createElement('div');
  box.className = 'onb ob';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'onb-title');
  document.body.append(box);

  const finish = (plan: Plan | null) => {
    if (plan) { writeProfile(p); writeSettings(times); about.write({ sex: sex ?? 'none', climate }); }
    markSeen();
    box.remove();
    if (plan) onDone(plan);
  };

  // A scroll-snap wheel of values; the one in the middle band is chosen (read on "continue").
  const wheel = (id: string, values: (string | number)[], current: string | number, unit = '', label: (v: string | number) => string = String) =>
    `<div class="ob-wheel" id="${id}" tabindex="0" role="listbox" aria-label="${unit || 'Сонголт'}">${values.map(v => `<div role="option" class="ob-wheel-item${v === current ? ' on' : ''}" aria-selected="${v === current}" data-v="${v}">${label(v)}${unit ? `<small>${unit}</small>` : ''}</div>`).join('')}</div>`;
  const toggle = (name: string, current: string, opts: [string, string][]) =>
    `<div class="ob-units" role="radiogroup" aria-label="Нэгж">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? 'on' : ''}" data-${name}="${v}">${l}</button>`).join('')}</div>`;
  const inches = (cm: number) => Math.round(cm / 2.54);
  const pounds = (kg: number) => Math.round(kg / 0.4536);
  const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const HOURS = range(0, 23).map(h => String(h).padStart(2, '0'));
  const MINS = range(0, 59).map(m => String(m).padStart(2, '0'));
  const timePicker = (id: string, value: string) => {
    const [h, m] = value.split(':');
    return `<div class="ob-time">${wheel(`${id}-h`, HOURS, h)}<b>:</b>${wheel(`${id}-m`, MINS, MINS.includes(m) ? m : '00')}</div>`;
  };

  const stepHead = () => `<div class="ob-step-top">
      <button type="button" class="ob-back" aria-label="Буцах">←</button>
      <div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${QUESTIONS}" aria-valuenow="${step}"><span style="width: ${(step / QUESTIONS) * 100}%"></span></div>
      <span class="ob-count">${step} / ${QUESTIONS}</span></div>`;
  const question = (title: string, text: string, body: string) => `${stepHead()}
    <h2 id="onb-title">${title}</h2><p class="ob-lead">${text}</p>${body}`;

  function stepBody(): string {
    switch (step) {
      case 1: return question('Таны хүйс?', 'Дусал таны усны төлөвлөгөөг тохируулна. Өөрийнхөө тухай бага зэрэг хэлээрэй.',
        `<div class="ob-sex">${(['male', 'female'] as const).map(s => `<button type="button" class="ob-sex-opt${sex === s ? ' on' : ''}" data-sex="${s}" aria-pressed="${sex === s}"><span aria-hidden="true">${s === 'male' ? '♂' : '♀'}</span>${s === 'male' ? 'Эрэгтэй' : 'Эмэгтэй'}</button>`).join('')}</div>
        <button type="button" class="ob-sex-skip${sex === 'none' ? ' on' : ''}" data-sex="none" aria-pressed="${sex === 'none'}">Бусад</button>`);
      case 2: return question('Таны өндөр?', 'Өндөр нь усны төлөвлөгөөг тань тохируулахад чухал. Өндрөө сонгоно уу.',
        `${toggle('hunit', hUnit, [['cm', 'см'], ['ft', 'фут']])}<div class="ob-pick">${body(sex, p.weight, p.height)}${hUnit === 'cm'
          ? wheel('ob-height', range(90, 230), p.height, 'см')
          : wheel('ob-height', range(36, 90), inches(p.height), '', v => `${Math.floor(Number(v) / 12)}′${Number(v) % 12}″`)}</div>`);
      case 3: return question('Таны жин?', 'Өдрийн усны хэмжээг голчлон биеийн жингээр тооцно. Жингээ сонгоно уу.',
        `${toggle('wunit', wUnit, [['kg', 'кг'], ['lb', 'lb']])}<div class="ob-pick">${body(sex, p.weight, p.height)}${wUnit === 'kg'
          ? wheel('ob-weight', range(10, 250), p.weight, 'кг')
          : wheel('ob-weight', range(22, 550), pounds(p.weight), 'lb')}</div>`);
      case 4: return question('Хэдэн настай вэ?', 'Нас ахих тусам цангах мэдрэмж сулардаг.', wheel('ob-age', range(4, 110), p.age, 'нас'));
      case 5: return question('Хэдэн цагт сэрдэг вэ?', 'Сануулга сэрснээс хойш эхэлнэ.', timePicker('ob-wake', times.wake));
      case 6: return question('Хэдэн цагт унтдаг вэ?', 'Унтахын өмнө сануулга ирэхгүй.', timePicker('ob-sleep', times.sleep));
      case 7: return question('Хөдөлгөөний түвшин?', 'Хөдөлгөөн их байх тусам хөлсөөр их ус алдана.',
        `<div class="ob-cards">${(Object.keys(ACTIVITIES) as Activity[]).map(a => `<button type="button" class="ob-card${p.activity === a ? ' on' : ''}" data-act="${a}" aria-pressed="${p.activity === a}"><span class="ob-card-icon">${mdIcon(ACT_ICONS[a])}</span><b>${ACTIVITIES[a].label}</b><small>${ACTIVITIES[a].hint}</small></button>`).join('')}</div>`);
      case 8: return question('Таны амьдардаг газрын уур амьсгал?', 'Халуунд хөлсөөр илүү их ус алдана. Ихэнх цагаа өнгөрөөдөг газрынхаа уур амьсгалыг сонгоно уу.',
        `<div class="ob-cards">${(Object.keys(CLIMATES) as Climate[]).map(c => `<button type="button" class="ob-climate${climate === c ? ' on' : ''}" data-climate="${c}" aria-pressed="${climate === c}"><svg viewBox="0 0 32 32" aria-hidden="true">${CLIMATES[c].icon}</svg><b>${CLIMATES[c].label}</b>${CLIMATES[c].extra ? `<small>+${CLIMATES[c].extra} мл</small>` : ''}</button>`).join('')}</div>
        ${'geolocation' in navigator ? `<button type="button" class="ob-locate" data-locate><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>Миний байршлын цаг агаараар</button>` : ''}
        <p class="ob-weather" role="status">${weather}</p>`);
      default: {
        const list = sex === 'female' ? [FOR_ALL[0], ...FOR_WOMEN, ...FOR_ALL.slice(1)] : FOR_ALL;
        const limit = p.condition === 'kidney' || p.condition === 'heart';
        return question('Биеийн онцлог?', 'Эмчийн хяналтад байгаа бол заавал сонгоорой.',
          `<div class="ob-cards">${list.map(c => `<button type="button" class="ob-card slim${p.condition === c ? ' on' : ''}" data-cond="${c}" aria-pressed="${p.condition === c}"><b>${CONDITIONS[c]}</b></button>`).join('')}</div>
          ${limit ? `<label class="ob-field">Эмчийн заасан өдрийн дээд хязгаар, мл<input id="ob-limit" type="number" inputmode="numeric" min="500" max="4000" step="50" value="${p.doctorLimit}"/></label>` : ''}
          ${p.condition === 'other' ? `<label class="ob-field">Ямар онош вэ?<input id="ob-note" type="text" maxlength="60" placeholder="Жишээ нь: чихрийн шижин" value="${escape(p.conditionNote)}"/></label>` : ''}`);
      }
    }
  }

  function view(): string {
    if (screen === 'walk') {
      const s = SLIDES[slide];
      return `<div class="ob-walk"><div class="ob-hero">${cast(pics, slide)}</div>
        <div class="ob-walk-text"><h2 id="onb-title">${s.title}</h2><p>${s.text}</p>
          <ol class="ob-dots" aria-label="${slide + 1} / ${SLIDES.length}">${SLIDES.map((_, i) => `<li class="${i === slide ? 'on' : ''}"></li>`).join('')}</ol></div>
        <div class="ob-actions"><button type="button" class="ob-ghost" data-skip>Алгасах</button><button type="button" class="ob-primary" data-next>Үргэлжлүүлэх</button></div></div>`;
    }
    if (screen === 'signup') {
      return `<div class="ob-form"><button type="button" class="ob-back" aria-label="Буцах">←</button>
        <h2 id="onb-title">Дусалд нэгдээрэй ✨</h2><p class="ob-lead left">Уусан усаа бүртгэж, сануулга тавьж, амжилтаа нээхийн тулд бүртгүүлээрэй.</p>
        <label class="ob-field">Нэр<input id="ob-name" maxlength="24" autocomplete="nickname" placeholder="Жишээ нь: Сараа" value="${escape(name)}"/></label>
        <label class="ob-field">Имэйл<input id="ob-email" type="email" autocomplete="email" placeholder="Имэйл"/></label>
        <label class="ob-field">Нууц үг<input id="ob-pass" type="password" autocomplete="new-password" placeholder="Нууц үг"/></label>
        <label class="ob-check"><input type="checkbox" id="ob-agree" ${agreed ? 'checked' : ''}/> <span>Дусалын <a href="/privacypolicy.html" target="_blank">үйлчилгээний нөхцөл</a>-ийг зөвшөөрч байна.</span></label>
        <p class="ob-or"><span>эсвэл</span></p>
        <button type="button" class="ob-social" data-google><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285f4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34a853"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" fill="#fbbc05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" fill="#ea4335"/></svg>Google-ээр үргэлжлүүлэх</button>
        <p class="ob-demo">Demo: имэйл, нууц үг хаашаа ч илгээгдэхгүй. Нэр зөвхөн энэ утсанд хадгалагдана.</p>
        <p class="ob-error" role="alert" hidden></p>
        <div class="ob-actions"><button type="button" class="ob-ghost" data-demo>Demo</button><button type="button" class="ob-primary" data-signup>Бүртгүүлэх</button></div></div>`;
    }
    if (screen === 'making') {
      return `<div class="ob-making"><h2 id="onb-title">Таны усны төлөвлөгөөг гаргаж байна…</h2><p class="ob-lead">Түр хүлээнэ үү.</p>
        ${petPic(pics, 'good', 'ob-making-pet', '')}<div class="ob-ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" pathLength="100" stroke-dasharray="0 100"/></svg><b>0%</b></div>
        <p class="ob-lead small">Хэсэг хугацаа шаардана. Усаар дүүрэн аялалдаа бэлдээрэй!</p></div>`;
    }
    if (screen === 'ready') {
      const plan = result();
      const u = UNITS[unit];
      const shown = (plan.ml / u.per).toFixed(u.digits);
      return `<div class="ob-ready"><h2 id="onb-title">${plan.mode === 'limit' ? 'Таны өдрийн хязгаар' : 'Таны өдрийн зорилт'}</h2>
        <div class="ob-units wide" role="radiogroup" aria-label="Нэгж">${(Object.keys(UNITS) as Unit[]).map(k => `<button type="button" role="radio" aria-checked="${k === unit}" class="${k === unit ? 'on' : ''}" data-unit="${k}">${UNITS[k].label}</button>`).join('')}</div>
        <span class="ob-glass" aria-hidden="true">${petPic(pics, 'joyful', 'ob-ready-pet', '<svg viewBox="0 0 48 64"><path d="M6 4h36l-4 56H10z" fill="#e3f0fd"/><path d="M8.6 22h30.8l-2.8 38H11.4z" fill="#369fff"/><circle cx="20" cy="40" r="2" fill="#fff"/><circle cx="28" cy="50" r="1.6" fill="#fff"/></svg>')}</span>
        <p class="ob-result">${unit === 'ml' ? number(plan.ml) : shown}<span>${u.label}</span></p>
        ${plan.mode === 'limit' ? '' : '<button type="button" class="ob-adjust" data-adjust>✎ Тохируулах</button>'}
        <p class="ob-lead small">${escape(plan.how)}</p>
        ${p.condition === 'other' ? `<p class="ob-warn">${p.conditionNote ? `«${escape(p.conditionNote)}»-д` : 'Таны оношид'} тохирох хэмжээг эмчээсээ асуугаарай.</p>` : ''}
        <p class="ob-demo">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана.</p>
        <div class="ob-actions single"><button type="button" class="ob-primary" data-done>Эхэлье!</button></div></div>`;
    }
    return `<div class="ob-step">${stepBody()}<div class="ob-actions single"><button type="button" class="ob-primary" data-continue>Үргэлжлүүлэх</button></div></div>`;
  }

  // calcPlan, plus a hot climate; "Тохируулах" overrides the amount (a doctor's limit stays as it is).
  function result(): Plan {
    const plan = calcPlan(p);
    if (plan.mode === 'limit') return plan;
    if (custom) return { ...plan, ml: custom, how: 'Өөрөө тохируулсан' };
    const extra = CLIMATES[climate].extra;
    return extra ? { ...plan, ml: plan.ml + extra, how: `${plan.how} + ${extra} мл (халуун уур амьсгал)` } : plan;
  }

  // "Generating…" (kit 18): the ring counts up to 100%, then the result.
  function making(): void {
    const ring = box.querySelector<HTMLElement>('.ob-ring')!;
    const start = performance.now();
    const tick = (now: number) => {
      if (!ring.isConnected) return;
      const pct = Math.min(100, Math.round(((now - start) / 2200) * 100));
      ring.querySelector('.fg')!.setAttribute('stroke-dasharray', `${pct} 100`);
      ring.querySelector('b')!.textContent = `${pct}%`;
      ring.setAttribute('aria-valuenow', String(pct));
      if (pct < 100) requestAnimationFrame(tick);
      else setTimeout(() => { screen = 'ready'; draw(); }, 250);
    };
    requestAnimationFrame(tick);
  }

  async function locate(): Promise<void> {
    weather = 'Цаг агаарыг шалгаж байна…';
    const line = box.querySelector('.ob-weather');
    if (line) line.textContent = weather;
    try {
      const got = await fetchWeather();
      climate = climateOf(got.feels);
      weather = `Өнөөдөр таны байршилд ${got.feels}°C мэт мэдрэгдэнэ → «${CLIMATES[climate].label}». Цаашид нүүр хуудас өдөр бүр шалгана.`;
    } catch (err) {
      weather = (err as GeolocationPositionError)?.code === 1
        ? 'Байршлын зөвшөөрөл өгөөгүй. Доороос сонгоно уу.'
        : 'Байршил авч чадсангүй. Доороос сонгоно уу.';
    }
    if (screen === 'step' && step === 8) draw();
  }

  function draw(): void {
    box.innerHTML = `<div class="ob-screen">${view()}</div>`;
    bind();
    box.querySelectorAll<HTMLElement>('.ob-wheel').forEach(centerWheel);
    box.querySelector<HTMLElement>('#ob-name, .ob-primary')?.focus();
  }

  // Wheels: scroll the chosen value into the middle, and mark whichever value sits there.
  const ITEM = 52;
  function centerWheel(w: HTMLElement): void {
    const items = [...w.querySelectorAll<HTMLElement>('.ob-wheel-item')];
    const on = Math.max(0, items.findIndex(i => i.classList.contains('on')));
    w.scrollTop = on * ITEM;
    let t: ReturnType<typeof setTimeout>;
    w.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM)));
        items.forEach((it, i) => { it.classList.toggle('on', i === idx); it.setAttribute('aria-selected', String(i === idx)); });
      }, 80);
      // The figure follows the value under the band while the wheel is still moving.
      if (w.id === 'ob-height' || w.id === 'ob-weight') {
        const v = items[Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM)))].dataset.v!;
        redrawBody(w.id === 'ob-height' ? { height: hUnit === 'cm' ? Number(v) : Math.round(Number(v) * 2.54) } : { weight: wUnit === 'kg' ? Number(v) : Math.round(Number(v) * 0.4536) });
      }
    }, { passive: true });
    w.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      w.scrollBy({ top: e.key === 'ArrowUp' ? -ITEM : ITEM });
    });
  }
  let bodyFrame = 0;
  function redrawBody(change: { height?: number; weight?: number }): void {
    cancelAnimationFrame(bodyFrame);
    bodyFrame = requestAnimationFrame(() => {
      const fig = box.querySelector('.ob-body');
      if (fig) fig.outerHTML = body(sex, change.weight ?? p.weight, change.height ?? p.height);
    });
  }
  const picked = (id: string) => box.querySelector<HTMLElement>(`#${id} .ob-wheel-item.on`)?.dataset.v;

  const readStep = () => {
    const h = picked('ob-height'), w = picked('ob-weight');
    if (step === 2 && h) p.height = hUnit === 'cm' ? Number(h) : Math.round(Number(h) * 2.54);
    if (step === 3 && w) p.weight = wUnit === 'kg' ? Number(w) : Math.round(Number(w) * 0.4536);
    if (step === 4) p.age = Number(picked('ob-age') ?? p.age);
    if (step === 5) times.wake = `${picked('ob-wake-h') ?? '07'}:${picked('ob-wake-m') ?? '00'}`;
    if (step === 6) times.sleep = `${picked('ob-sleep-h') ?? '22'}:${picked('ob-sleep-m') ?? '00'}`;
    const limit = box.querySelector<HTMLInputElement>('#ob-limit');
    if (limit) { const v = Math.round(Number(limit.value) / 50) * 50; if (v >= 500 && v <= 4000) p.doctorLimit = v; }
    const note = box.querySelector<HTMLInputElement>('#ob-note');
    if (note) p.conditionNote = note.value.trim().slice(0, 60);
  };

  function bind(): void {
    const on = (sel: string, fn: (el: HTMLElement) => void) => box.querySelectorAll<HTMLElement>(sel).forEach(el => el.addEventListener('click', () => fn(el)));
    on('[data-skip]', () => { screen = 'signup'; draw(); });
    on('[data-next]', () => { if (slide < SLIDES.length - 1) slide += 1; else screen = 'signup'; draw(); });
    on('.ob-back', () => {
      if (screen === 'signup') screen = 'walk';
      else if (screen === 'step') { readStep(); if (step > 1) step -= 1; else screen = 'signup'; }
      draw();
    });
    // Google fills the name from the picked account; choosing it counts as accepting the terms.
    on('[data-google]', el => void (async () => {
      const error = box.querySelector<HTMLElement>('.ob-error')!;
      error.hidden = true;
      (el as HTMLButtonElement).disabled = true;
      try {
        const user = await signInWithGoogle();
        name = user.name || box.querySelector<HTMLInputElement>('#ob-name')!.value.trim() || 'Найз';
        agreed = true;
        saveMember(name);
        screen = 'step'; step = 1; draw();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : 'Google-ээр нэвтэрч чадсангүй.';
        error.hidden = false;
        (el as HTMLButtonElement).disabled = false;
      }
    })());
    on('[data-signup]', () => {
      name = box.querySelector<HTMLInputElement>('#ob-name')!.value;
      agreed = box.querySelector<HTMLInputElement>('#ob-agree')!.checked;
      const error = box.querySelector<HTMLElement>('.ob-error')!;
      if (!name.trim()) { error.textContent = 'Нэрээ бичнэ үү.'; error.hidden = false; return; }
      if (!agreed) { error.textContent = 'Үйлчилгээний нөхцөлийг зөвшөөрнө үү.'; error.hidden = false; return; }
      saveMember(name);
      screen = 'step'; step = 1; draw();
    });
    // Demo: skip the form; the typed name is kept, otherwise "Demo".
    on('[data-demo]', () => {
      saveMember(box.querySelector<HTMLInputElement>('#ob-name')!.value.trim() || 'Demo');
      screen = 'step'; step = 1; draw();
    });
    on('[data-sex]', el => { sex = el.dataset.sex as Sex; if (sex !== 'female' && FOR_WOMEN.includes(p.condition)) p.condition = 'none'; draw(); });
    on('[data-hunit]', el => { readStep(); hUnit = el.dataset.hunit as 'cm' | 'ft'; draw(); });
    on('[data-wunit]', el => { readStep(); wUnit = el.dataset.wunit as 'kg' | 'lb'; draw(); });
    on('[data-climate]', el => { climate = el.dataset.climate as Climate; weather = ''; draw(); });
    on('[data-locate]', () => void locate());
    on('[data-unit]', el => { unit = el.dataset.unit as Unit; draw(); });
    on('[data-adjust]', () => openAmountSheet('Өдрийн зорилт', '💧', result().ml, ml => { custom = Math.max(500, Math.min(5000, Math.round(ml / 50) * 50)); draw(); }));
    on('[data-act]', el => { p.activity = el.dataset.act as Activity; draw(); });
    on('[data-cond]', el => { readStep(); p.condition = el.dataset.cond as Condition; draw(); });
    on('[data-continue]', () => {
      readStep();
      if (step < QUESTIONS) {
        step += 1; draw();
        // Already allowed once: fill the climate in without asking again.
        if (step === 8 && !weather) void navigator.permissions?.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') void locate(); }).catch(() => {});
        return;
      }
      screen = 'making'; draw(); making();
    });
    on('[data-done]', () => finish(result()));
  }

  draw();
  void import('./pet3d').then(m => { pics = m; if (screen === 'walk' || screen === 'ready') draw(); }).catch(() => { /* keeps the phone mockup */ });
}
