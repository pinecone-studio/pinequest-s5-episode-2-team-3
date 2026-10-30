import { defaults } from './data';
import { announce, store } from './storage';
import { leaveFamily } from './family';

// What stays on the phone when it changes hands: the base it is paired with, and what Android was asked once.
const KEEP = new Set(['dusal-scale-v1', 'dusal-exact-alarm-asked-v1']);

// Signing out or deleting the account leaves nothing of this person behind: the water log, every
// `dusal-` setting (cups, reminders, the doctor's rules, dialysis days...) and the family, left on the
// server too. Otherwise the next person to sign up here would start with it and send it to their account.
export async function clearPhone(): Promise<void> {
  await leaveFamily();
  await store.update(record => {
    record.state = defaults();
    delete record.sync;
    delete record.bottles;
  }, defaults()).catch(() => {});
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('dusal-') && !KEEP.has(key)) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing was kept there either */ }
  announce('sync');
}
