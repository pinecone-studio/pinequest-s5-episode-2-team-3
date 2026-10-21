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

export interface NativeReminder { at: Date; title: string; body: string }

// Replace whatever we scheduled before with `items` (an empty list just clears them).
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
    })),
  });
}
