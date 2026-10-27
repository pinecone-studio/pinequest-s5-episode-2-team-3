import { dayKey, type WaterEntry } from './data';
import { escape, number } from './format';
import { dayCounter } from './hydration';

// «Дусалхан», a Tamagotchi-style pet tied to the streak, the centre of the achievements page.
// Everything about it is worked out from the water log, so sync, deletes and undo can never leave it
// out of step; only its name and which animal it is are stored. It grows with every day that counted and never shrinks, gets
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

export interface PetState { stage: Stage; mood: PetMood; streak: number; best: number; days: number; nextStageIn: number | null; line: string }

// Animals unlock by the longest streak ever, so a broken streak never takes one back. Kept in order of
// `need`. Tags group them in the collection: the drop's friends, the 12-year animals (12 жил) and the
// five kinds of herd animals (5 хошуу мал); some belong to two groups.
export const GROUPS = { friends: 'Дусал найзууд', zodiac: '12 жил', herd: '5 хошуу мал' } as const;
export type Group = keyof typeof GROUPS;
export const KINDS = [
  { id: 'drop', name: 'Дусал', need: 0, tags: ['friends'] },
  { id: 'mouse', name: 'Хулгана', need: 2, tags: ['zodiac'] },
  { id: 'cat', name: 'Муур', need: 3, tags: ['friends'] },
  { id: 'rooster', name: 'Тахиа', need: 4, tags: ['zodiac'] },
  { id: 'frog', name: 'Мэлхий', need: 5, tags: ['friends'] },
  { id: 'dog', name: 'Нохой', need: 6, tags: ['zodiac'] },
  { id: 'bear', name: 'Баавгай', need: 7, tags: ['friends'] },
  { id: 'pig', name: 'Гахай', need: 8, tags: ['zodiac'] },
  { id: 'penguin', name: 'Оцон шувуу', need: 10, tags: ['friends'] },
  { id: 'monkey', name: 'Бич', need: 12, tags: ['zodiac'] },
  { id: 'goat', name: 'Ямаа', need: 13, tags: ['herd'] },
  { id: 'bunny', name: 'Туулай', need: 14, tags: ['zodiac', 'friends'] },
  { id: 'snake', name: 'Могой', need: 18, tags: ['zodiac'] },
  { id: 'whale', name: 'Халим', need: 21, tags: ['friends'] },
  { id: 'horse', name: 'Морь', need: 25, tags: ['zodiac', 'herd'] },
  { id: 'sheep', name: 'Хонь', need: 30, tags: ['zodiac', 'herd'] },
  { id: 'cow', name: 'Үхэр', need: 35, tags: ['zodiac', 'herd'] },
  { id: 'tiger', name: 'Бар', need: 40, tags: ['zodiac'] },
  { id: 'unicorn', name: 'Ганц эвэрт', need: 45, tags: ['friends'] },
  { id: 'camel', name: 'Тэмээ', need: 50, tags: ['herd'] },
  { id: 'dragon', name: 'Луу', need: 60, tags: ['zodiac'] },
  { id: 'legend', name: 'Домогт Дусал', need: 100, tags: ['friends'] },
] as const satisfies readonly { id: string; name: string; need: number; tags: readonly Group[] }[];
export type Kind = (typeof KINDS)[number]['id'];
export const unlockedKinds = (best: number): Kind[] => KINDS.filter(k => best >= k.need).map(k => k.id);
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

// The picked animal, if it is still unlocked (a deleted log can lower the best streak); otherwise the drop.
const KIND_KEY = 'dusal-pet-kind-v1';
export function readPetKind(best: number): Kind {
  try { const v = localStorage.getItem(KIND_KEY) as Kind | null; return v && unlockedKinds(best).includes(v) ? v : 'drop'; } catch { return 'drop'; }
}
export function writePetKind(kind: Kind): void {
  try { if (kind === 'drop') localStorage.removeItem(KIND_KEY); else localStorage.setItem(KIND_KEY, kind); } catch { /* keeps the drop next time */ }
}
// Animals unlocked since this phone last showed the list, for a one-time «Шинэ!».
const SEEN_KEY = 'dusal-pet-seen-v1';
export function takeNewKinds(best: number): Kind[] {
  const open = unlockedKinds(best).filter(k => k !== 'drop');
  try {
    const seen: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    localStorage.setItem(SEEN_KEY, JSON.stringify(open));
    return open.filter(k => !(Array.isArray(seen) && seen.includes(k)));
  } catch { return []; }
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
  let best = 0, run = 0, prev = '';
  for (const k of logged.filter(met)) {
    const after = new Date(`${prev}T12:00`); after.setDate(after.getDate() + 1);
    run = prev && dayKey(after) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }

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
  return { stage, mood, streak, best, days, nextStageIn, line };
}

export const petLabel = (p: PetState, name: string, kind: Kind = 'drop') =>
  `${name}, ${kind === 'drop' ? '' : `${KINDS.find(k => k.id === kind)!.name.toLowerCase()}, `}${STAGES.find(s => s.id === p.stage)!.name.toLowerCase()} шат, ${MOODS[p.mood].toLowerCase()}`;

// The pet as SVG (viewBox 200×200): a water drop like the home's «Дусал» buddy, bigger at each stage,
// or an egg before the first day that counted. Moods change the face, colour and a few extras. Every
// animal is the same drop with its own ears and features (and colour, in theme.css), so they stay one family.
// The wrapping groups carry no transform attribute, so the CSS breathing and blinking can animate them.
const BODY = 'M100 26 C100 26 46 100 46 136 A54 54 0 0 0 154 136 C154 100 100 26 100 26Z';
const SCALE: Record<Stage, number> = { egg: 1, baby: 0.62, kid: 0.76, big: 0.9, giant: 1 };
// Big glossy eyes (a dark gradient with two glints) give the toy-like 3D look; happy and unwell moods
// close them into lines instead.
const eye = (x: number, y: number, r: number) =>
  `<ellipse class="pet-eye" cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.18}"/><circle class="pet-glint" cx="${x + r * 0.35}" cy="${y - r * 0.45}" r="${r * 0.38}"/><circle class="pet-glint" cx="${x - r * 0.35}" cy="${y + r * 0.4}" r="${r * 0.17}"/>`;
const EYES: Record<PetMood, string> = {
  joyful: '<path class="pet-ln thick" d="M72 130 q10 -12 20 0 M108 130 q10 -12 20 0"/>',
  good: eye(81, 124, 12.5) + eye(119, 124, 12.5),
  thirsty: eye(81, 127, 10.5) + eye(119, 127, 10.5),
  sick: '<path class="pet-ln" d="M76 128 q7 5 14 0 M110 128 q7 5 14 0"/>',
  weak: '<path class="pet-ln" d="M76 130 h14 M110 130 h14"/>',
};
const MOUTH: Record<PetMood, string> = {
  joyful: '<path class="pet-mouth-fill" d="M86 145 Q100 164 114 145 Z"/>',
  good: '<path class="pet-ln" d="M92 148 Q100 155 108 148"/>',
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
// Per animal: `back` is drawn behind the body, `top` over it (both turn with it when it lies down),
// `face` with the face. Paths with class pet-body take the body's gradient.
const FEATURES: Record<Kind, { back?: string; top?: string; face?: string }> = {
  drop: {},
  cat: {
    back: '<path class="pet-body" d="M62 106 L56 62 L90 88Z"/><path class="pet-body" d="M138 106 L144 62 L110 88Z"/><path class="pet-ear-in" d="M66 96 L63 74 L81 88Z"/><path class="pet-ear-in" d="M134 96 L137 74 L119 88Z"/>',
    face: '<path class="pet-nose" d="M95 138 h10 l-5 5Z"/><path class="pet-whisker" d="M64 144 H40 M64 151 L42 158 M136 144 H160 M136 151 L158 158"/>',
  },
  bear: {
    back: '<circle class="pet-body" cx="64" cy="94" r="17"/><circle class="pet-body" cx="136" cy="94" r="17"/><circle class="pet-ear-in" cx="64" cy="94" r="8"/><circle class="pet-ear-in" cx="136" cy="94" r="8"/>',
    face: '<ellipse class="pet-snout" cx="100" cy="149" rx="19" ry="13"/><ellipse class="pet-nose" cx="100" cy="142" rx="6" ry="4"/>',
  },
  bunny: {
    back: '<ellipse class="pet-body" cx="80" cy="52" rx="12" ry="36" transform="rotate(-14 80 52)"/><ellipse class="pet-body" cx="120" cy="52" rx="12" ry="36" transform="rotate(14 120 52)"/><ellipse class="pet-ear-in" cx="80" cy="54" rx="5" ry="25" transform="rotate(-14 80 54)"/><ellipse class="pet-ear-in" cx="120" cy="54" rx="5" ry="25" transform="rotate(14 120 54)"/>',
    face: '<ellipse class="pet-nose pink" cx="100" cy="140" rx="5" ry="3.5"/>',
  },
  sheep: {
    back: '<ellipse class="pet-dark" cx="46" cy="112" rx="15" ry="7" transform="rotate(-24 46 112)"/><ellipse class="pet-dark" cx="154" cy="112" rx="15" ry="7" transform="rotate(24 154 112)"/>',
    top: '<g class="pet-wool"><circle cx="76" cy="74" r="17"/><circle cx="100" cy="58" r="19"/><circle cx="124" cy="74" r="17"/><circle cx="64" cy="96" r="13"/><circle cx="136" cy="96" r="13"/><circle cx="100" cy="84" r="17"/></g>',
  },
  dragon: {
    back: '<path class="pet-body" d="M52 124 Q20 110 16 80 Q34 92 46 88 Q44 104 58 112Z"/><path class="pet-body" d="M148 124 Q180 110 184 80 Q166 92 154 88 Q156 104 142 112Z"/><path class="pet-horn" d="M80 78 Q66 56 78 40 Q80 60 92 70Z"/><path class="pet-horn" d="M120 78 Q134 56 122 40 Q120 60 108 70Z"/>',
    face: '<circle class="pet-dark" cx="92" cy="139" r="1.8"/><circle class="pet-dark" cx="108" cy="139" r="1.8"/>',
  },
  mouse: { back: '<circle class="pet-body" cx="58" cy="92" r="20"/><circle class="pet-body" cx="142" cy="92" r="20"/><circle class="pet-ear-in" cx="58" cy="92" r="11"/><circle class="pet-ear-in" cx="142" cy="92" r="11"/>', face: '<ellipse class="pet-nose pink" cx="100" cy="140" rx="5" ry="3.5"/>' },
  rooster: { back: '<circle class="pet-comb" cx="92" cy="30" r="9"/><circle class="pet-comb" cx="104" cy="24" r="10"/><circle class="pet-comb" cx="114" cy="34" r="8"/>', face: '<path class="pet-beak" d="M93 138 h14 l-7 9Z"/>' },
  dog: { back: '<ellipse class="pet-dark" cx="56" cy="118" rx="12" ry="26" transform="rotate(16 56 118)"/><ellipse class="pet-dark" cx="144" cy="118" rx="12" ry="26" transform="rotate(-16 144 118)"/>', face: '<ellipse class="pet-nose" cx="100" cy="141" rx="6" ry="4"/>' },
  pig: { back: '<path class="pet-body" d="M66 100 L62 72 L88 90Z"/><path class="pet-body" d="M134 100 L138 72 L112 90Z"/>', face: '<ellipse class="pet-snout pink" cx="100" cy="148" rx="13" ry="9"/>' },
  monkey: { back: '<circle class="pet-body" cx="48" cy="128" r="16"/><circle class="pet-body" cx="152" cy="128" r="16"/>', top: '<ellipse class="pet-snout" cx="100" cy="138" rx="34" ry="28"/>' },
  goat: { back: '<path class="pet-horn" d="M84 74 q-14 -24 -2 -40 q-2 22 10 34Z"/><path class="pet-horn" d="M116 74 q14 -24 2 -40 q2 22 -10 34Z"/>', face: '<path class="pet-snout" d="M94 168 l6 18 l6 -18Z"/>' },
  snake: { back: '<ellipse class="pet-body" cx="100" cy="184" rx="66" ry="12"/>', face: '<path class="pet-tongue" d="M100 156 v10 l-4 5 M100 166 l4 5"/>' },
  horse: { back: '<circle class="pet-dark" cx="128" cy="70" r="9"/><circle class="pet-dark" cx="138" cy="88" r="9"/><circle class="pet-dark" cx="144" cy="106" r="9"/>', top: '<ellipse class="pet-snout" cx="100" cy="156" rx="26" ry="16"/>' },
  cow: { back: '<path class="pet-horn" d="M80 80 q-18 -10 -18 -26 q8 12 22 18Z"/><path class="pet-horn" d="M120 80 q18 -10 18 -26 q-8 12 -22 18Z"/>', top: '<circle class="pet-dark" cx="70" cy="160" r="9"/><circle class="pet-dark" cx="128" cy="96" r="8"/>', face: '<ellipse class="pet-snout pink" cx="100" cy="154" rx="20" ry="12"/>' },
  tiger: { back: '<circle class="pet-body" cx="66" cy="92" r="15"/><circle class="pet-body" cx="134" cy="92" r="15"/>', top: '<path class="pet-stripe" d="M54 136 h14 M52 152 h14 M132 136 h14 M134 152 h14 M100 84 v12 M88 88 v8 M112 88 v8"/>' },
  camel: { back: '<circle class="pet-body" cx="70" cy="96" r="22"/><circle class="pet-body" cx="130" cy="96" r="22"/>', top: '<path class="pet-cloth" d="M60 112 h80 l-8 16 h-64Z"/>' },
  frog: {
    back: '<circle class="pet-body" cx="74" cy="84" r="16"/><circle class="pet-body" cx="126" cy="84" r="16"/><circle class="pet-snout" cx="74" cy="84" r="8"/><circle class="pet-snout" cx="126" cy="84" r="8"/>',
  },
  penguin: {
    top: '<ellipse class="pet-snout" cx="100" cy="146" rx="38" ry="40"/>',
    face: '<path class="pet-beak" d="M92 140 h16 l-8 9Z"/>',
  },
  whale: {
    back: '<path class="pet-spout" d="M100 26 q-6 -14 -16 -16 M100 26 q6 -14 16 -16 M100 26 v-18"/>',
    top: '<ellipse class="pet-snout" cx="100" cy="168" rx="34" ry="14"/>',
  },
  unicorn: {
    back: '<path class="pet-horn" d="M100 18 L108 52 L92 52Z"/><circle class="pet-mane" cx="132" cy="74" r="9"/><circle class="pet-mane b" cx="140" cy="92" r="9"/><circle class="pet-mane c" cx="146" cy="110" r="9"/>',
  },
  legend: {
    back: '<ellipse class="pet-halo" cx="100" cy="30" rx="30" ry="8"/><path class="pet-body" d="M54 120 Q18 96 28 62 Q44 84 60 86 Q50 104 62 114Z"/><path class="pet-body" d="M146 120 Q182 96 172 62 Q156 84 140 86 Q150 104 138 114Z"/>',
    top: '<path class="pet-gem" d="M100 82 l9 12 l-9 12 l-9 -12Z"/>',
  },
};

// `decorative` hides it from screen readers where the text next to it already names it (the animal list).
export function petSvg(p: PetState, name: string, id: string, kind: Kind = 'drop', decorative = false): string {
  const a11y = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escape(petLabel(p, name, kind))}"`;
  // Lit from the upper left like a soft toy: a light spot, the body colour, a deeper edge.
  const grad = `<defs><radialGradient id="${id}-g" cx=".38" cy=".34" r=".78" fx=".32" fy=".24"><stop class="pet-stop-light" offset="0"/><stop class="pet-stop-top" offset=".38"/><stop class="pet-stop-bottom" offset="1"/></radialGradient>
    <linearGradient id="${id}-d" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#002a6b" stop-opacity="0"/><stop offset="1" stop-color="#002a6b" stop-opacity=".18"/></linearGradient></defs>`;
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
  const f = FEATURES[kind];
  const fill = `class="pet-body" fill="url(#${id}-g)"`;
  // Little arms and feet peek out behind the body; happy, the arms go up and one waves.
  const up = p.mood === 'joyful';
  const limbs = `<ellipse ${fill} cx="80" cy="185" rx="14" ry="8"/><ellipse ${fill} cx="120" cy="185" rx="14" ry="8"/>
    <g class="pet-arm l"><ellipse ${fill} cx="46" cy="${up ? 128 : 152}" rx="9" ry="14" transform="rotate(${up ? -35 : 28} 46 ${up ? 128 : 152})"/></g>
    <g class="pet-arm r"><ellipse ${fill} cx="154" cy="${up ? 128 : 152}" rx="9" ry="14" transform="rotate(${up ? 35 : -28} 154 ${up ? 128 : 152})"/></g>`;
  return `<svg class="pet pet-${p.stage} kind-${kind} mood-${p.mood}" viewBox="0 0 200 200" ${a11y}>${grad}${shadow}
    ${p.mood === 'joyful' ? SPARKS : ''}${lie ? ZZZ : ''}
    <g class="pet-breathe"><g transform="translate(100 190) scale(${s}) translate(-100 -190)">
      <g${lie ? ' transform="translate(-28 0) rotate(90 100 136)"' : ''}>
        ${limbs}${(f.back ?? '').replaceAll('class="pet-body"', fill)}
        <path ${fill} d="${BODY}"/><path class="pet-depth" fill="url(#${id}-d)" d="${BODY}"/>
        ${f.top ?? ''}
        <ellipse class="pet-gloss" cx="74" cy="106" rx="10" ry="21" transform="rotate(26 74 106)"/><circle class="pet-gloss" cx="88" cy="74" r="4.5"/>
        <path class="pet-rim" d="M66 166 Q100 194 134 166"/>
        ${p.stage === 'giant' && !lie ? CROWN : ''}
      </g>
      <g${lie ? ' transform="translate(-28 6)"' : ''}>
        <g class="pet-eyes">${EYES[p.mood]}</g>
        ${p.mood === 'joyful' || p.mood === 'good' ? '<ellipse class="pet-blush" cx="70" cy="146" rx="8" ry="4.5"/><ellipse class="pet-blush" cx="130" cy="146" rx="8" ry="4.5"/>' : ''}
        ${f.face ?? ''}${MOUTH[p.mood]}${EXTRA[p.mood]}
      </g>
    </g></g></svg>`;
}
