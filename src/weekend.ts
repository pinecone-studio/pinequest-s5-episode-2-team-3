import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppState } from './data';
import { number } from './format';
import { askPermission, nativeReminders } from './native-reminders';
import { WEEKDAY_LONG, WEEKDAY_SHORT, gains, readDialysis, readWeights, type Dialysis } from './progress-data';

// Before the longest gap between dialysis sessions (Ба → Да for Да, Лх, Ба), fluid builds up the
// most, so under a doctor's limit a weekly reminder goes out at 19:00 on the evening that gap starts
// (id 4200; the water reminders keep 4100–4199). Tapping it opens the app on a sheet with the same
// text, the days of the gap and, when the logged weights really show it, that the gain after the gap
// is the largest. Off with goal mode or the «Амралтын өмнөх сануулга» switch.
export const WEEKEND_ID = 4200;
export const WEEKEND_OPEN_KEY = 'dusal-weekend-open';
const ON_KEY = 'dusal-weekend-reminder-v1';

export const weekendOn = (): boolean => { try { return localStorage.getItem(ON_KEY) !== '0'; } catch { return true; } };
export function setWeekendOn(on: boolean): void { try { localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch { /* this visit only */ } }

// Days are 1 = Monday … 7 = Sunday. `from` is the session the gap starts after, `to` the next one,
// `rest` the days in between with no session.
export interface Gap { from: number; to: number; rest: number }
export function longestGap(days: readonly number[]): Gap | null {
  const sorted = [...days].sort((a, b) => a - b);
  let best: Gap | null = null;
  sorted.forEach((from, i) => {
    const to = sorted[(i + 1) % sorted.length];
    const rest = (((to - from + 7) % 7) || 7) - 1;
    if (!best || rest > best.rest) best = { from, to, rest };
  });
  return best && (best as Gap).rest >= 1 ? best : null;
}

const longName = (d: number) => WEEKDAY_LONG[d % 7];
export function weekendText(d: Dialysis, goal: number): { title: string; body: string } | null {
  const gap = longestGap(d.days);
  if (!gap) return null;
  return {
    title: `Амралтын ${gap.rest} өдөр эхэлж байна`,
    body: `Дараагийн диализ ${longName(gap.to)} ${d.time}. Өдөрт ${number(goal)} мл-ээ барьж, давстай хоолоо цөөлөөрэй.`,
  };
}

// Whether the logged weights show the most weight coming on across that gap: the largest gain ends on
// the gap's next session day and started on its first.
export function gapGainsMost(d: Dialysis, list = gains(readWeights())): boolean {
  const gap = longestGap(d.days);
  if (!gap || list.length < 2) return false;
  const wd = (key: string) => new Date(`${key}T12:00`).getDay() || 7;
  const top = list.reduce((m, g) => (g.kg > m.kg ? g : m));
  return wd(top.from) === gap.from && wd(top.to) === gap.to && list.some(g => g !== top);
}

// Re-plans the one weekly notification; `ask` asks for permission (only when the person turns the
// reminder on or saves dialysis days).
let planned = '';
export async function planWeekend(state: Pick<AppState, 'goal' | 'mode'>, ask = false): Promise<void> {
  if (!nativeReminders) return;
  const d = readDialysis(), text = weekendText(d, state.goal), gap = longestGap(d.days);
  const key = JSON.stringify([state.mode, state.goal, d, weekendOn()]);
  if (key === planned && !ask) return;
  planned = key;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: WEEKEND_ID }] });
    if (state.mode !== 'limit' || !weekendOn() || !text || !gap) return;
    const allowed = ask ? await askPermission() : (await LocalNotifications.checkPermissions()).display === 'granted';
    if (!allowed) return;
    await LocalNotifications.schedule({
      notifications: [{
        id: WEEKEND_ID, title: text.title, body: text.body,
        // Capacitor counts weekdays from Sunday = 1.
        schedule: { on: { weekday: (gap.from % 7) + 1, hour: 19, minute: 0 }, allowWhileIdle: true },
        smallIcon: 'ic_stat_drop', iconColor: '#0056ff', extra: { weekend: true },
      }],
    });
  } catch { /* tried again on the next change */ }
}

// The in-app sheet: the same words, the gap as a bar (evening, the rest days, the next session) and
// one tile per rest day with the day's limit.
export function weekendSheet(state: Pick<AppState, 'goal'>): string | null {
  const d = readDialysis(), text = weekendText(d, state.goal), gap = longestGap(d.days);
  if (!text || !gap) return null;
  const restDays = Array.from({ length: gap.rest }, (_, i) => ((gap.from + i) % 7) + 1);
  const mid = 72 / gap.rest;
  return `<h2>${text.title}</h2>
    <p class="wk-body">${text.body}</p>
    <div class="wk-bar" role="img" aria-label="${longName(gap.from)} оройгоос ${longName(gap.to)} ${d.time} хүртэл ${gap.rest} өдөр">
      <div class="wk-track"><i style="width: 14%"></i>${restDays.map((_, i) => `<i class="rest r${i % 2}" style="width: ${mid.toFixed(2)}%"></i>`).join('')}<i class="end" style="width: 14%"></i></div>
      <div class="wk-labels" aria-hidden="true"><span>${WEEKDAY_SHORT[gap.from % 7]} орой</span>${restDays.map(n => `<span>${WEEKDAY_SHORT[n % 7]}</span>`).join('')}<span>${WEEKDAY_SHORT[gap.to % 7]} ${d.time}</span></div>
    </div>
    <div class="wk-days">${restDays.map(n => `<div><small>${longName(n)}</small><b>${number(state.goal)} мл</b></div>`).join('')}</div>
    ${gapGainsMost(d) ? '<p class="wk-note">Таны тайлангаас: амралтын дараа диализ хоорондын жин хамгийн их нэмэгддэг.</p>' : ''}
    <button type="button" class="hx-blue hl-wide" data-ok data-focus>Ойлголоо</button>`;
}
