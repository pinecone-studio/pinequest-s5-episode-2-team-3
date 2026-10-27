import { dayKey, type WaterEntry } from './data';
import { escape, number } from './format';
import { dayCounter } from './hydration';

// «Дусалхан», a Tamagotchi-style pet tied to the streak, the centre of the achievements page.
// Everything about it is worked out from the water log, so sync, deletes and undo can never leave it
// out of step; only its name is stored. It grows with every day that counted and never shrinks, gets
// thirsty while today is still open, sick the day after the streak breaks and falls asleep after days
// away. It never dies: one day that counts brings it back. Meant to cheer people on, not to scare them.
export const STAGES = [
  { id: 'egg', name: 'Өндөг', from: 0 },
  { id: 'baby', name: 'Нялх', from: 1 },
  { id: 'kid', name: 'Бага', from: 7 },
  { id: 'big', name: 'Том', from: 21 },
  { id: 'giant', name: 'Аварга', from: 60 },
] as const;
export type Stage = (typeof STAGES)[number]['id'];
export type PetMood = 'joyful' | 'good' | 'thirsty' | 'sick' | 'weak';
export const MOODS: Record<PetMood, string> = { joyful: 'Баяртай', good: 'Сайн', thirsty: 'Цангаж байна', sick: 'Өвдсөн', weak: 'Маш муу' };

export interface PetState { stage: Stage; mood: PetMood; streak: number; days: number; nextStageIn: number | null; line: string }
type Mode = 'goal' | 'limit';

export const DEFAULT_PET_NAME = 'Дусалхан';
const NAME_KEY = 'dusal-pet-name-v1';
export function readPetName(): string {
  try { return localStorage.getItem(NAME_KEY)?.trim().slice(0, 20) || DEFAULT_PET_NAME; } catch { return DEFAULT_PET_NAME; }
}
export function writePetName(name: string): void {
  const v = name.trim().slice(0, 20);
  try { if (v && v !== DEFAULT_PET_NAME) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY); } catch { /* keeps the default next time */ }
}

const amount = (ml: number) => (ml >= 1000 ? `${Number((ml / 1000).toFixed(1))} л` : `${number(ml)} мл`);

// Under a doctor's limit a day counts when drinks were logged and stayed within it (dayCounter), so the
// pet never asks for more water there: it is never thirsty, and its lines talk about keeping the limit.
export function petState(events: readonly WaterEntry[], goal: number, mode: Mode, now = new Date(), name = DEFAULT_PET_NAME): PetState {
  const met = dayCounter(events, goal, mode);
  const day = (back: number) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - back); return dayKey(d); };
  const today = day(0);
  const drinks = events.filter(e => e.type === 'drink');
  const drunkOn = (k: string) => drinks.reduce((sum, e) => (dayKey(new Date(e.at)) === k ? sum + e.amount : sum), 0);
  const logged = [...new Set(drinks.map(e => dayKey(new Date(e.at))))].filter(k => k <= today).sort();
  const days = logged.filter(met).length;
  // Counted the same way as the streak chip: an unfinished today never breaks it.
  let streak = 0;
  for (let back = met(today) ? 0 : 1; met(day(back)); back++) streak++;
  // Days in a row before today that did not count; days before the first log are not missed.
  let missed = 0;
  if (logged.length) for (let back = 1; day(back) >= logged[0] && !met(day(back)); back++) missed++;

  const at = STAGES.filter(s => days >= s.from).length - 1;
  const stage = STAGES[at].id;
  const next = STAGES[at + 1];
  const nextStageIn = next ? next.from - days : null;

  const n = name;
  const keep = mode === 'limit' ? 'хязгаартаа багтаавал' : 'зорилтоо биелүүлбэл';
  let mood: PetMood;
  let line: string;
  if (!days) {
    mood = 'good';
    line = `Өндөг дулаахан байна. Нэг өдөр ${keep} ${n} төрнө.`;
  } else if (met(today)) {
    mood = streak >= 3 ? 'joyful' : 'good';
    line = streak >= 3 ? `${n} баяртай байна — ${streak} өдөр дараалан!`
      : `${mode === 'limit' ? 'Өнөөдөр хязгаартаа багтлаа' : 'Өнөөдрийн зорилт биеллээ'}. ${n} сэтгэл хангалуун байна.`;
  } else if (missed >= 3) {
    mood = 'weak';
    line = `${n} ${missed} өдөр усгүй ядраад унтчихлаа. Өнөөдөр ${keep} сэрнэ.`;
  } else if (missed) {
    mood = 'sick';
    const why = mode === 'limit' ? 'Өчигдрийн өдөр тоологдсонгүй' : drunkOn(day(1)) ? 'Өчигдөр зорилт биелээгүй' : 'Өчигдөр уугаагүй';
    line = `${why} тул ${n} өвдчихлөө. Өнөөдөр ${mode === 'limit' ? 'хязгаартаа багтаагаад' : 'зорилтоо биелүүлээд'} эдгээгээрэй.`;
  } else if (mode === 'goal') {
    mood = 'thirsty';
    line = `${n} цангаж байна — өнөөдөр ${amount(Math.max(0, goal - drunkOn(today)))} дутуу`;
  } else {
    mood = streak >= 3 ? 'joyful' : 'good';
    line = `Өнөөдрийн усаа бүртгэж, хязгаартаа багтаагаарай. ${n} хүлээж байна.`;
  }
  return { stage, mood, streak, days, nextStageIn, line };
}

export const petLabel = (p: PetState, name: string) =>
  `${name}, ${STAGES.find(s => s.id === p.stage)!.name.toLowerCase()} шат, ${MOODS[p.mood].toLowerCase()}`;

// The pet as SVG (viewBox 200×200): a water drop like the home's «Дусал» buddy, bigger at each stage,
// or an egg before the first day that counted. Moods change the face, colour and a few extras.
// The wrapping groups carry no transform attribute, so the CSS breathing and blinking can animate them.
const BODY = 'M100 26 C100 26 46 100 46 136 A54 54 0 0 0 154 136 C154 100 100 26 100 26Z';
const SCALE: Record<Stage, number> = { egg: 1, baby: 0.62, kid: 0.76, big: 0.9, giant: 1 };
const EYES: Record<PetMood, string> = {
  joyful: '<path class="pet-ln" d="M76 130 q7 -9 14 0 M110 130 q7 -9 14 0"/>',
  good: '<circle cx="83" cy="128" r="7"/><circle cx="117" cy="128" r="7"/><circle class="pet-glint" cx="85.5" cy="125.5" r="2.4"/><circle class="pet-glint" cx="119.5" cy="125.5" r="2.4"/>',
  thirsty: '<circle cx="83" cy="129" r="6.5"/><circle cx="117" cy="129" r="6.5"/><circle class="pet-glint" cx="85" cy="127" r="2.2"/><circle class="pet-glint" cx="119" cy="127" r="2.2"/>',
  sick: '<path class="pet-ln" d="M76 128 q7 5 14 0 M110 128 q7 5 14 0"/>',
  weak: '<path class="pet-ln" d="M76 130 h14 M110 130 h14"/>',
};
const MOUTH: Record<PetMood, string> = {
  joyful: '<path class="pet-mouth-fill" d="M86 145 Q100 164 114 145 Z"/>',
  good: '<path class="pet-ln" d="M88 147 Q100 157 112 147"/>',
  thirsty: '<ellipse class="pet-mouth-fill" cx="100" cy="152" rx="5" ry="6"/>',
  sick: '<path class="pet-ln" d="M88 154 q6 -5 12 0 q6 5 12 0"/>',
  weak: '<path class="pet-ln" d="M93 152 h14"/>',
};
const EXTRA: Record<PetMood, string> = {
  joyful: '',
  good: '',
  thirsty: '<path class="pet-ln" d="M72 113 l14 -5 M128 113 l-14 -5"/><path class="pet-sweat" d="M150 96 q-6 9 0 13 q6 -4 0 -13Z"/>',
  sick: '<g class="pet-thermo"><rect x="106" y="148" width="34" height="6" rx="3" transform="rotate(-24 106 151)"/><circle cx="108" cy="151" r="5"/></g>',
  weak: '',
};
const SPARKS = '<g class="pet-spark"><path d="M34 70 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4Z"/><path d="M160 46 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3Z"/><path d="M168 132 l2.5 -6 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5Z"/></g>';
const ZZZ = '<g class="pet-zzz"><text x="128" y="70">Z</text><text x="146" y="52" font-size="15">z</text><text x="160" y="38" font-size="11">z</text></g>';
const CROWN = '<path class="pet-crown" d="M86 34 l5 -17 l9 10 l9 -10 l5 17Z"/>';

export function petSvg(p: PetState, name: string, id: string): string {
  const a11y = `role="img" aria-label="${escape(petLabel(p, name))}"`;
  const grad = `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop class="pet-stop-top" offset="0"/><stop class="pet-stop-bottom" offset="1"/></linearGradient></defs>`;
  const shadow = '<ellipse class="pet-shadow" cx="100" cy="192" rx="56" ry="6"/>';
  if (p.stage === 'egg') {
    return `<svg class="pet pet-egg mood-good" viewBox="0 0 200 200" ${a11y}>${grad}${shadow}
      <g class="pet-breathe"><path class="pet-body" fill="url(#${id}-g)" d="M100 40 C66 40 52 104 52 138 a48 48 0 0 0 96 0 C148 104 134 40 100 40Z"/>
        <circle class="pet-spot" cx="78" cy="96" r="7"/><circle class="pet-spot" cx="126" cy="78" r="5"/><circle class="pet-spot" cx="128" cy="160" r="6"/>
        <path class="pet-crack" d="M60 128 l12 -8 l10 8 l12 -9 l12 9 l12 -8 l10 8 l12 -6"/>
        <g class="pet-eyes"><circle cx="88" cy="142" r="5"/><circle cx="112" cy="142" r="5"/></g><path class="pet-ln" d="M94 156 q6 5 12 0"/></g></svg>`;
  }
  const s = SCALE[p.stage];
  // Asleep it lies on its side; the face stays upright on the round end.
  const lie = p.mood === 'weak';
  return `<svg class="pet pet-${p.stage} mood-${p.mood}" viewBox="0 0 200 200" ${a11y}>${grad}${shadow}
    ${p.mood === 'joyful' ? SPARKS : ''}${lie ? ZZZ : ''}
    <g class="pet-breathe"><g transform="translate(100 190) scale(${s}) translate(-100 -190)">
      <g${lie ? ' transform="translate(-28 0) rotate(90 100 136)"' : ''}>
        <path class="pet-body" fill="url(#${id}-g)" d="${BODY}"/>
        <path class="pet-shine" d="M76 92 Q62 112 60 132"/>
        ${p.stage === 'giant' && !lie ? CROWN : ''}
      </g>
      <g${lie ? ' transform="translate(-28 6)"' : ''}>
        <g class="pet-eyes">${EYES[p.mood]}</g>
        ${p.mood === 'joyful' || p.mood === 'good' ? '<ellipse class="pet-blush" cx="70" cy="146" rx="8" ry="4.5"/><ellipse class="pet-blush" cx="130" cy="146" rx="8" ry="4.5"/>' : ''}
        ${MOUTH[p.mood]}${EXTRA[p.mood]}
      </g>
    </g></g></svg>`;
}
