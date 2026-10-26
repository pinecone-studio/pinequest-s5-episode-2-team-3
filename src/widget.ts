import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, type AppState, type WaterEntry } from './data';
import { iconMood } from './app-icon';
import { streakNow } from './hydration';
import { widgetEntries, widgetMessage } from './widget-data';

// Android home screen widget (DrinkWidget.java through WidgetPlugin.java). The app tells it today's
// total and mood; cups added on the widget wait there until the app moves them into the log.
interface WidgetPlugin {
  update(options: { drunk: number; goal: number; mode: 'goal' | 'limit'; day: string; mood: string; streak: number; message: string }): Promise<void>;
  pending(): Promise<{ drinks: unknown }>;
  clearPending(options: { ids: string[] }): Promise<void>;
}
const Widget = registerPlugin<WidgetPlugin>('DusalWidget');
const enabled = Capacitor.getPlatform() === 'android';

// Last sent, so re-rendering the home doesn't wake the widget for nothing.
let sent = '';
export function pushWidget(state: AppState, drunk: number): void {
  if (!enabled) return;
  const mood = iconMood(state);
  const streak = state.mode === 'goal' ? streakNow(state.events, state.goal, state.mode) : 0;
  const update = { drunk, goal: state.goal, mode: state.mode, day: dayKey(), mood, streak, message: widgetMessage(drunk, state.goal, state.mode, mood, streak) };
  const key = JSON.stringify(update);
  if (key === sent) return;
  sent = key;
  void Widget.update(update).catch(() => { sent = ''; });
}

// Moves the widget's cups into the log. `save` adds them (skipping IDs already there) and reports
// whether it worked; only then are they cleared on the widget, so a failed save loses nothing.
export async function takeWidgetDrinks(save: (fresh: WaterEntry[]) => Promise<boolean>): Promise<void> {
  if (!enabled) return;
  const { drinks } = await Widget.pending();
  const entries = widgetEntries(drinks);
  if (!entries.length) return;
  if (await save(entries)) await Widget.clearPending({ ids: entries.map(e => e.id) });
}
