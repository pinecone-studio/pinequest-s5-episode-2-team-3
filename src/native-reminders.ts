import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// In the phone app reminders are scheduled with the system, so they arrive even when the app is closed.
// The web keeps its own once-a-minute check in schedule.ts.
export const nativeReminders = Capacitor.isNativePlatform();

// Our notifications use ids from 4100 up, so cancelling them never touches anything else.
const BASE_ID = 4100;
const LAST_ID = 4999;

export async function askPermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

// The water drop's face beside each reminder, Duolingo style: it gets sadder the further behind you are.
// Android shows it as the large icon (res/drawable-nodpi/notif_face_*.png), iOS as an image
// attachment from the web assets (public/notif/*.png). Drawn in assets/notif-faces/*.svg.
export type Face = 'happy' | 'worried' | 'sad' | 'crying';

export interface NativeReminder { at: Date; title: string; body: string; face: Face }

// Opening the app clears the app icon badge and the delivered reminders, like Duolingo.
export async function clearDelivered(): Promise<void> {
  await LocalNotifications.removeAllDeliveredNotifications();
}

// Replace whatever we scheduled before with `items` (an empty list just clears them). `items` are in
// time order and the badge was just cleared, so the n-th reminder to arrive shows n on the app icon
// (set by our patch of the plugin, patches/@capacitor%2Flocal-notifications@7.0.7.patch).
export async function scheduleNative(items: readonly NativeReminder[]): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter(n => n.id >= BASE_ID && n.id <= LAST_ID);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  if (!items.length) return;
  await LocalNotifications.schedule({
    notifications: items.slice(0, LAST_ID - BASE_ID).map((item, i) => ({
      id: BASE_ID + i,
      title: item.title,
      body: item.body,
      schedule: { at: item.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_drop',
      iconColor: '#4a90e2',
      largeIcon: `notif_face_${item.face}`,
      attachments: [{ id: item.face, url: `res:///notif/${item.face}.png` }],
      extra: { badge: i + 1 },
    })),
  });
}
