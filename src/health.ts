import { Capacitor } from '@capacitor/core';
import { Health, type HealthDataType } from '@capgo/capacitor-health';
import { latestHeart, todayRange, totalOfBestSource } from './health-data';

// A smartwatch's day through Android's Health Connect: Galaxy Watch → Samsung Health → Health Connect
// → here. The app never talks to the watch itself, so any watch that writes to Health Connect works.
// Only Android has Health Connect; on the web and iOS the whole feature stays hidden.
const READ: HealthDataType[] = ['steps', 'calories', 'heartRate'];
const LINKED_KEY = 'dusal-health-v1';

export type HealthPhase = 'unsupported' | 'missing' | 'off' | 'denied' | 'on';
export interface HealthDay { steps: number | null; activeKcal: number | null; heart: { bpm: number; at: string } | null }

export const healthSupported = () => Capacitor.getPlatform() === 'android';

function readLinked(): boolean {
  try { return localStorage.getItem(LINKED_KEY) === '1'; } catch { return false; }
}
function writeLinked(on: boolean): void {
  try { if (on) localStorage.setItem(LINKED_KEY, '1'); else localStorage.removeItem(LINKED_KEY); } catch { /* asked again next time */ }
}

export class HealthLink {
  phase: HealthPhase = healthSupported() ? 'off' : 'unsupported';
  day: HealthDay | null = null;
  message = '';
  private started = false;

  private changed(): void { window.dispatchEvent(new Event('dusal-health')); }

  // Settles the phase without asking the user anything; a watch linked before is read straight away.
  async start(): Promise<void> {
    if (this.started || this.phase === 'unsupported') return;
    this.started = true;
    try {
      const { available } = await Health.isAvailable();
      if (!available) { this.phase = 'missing'; this.changed(); return; }
      if (!readLinked()) { this.phase = 'off'; this.changed(); return; }
      const status = await Health.checkAuthorization({ read: READ });
      this.phase = status.readAuthorized.length ? 'on' : 'denied';
      this.changed();
      if (this.phase === 'on') await this.refresh();
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.phase === 'on') void this.refresh(); });
    } catch {
      // A failed call is not a missing Health Connect: keep the link button and try again next time.
      this.started = false;
      this.phase = 'off';
      this.message = 'Health Connect-тэй холбогдож чадсангүй. Аппаа шинэчлээд дахин оролдоно уу.';
      this.changed();
    }
  }

  // Opens Health Connect's permission sheet. Any one granted type is enough to show something.
  async connect(): Promise<void> {
    const { available } = await Health.isAvailable();
    if (!available) { this.phase = 'missing'; this.message = ''; this.changed(); return; }
    const status = await Health.requestAuthorization({ read: READ });
    const on = status.readAuthorized.length > 0;
    writeLinked(on);
    this.phase = on ? 'on' : 'denied';
    this.message = on ? '' : 'Зөвшөөрөл өгөөгүй байна. Утасны Тохиргоо → Health Connect → Дусал хэсгээс асаана уу.';
    this.changed();
    if (on) await this.refresh();
  }

  // Stops reading; Health Connect permissions themselves are revoked in the system settings.
  disconnect(): void {
    writeLinked(false);
    this.phase = 'off';
    this.day = null;
    this.message = '';
    this.changed();
  }

  async refresh(): Promise<void> {
    if (this.phase !== 'on') return;
    const range = todayRange();
    // limit 0 reads every record of the day; a type the user did not allow comes back empty.
    const read = (dataType: HealthDataType) => Health.readSamples({ ...range, dataType, limit: 0 }).then(r => r.samples).catch(() => []);
    const [steps, kcal, heart] = await Promise.all([read('steps'), read('calories'), read('heartRate')]);
    this.day = { steps: totalOfBestSource(steps), activeKcal: totalOfBestSource(kcal), heart: latestHeart(heart) };
    this.message = !steps.length && !kcal.length && !heart.length
      ? 'Өнөөдөр цагнаас мэдээлэл ирээгүй байна. Samsung Health → Тохиргоо → Health Connect хэсэгт синк асаалттай эсэхийг шалгана уу.'
      : '';
    this.changed();
  }
}

export const health = new HealthLink();
