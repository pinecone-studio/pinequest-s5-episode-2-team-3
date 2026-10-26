import { validateEntry } from '../shared/contracts';
import type { WaterEntry } from './data';
import { number } from './format';

// What the home screen widget says, and how its "+250 мл" taps become log entries.
// Kept apart from the Capacitor bridge (src/widget.ts) so it can be tested without a phone.
export type WidgetMood = 'Default' | 'Worried' | 'Sad' | 'Crying';

// One short line under the streak, Duolingo style. Under a doctor's limit it never asks for more
// water: it only says how close the limit is.
export function widgetMessage(drunk: number, goal: number, mode: 'goal' | 'limit', mood: WidgetMood, streak: number): string {
  if (mode === 'limit') {
    if (drunk > goal) return 'Хязгаараас хэтэрлээ. Эмчийн заавраа санаарай';
    if (drunk >= goal * 0.8) return `Хязгаарт ойртлоо · ${number(goal - drunk)} мл үлдсэн`;
    return 'Хязгаартаа зөв явж байна';
  }
  const left = goal - drunk;
  if (left <= 0) return 'Зорилт биеллээ! Гайхалтай 🎉';
  if (mood === 'Crying') return 'Streak тасарчихлаа… Өнөөдөр дахин эхэлье';
  if (mood === 'Sad') return streak > 0 ? `${number(streak)} өдрийн streak-ээ алдах гэж байна!` : `Өдөр дуусах гэж байна · ${number(left)} мл дутуу`;
  if (mood === 'Worried') return `Ус уух цаг өнгөрлөө · дахиад ${number(left)} мл`;
  return drunk === 0 ? 'Эхний аягаа уугаарай 💧' : `Сайн явж байна! Дахиад ${number(left)} мл`;
}

// Taps saved by DrinkWidget.java as { id, ml, at (epoch ms) }. Anything malformed is skipped rather
// than allowed to break the log; valid ones become ordinary drinks with the widget's ID.
export function widgetEntries(raw: unknown): WaterEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: WaterEntry[] = [];
  for (const item of raw) {
    try {
      const { id, ml, at } = item as { id?: unknown; ml?: unknown; at?: unknown };
      if (typeof at !== 'number') continue;
      entries.push(validateEntry({ id, amount: ml, type: 'drink', at: new Date(at).toISOString() }));
    } catch { /* not a drink the log can take */ }
  }
  return entries;
}
