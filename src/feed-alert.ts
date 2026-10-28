import { LocalNotifications } from '@capacitor/local-notifications';
import { dayKey, type AppState } from './data';
import { dayCounter } from './hydration';
import { readFed } from './pet-game';
import { readPetName } from './pet';
import { FEED_KEY, showFeedDot } from './nav';
import { nativeReminders } from './native-reminders';
import { readSettings } from './schedule';

// «Дусалхан хоолоо хүлээж байна»: once today counts (goal met, or the doctor's limit kept) and its
// bowl hasn't been fed, the «Амжилт» tab gets a red dot (nav.ts) and, with reminders on, one
// notification that day. Feeding (achievements.ts) takes the dot away.
const SENT_KEY = 'dusal-feed-notified-v1';
const NOTIF_ID = 5001;  // outside the water reminders' 4100–4999, so re-planning them never cancels it

export const feedWaiting = (state: AppState): boolean => {
  const today = dayKey();
  return dayCounter(state.events, state.goal, state.mode)(today) && !readFed().has(today);
};

// `notify` is off on the «Амжилт» page itself: the bowl is right there.
export function markFeed(waiting: boolean, notify = true): void {
  try {
    if (waiting) localStorage.setItem(FEED_KEY, dayKey()); else localStorage.removeItem(FEED_KEY);
  } catch { /* no dot this time */ }
  showFeedDot();
  if (waiting && notify) void notifyOnce();
}

async function notifyOnce(): Promise<void> {
  const today = dayKey();
  try { if (localStorage.getItem(SENT_KEY) === today) return; } catch { return; }
  if (!readSettings().on) return;
  const name = readPetName();
  const title = `${name} хоолоо хүлээж байна 🍲`;
  const body = `Өнөөдрийн зорилго биеллээ! «Амжилт» руу орж ${name}-аа хооллоорой.`;
  try {
    if (nativeReminders) {
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
      await LocalNotifications.schedule({ notifications: [{ id: NOTIF_ID, title, body, smallIcon: 'ic_stat_drop', iconColor: '#4a90e2', largeIcon: 'notif_face_happy', extra: { url: '/achievements.html' } }] });
    } else {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
      if (reg) await reg.showNotification(title, { body, icon: '/notif/happy.png', tag: 'dusal-feed' });
      else new Notification(title, { body, icon: '/notif/happy.png', tag: 'dusal-feed' });
    }
    localStorage.setItem(SENT_KEY, today);
  } catch { /* tried again on the next redraw */ }
}
