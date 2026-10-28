import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, type AppState } from './data';
import { iconMood } from './app-icon';
import { streakNow } from './hydration';
import { slots } from './schedule';

// Android home screen widget (DrinkWidget.java through WidgetPlugin.java), Duolingo style. The app
// reports today's numbers; the widget picks its colour and face from them and the clock by itself.
interface WidgetPlugin {
  update(options: { drunk: number; goal: number; mode: 'goal' | 'limit'; day: string; streak: number; broke: boolean; next: string }): Promise<void>;
}
const Widget = registerPlugin<WidgetPlugin>('DusalWidget');
const enabled = Capacitor.getPlatform() === 'android';

// Last sent, so re-rendering the home doesn't wake the widget for nothing.
let sent = '';
export function pushWidget(state: AppState, drunk: number): void {
  if (!enabled) return;
  const limit = state.mode === 'limit';
  const update = {
    drunk,
    goal: state.goal,
    mode: state.mode,
    day: dayKey(),
    streak: limit ? 0 : streakNow(state.events, state.goal, state.mode),
    // The launcher icon cries the day after a streak broke; the widget shows "start again" then.
    broke: !limit && iconMood(state) === 'Crying',
    // Today's coming drinking times and what is still to drink at each ("12:00=300,15:00=250"); the widget
    // shows the first one still ahead by its own clock.
    next: slots(state).filter(x => x.left > 0 && x.state === 'later').map(x => `${x.time}=${x.left}`).join(','),
  };
  const key = JSON.stringify(update);
  if (key === sent) return;
  sent = key;
  void Widget.update(update).catch(() => { sent = ''; });
}
