import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// In the phone app reminders are scheduled with the system, so they arrive even when the app is closed.
// The web keeps its own once-a-minute check in schedule.ts.
export const nativeReminders = Capacitor.isNativePlatform();

// Our notifications use ids from 4100 up, so cancelling them never touches anything else.
const BASE_ID = 4100;
const LAST_ID = 4999;

// Reminders and the amount notices buzz hard: three long pulses on a channel of their own, shown on
// top of the screen (importance 4). Android fixes a channel's settings once it exists, so a new pattern
// needs a new id. The pattern is read by our patch of the plugin (patches/@capacitor%2Flocal-notifications@7.0.7.patch).
// The same as Buzz.PATTERN (android/…/Buzz.java), which also buzzes the amount notices at full strength.
export const BUZZ = [0, 1000, 300, 1000, 300, 1000, 300, 1500];
const CHANNEL = 'dusal-buzz-v3';
let channel: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  // Android keeps a channel as first made: v1 went out without its pattern, v2 with a shorter one.
  for (const id of ['dusal-buzz-v1', 'dusal-buzz-v2']) void LocalNotifications.deleteChannel({ id }).catch(() => {});
  channel ??= LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Ус уух сануулга',
    description: 'Ус уух цаг, өдрийн хэмжээнд ойртох, хэтрэх үед хүчтэй чичирнэ',
    importance: 4,
    vibration: true,
    vibrationPattern: BUZZ,
  } as Parameters<typeof LocalNotifications.createChannel>[0]).catch(() => { channel = null; });
  return channel;
}
// «Close to today's amount» and «past it»: the channel only buzzes, as the loud sound comes from
// Buzz.java (strongBuzz, ScaleWatchService) and the base says them aloud (src/overview.ts sayOnBase). «silent» is read by our patch of the plugin, like the pattern.
const AMOUNT_CHANNEL = 'dusal-amount-v2';
let amountChannel: Promise<void> | null = null;
function ensureAmountChannel(): Promise<void> {
  void LocalNotifications.deleteChannel({ id: 'dusal-amount-v1' }).catch(() => {});
  amountChannel ??= LocalNotifications.createChannel({
    id: AMOUNT_CHANNEL,
    name: 'Өдрийн хэмжээ',
    description: 'Өдрийн хэмжээнд ойртох, хэтрэх үед дуугүй чичирнэ',
    importance: 4,
    vibration: true,
    vibrationPattern: BUZZ,
    silent: true,
  } as Parameters<typeof LocalNotifications.createChannel>[0]).catch(() => { amountChannel = null; });
  return amountChannel;
}

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
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: items.slice(0, LAST_ID - BASE_ID).map((item, i) => ({
      id: BASE_ID + i,
      channelId: CHANNEL,
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

// The weekly notice before the days off (weekend-notice.ts) has its own fixed id, outside 4100–4999,
// so re-planning the reminders never cancels it and it never cancels them. The demo uses the next id.
export const WEEKEND_ID = 9000;
export const WEEKEND_DEMO_ID = 9001;
export async function allowed(): Promise<boolean> {
  return (await LocalNotifications.checkPermissions()).display === 'granted';
}
export async function scheduleWeekend(item: NativeReminder | null, id = WEEKEND_ID): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  if (!item) return;
  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: item.title,
      body: item.body,
      schedule: { at: item.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_drop',
      iconColor: '#4a90e2',
      largeIcon: `notif_face_${item.face}`,
      attachments: [{ id: item.face, url: `res:///notif/${item.face}.png` }],
      extra: { kind: 'weekend' },
    }],
  });
}
// «Close to today's amount» and «past it»: shown at once, each under its own id, so a later one
// replaces an earlier one of the same kind instead of piling up. The old one is taken down first: the
// plugin posts with «alert only once», so a mere update would not buzz again. Skipped quietly without
// permission.
export const NEAR_ID = 9002;
export const OVER_ID = 9003;
export async function notifyNow(item: Omit<NativeReminder, 'at'>, id: number): Promise<void> {
  if (!await allowed()) return;
  await ensureAmountChannel();
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  await LocalNotifications.schedule({
    notifications: [{
      id,
      channelId: AMOUNT_CHANNEL,
      title: item.title,
      body: item.body,
      schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
      smallIcon: 'ic_stat_drop',
      iconColor: '#4a90e2',
      largeIcon: `notif_face_${item.face}`,
      attachments: [{ id: item.face, url: `res:///notif/${item.face}.png` }],
      extra: { kind: 'amount' },
    }],
  });
}
// A tap on the weekend notice; the plugin keeps the tap that started the app until a listener comes.
export function onWeekendTap(open: () => void): void {
  if (!nativeReminders) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', e => {
    if ((e.notification.extra as { kind?: string } | undefined)?.kind === 'weekend') open();
  });
}
