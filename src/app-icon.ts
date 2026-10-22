import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, type AppState } from './data';
import { dayCounter, streakNow } from './hydration';
import { slots } from './schedule';

// Android app: the launcher icon's water drop shows how today is going, Duolingo style
// (AppIconPlugin.java swaps <activity-alias> entries). The icon can only change while the app runs,
// so it is set each time the app goes to the background and stays until the next time.
type Mood = 'Default' | 'Worried' | 'Sad' | 'Crying';
const AppIcon = registerPlugin<{ set(options: { mood: Mood }): Promise<void> }>('AppIcon');
const enabled = Capacitor.getPlatform() === 'android';

// Goal met or on track → the normal icon; behind on the schedule → worried; behind in the evening
// with a streak at stake → sad; the day after a streak broke → crying. A doctor's limit has no
// streak to lose and nothing to fall behind on, so it keeps the normal icon.
export function iconMood(state: AppState, now = new Date()): Mood {
  if (state.mode === 'limit') return 'Default';
  const met = dayCounter(state.events, state.goal, state.mode);
  const day = (back: number) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - back); return dayKey(d); };
  if (met(day(0))) return 'Default';
  if (!met(day(1)) && met(day(2))) return 'Crying';
  const list = slots(state, now);
  const last = list[list.length - 1];
  if (last && last.state !== 'later' && last.state !== 'done' && streakNow(state.events, state.goal, state.mode) > 0) return 'Sad';
  return list.some(x => x.state === 'late') ? 'Worried' : 'Default';
}

export function startAppIcon(state: () => AppState): void {
  if (!enabled) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void AppIcon.set({ mood: iconMood(state()) }).catch(() => {});
  });
}
