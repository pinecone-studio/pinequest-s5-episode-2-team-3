import { Capacitor, registerPlugin } from '@capacitor/core';
import { familyAlerts, type Leaderboard } from '../shared/family';
import { API_URL } from './api';
import { dayKey } from './data';
import { notify } from './components/Toast';

// Telling the family when someone under a doctor's limit passes it, gets close to it, or goes hours
// without a drink logged (rules: shared/family.ts familyAlerts). On Android the system asks the server
// every 15 minutes, app open or not (FamilyAlertWorker.java), and here only says "ask now" after each
// family report. In a browser the open app checks the board it just got and shows each alert once.
interface FamilyAlertsPlugin {
  configure(options: { api: string; base: string; member: string }): Promise<void>;
  checkNow(): Promise<void>;
  stop(): Promise<void>;
}
const native = Capacitor.getPlatform() === 'android' ? registerPlugin<FamilyAlertsPlugin>('DusalFamilyAlerts') : null;

let configured = '';
export function watchFamily(baseId: string, memberId: string): void {
  if (!native) return;
  const key = `${baseId}|${memberId}`;
  if (key !== configured) { configured = key; void native.configure({ api: API_URL, base: baseId, member: memberId }).catch(() => { configured = ''; }); }
  void native.checkNow().catch(() => {});
}
export function stopWatchingFamily(): void {
  configured = '';
  void native?.stop().catch(() => {});
}

// Browser only: the keys already said today, so an alert shows once.
const SAID_KEY = 'dusal-family-alerts-v1';
export function checkBoard(board: Leaderboard): void {
  if (native) return;
  let said: string[] = [];
  try { said = (JSON.parse(localStorage.getItem(SAID_KEY) ?? '[]') as string[]).filter(k => k.startsWith(dayKey())); } catch { /* none said */ }
  const now = new Date();
  const fresh = familyAlerts(board, now, now.getHours()).filter(a => !said.includes(a.key));
  if (!fresh.length) return;
  for (const a of fresh) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(a.title, { body: a.body, icon: '/notif/worried.png' });
  }
  notify(fresh.map(a => a.title).join(' · '), undefined, 10_000);
  try { localStorage.setItem(SAID_KEY, JSON.stringify([...said, ...fresh.map(a => a.key)])); } catch { /* said again next time */ }
}
