import type { Kind } from './drinks';

// TODO: нефрологич / хоол зүйчээр хянуулах.
// Drinks worth knowing about on dialysis: a short tag in the drink sheet, and the first time a longer
// note. They only inform; nothing here blocks an entry.
export interface Flag { tag: string; title: string; text: string }
export const FLAGS: Partial<Record<Kind, Flag>> = {
  juice: {
    tag: 'Калий ихтэй',
    title: 'Жүүсэнд калий их байдаг.',
    text: 'Бөөр сайн ажиллахгүй үед цусан дахь калий ихсэж, зүрхний хэмд нөлөөлж болно. Хэр их уух нь зүгээрийг эмчээсээ асуугаарай.',
  },
  soda: {
    tag: 'Фосфор ихтэй',
    title: 'Кола, газтай ундаанд фосфор их байдаг.',
    text: 'Бөөр сайн ажиллахгүй үед фосфор цусанд хуримтлагдаж, яс сулруулж, загатнуулж болно. Хэр их уух нь зүгээрийг эмчээсээ асуугаарай.',
  },
  chocolate: {
    tag: 'Калий, фосфор ихтэй',
    title: 'Какаонд калий, фосфор хоёулаа их байдаг.',
    text: 'Бөөр сайн ажиллахгүй үед хоёулаа цусанд ихсэж, зүрх болон ясанд нөлөөлж болно. Хэр их уух нь зүгээрийг эмчээсээ асуугаарай.',
  },
};

// Kinds whose long note was shown once; after that only the tag.
const SEEN_KEY = 'dusal-flag-seen-v1';
export function flagSeen(kind: Kind): boolean {
  try { return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown[]).includes(kind); } catch { return true; }
}
export function markFlagSeen(kind: Kind): void {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
    if (!seen.includes(kind)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, kind]));
  } catch { /* shown again next time */ }
}

// «Эмч хориглосон» (Профайл › Эмчийн зөвлөмж): what the doctor ruled out. A ruled-out drink is marked
// red in the sheet and can still be logged.
export type Rule = 'alcohol' | 'potassium' | 'soda' | 'saltySoup';
export const RULES: { id: Rule; name: string; sub: string }[] = [
  { id: 'alcohol', name: 'Согтууруулах ундаа', sub: 'архи, пиво, дарс' },
  { id: 'potassium', name: 'Калий ихтэй ундаа', sub: 'жүүс, какао' },
  { id: 'soda', name: 'Кола, газтай ундаа', sub: 'фосфор ихтэй' },
  { id: 'saltySoup', name: 'Давстай шөл', sub: 'цангааг ихэсгэнэ' },
];
const RULES_KEY = 'dusal-doctor-rules-v1';
export function readRules(): Rule[] {
  try {
    const v = JSON.parse(localStorage.getItem(RULES_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? RULES.map(r => r.id).filter(id => v.includes(id)) : [];
  } catch { return []; }
}
export function writeRules(rules: Rule[]): void {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* this visit only */ }
}
export function forbidden(kind: Kind | undefined, salty: boolean, rules = readRules()): boolean {
  if (kind === 'alcohol') return rules.includes('alcohol');
  if (kind === 'juice' || kind === 'chocolate') return rules.includes('potassium');
  if (kind === 'soda') return rules.includes('soda');
  return kind === 'soup' && salty && rules.includes('saltySoup');
}
