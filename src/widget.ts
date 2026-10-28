import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, type AppState, type WaterEntry } from './data';
import { iconMood } from './app-icon';
import { streakNow } from './hydration';
import { KINDS, kindOf } from './drinks';

// Android home screen widgets (DrinkWidget.java and its kinds, through WidgetPlugin.java). The app reports
// today's numbers; the widgets pick their words and colours from them and the clock by themselves.
interface WidgetPlugin {
  update(options: { drunk: number; goal: number; mode: 'goal' | 'limit'; day: string; streak: number; broke: boolean; count: number; kinds: string; week: number; yesterday: number }): Promise<void>;
  pin(options: { kind: WidgetKind }): Promise<{ pinned: boolean }>;
}
const Widget = registerPlugin<WidgetPlugin>('DusalWidget');
const enabled = Capacitor.getPlatform() === 'android';

// The home screen widgets one can pick (WidgetPlugin.pin), as in the launcher's widget list.
export type WidgetKind = 'water' | 'left' | 'ring' | 'mix' | 'gauges';
export const widgetsAvailable = enabled;
// Asks the launcher to place the widget; false where it cannot (then the steps are shown instead).
export async function pinWidget(kind: WidgetKind): Promise<boolean> {
  if (!enabled) return false;
  return (await Widget.pin({ kind }).catch(() => ({ pinned: false }))).pinned;
}

// Last sent, so re-rendering the home doesn't wake the widget for nothing.
let sent = '';
export function pushWidget(state: AppState, drunk: number): void {
  if (!enabled) return;
  const today = state.events.filter(e => e.type === 'drink' && dayKey(new Date(e.at)) === dayKey());
  const limit = state.mode === 'limit';
  const update = {
    drunk,
    goal: state.goal,
    mode: state.mode,
    day: dayKey(),
    streak: limit ? 0 : streakNow(state.events, state.goal, state.mode),
    // The launcher icon cries the day after a streak broke; the widget shows "start again" then.
    broke: !limit && iconMood(state) === 'Crying',
    count: today.length,
    kinds: kinds(today),
    week: weekMet(state),
    yesterday: yesterdaySoFar(state),
  };
  const key = JSON.stringify(update);
  if (key === sent) return;
  sent = key;
  void Widget.update(update).catch(() => { sent = ''; });
}

// Today's drinks by name, largest first, for the drinks widget: "Ус:900|Цай:300|Бусад:120". Water from the base
// counts as «Ус»; past three names the rest is summed as «Бусад».
function kinds(today: readonly WaterEntry[]): string {
  const by = new Map<string, number>();
  for (const e of today) { const k = kindOf(e); const name = k ? KINDS[k].name : 'Ус'; by.set(name, (by.get(name) ?? 0) + e.amount); }
  const list = [...by].sort((a, b) => b[1] - a[1]);
  if (list.length > 3) list.splice(2, list.length, ['Бусад', list.slice(2).reduce((sum, [, ml]) => sum + ml, 0)]);
  return list.map(([name, ml]) => `${name}:${ml}`).join('|');
}

// Goal days in the last seven, today included: the goal met, or under a doctor's limit a day logged within it.
function weekMet(state: AppState): number {
  const totals = new Map<string, number>();
  for (const e of state.events) if (e.type === 'drink') { const k = dayKey(new Date(e.at)); totals.set(k, (totals.get(k) ?? 0) + e.amount); }
  let met = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ml = totals.get(dayKey(d)) ?? 0;
    if (state.mode === 'limit' ? ml > 0 && ml <= state.goal : ml >= state.goal) met++;
  }
  return met;
}

// Drunk yesterday up to this time of day, for the «Өнөөдрийн ус» widget's change badge (▲ or ▼ against it).
function yesterdaySoFar(state: AppState): number {
  const at = new Date(); at.setDate(at.getDate() - 1);
  const day = dayKey(at);
  return state.events.reduce((sum, e) => e.type === 'drink' && dayKey(new Date(e.at)) === day && new Date(e.at) <= at ? sum + e.amount : sum, 0);
}
