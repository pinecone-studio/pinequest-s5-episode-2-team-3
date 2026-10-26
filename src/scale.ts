import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import type { WaterEntry } from './data';
import { announce, store } from './storage';
import { sync } from './sync';
import { ACK_CHAR, DRINK_CHAR, ID_CHAR, SCALE_SERVICE, STATUS_CHAR, ackBytes, deviceIdFrom, drinkEntry, parseDrink, parseStatus, type ScaleStatus } from './scale-protocol';

// Remembered so the Android app reconnects by itself; a browser has to ask the user every time.
const SAVED_KEY = 'dusal-scale-v1';
const RETRY_MS = 5000;

export type ScalePhase = 'unsupported' | 'off' | 'connecting' | 'connected';
interface Saved { bleId: string; name: string }

function readSaved(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as Partial<Saved> | null;
    return typeof raw?.bleId === 'string' && typeof raw.name === 'string' ? { bleId: raw.bleId, name: raw.name } : null;
  } catch { return null; }
}
function writeSaved(saved: Saved | null): void {
  try { if (saved) localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); else localStorage.removeItem(SAVED_KEY); } catch { /* reconnecting is a convenience */ }
}
const supported = () => Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'bluetooth' in navigator);

// The smart base over Bluetooth LE. It counts drinks itself and repeats the oldest one until the app
// confirms it, so a drink is confirmed only after it is in local storage; sync then uploads it as usual.
export class ScaleLink {
  phase: ScalePhase = supported() ? 'off' : 'unsupported';
  name = readSaved()?.name ?? '';
  message = '';
  status: ScaleStatus | null = null;
  private bleId: string | null = null;
  private deviceId = '';
  private ready?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private saving = Promise.resolve();
  private started = false;

  get saved(): boolean { return readSaved() !== null; }
  // The connected base's device ID, which is also its family's ID (shared/family.ts); '' when not connected.
  get baseId(): string { return this.phase === 'connected' ? this.deviceId : ''; }
  private changed(): void { window.dispatchEvent(new Event('dusal-scale')); }
  private init(): Promise<void> {
    return this.ready ??= BleClient.initialize().catch(error => { this.ready = undefined; throw error; });
  }

  start(): void {
    if (this.started || this.phase === 'unsupported') return;
    this.started = true;
    this.reconnect();
    document.addEventListener('visibilitychange', () => {
      // The base takes one phone at a time: the Android app lets go when it goes to the background so
      // another family member can connect, and takes it back on return. (A browser would have to ask
      // the person to pick the base again, so it keeps the link.)
      if (document.hidden && Capacitor.isNativePlatform()) void this.release();
      else if (!document.hidden) this.reconnect();
    });
  }
  reconnect(): void {
    const saved = readSaved();
    if (saved && this.phase === 'off') void this.connect(saved);
  }
  // The saved base's Bluetooth address, for its QR; only the Android app has a stable one.
  get address(): string | null { return Capacitor.isNativePlatform() ? readSaved()?.bleId ?? null : null; }
  // From the base's QR: connect straight to its address, without the system's device list.
  async connectTo(bleId: string, name: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('Шууд холболт зөвхөн Android апп дээр ажиллана.');
    const saved = { bleId, name };
    writeSaved(saved);
    await this.connect(saved);
  }
  private async release(): Promise<void> {
    clearTimeout(this.retry);
    const bleId = this.bleId;
    if (!bleId) return;
    this.bleId = null; this.status = null; this.phase = 'off'; this.message = '';
    this.changed();
    await BleClient.disconnect(bleId).catch(() => {});
  }
  // Asks the user to pick the scale (system dialog), then connects.
  async pair(): Promise<void> {
    await this.init();
    const device = await BleClient.requestDevice({ services: [SCALE_SERVICE] });
    const saved = { bleId: device.deviceId, name: device.name ?? 'Dusal' };
    if (Capacitor.isNativePlatform()) writeSaved(saved);
    await this.connect(saved);
  }
  async forget(): Promise<void> {
    clearTimeout(this.retry);
    writeSaved(null);
    const bleId = this.bleId;
    this.bleId = null;
    if (bleId) await BleClient.disconnect(bleId).catch(() => {});
    this.phase = 'off'; this.status = null; this.message = '';
    this.changed();
  }

  private async connect({ bleId, name }: Saved): Promise<void> {
    clearTimeout(this.retry);
    this.phase = 'connecting'; this.name = name; this.message = '';
    this.changed();
    try {
      await this.init();
      await BleClient.connect(bleId, () => this.lost(bleId));
      this.bleId = bleId;
      this.deviceId = deviceIdFrom(await BleClient.read(bleId, SCALE_SERVICE, ID_CHAR));
      await BleClient.startNotifications(bleId, SCALE_SERVICE, STATUS_CHAR, value => this.onStatus(value));
      await BleClient.startNotifications(bleId, SCALE_SERVICE, DRINK_CHAR, value => this.receive(value));
      this.phase = 'connected';
      this.changed();
      if (document.hidden && Capacitor.isNativePlatform()) { void this.release(); return; }
      // A drink already waiting is notified again only after a few seconds; take it now.
      this.receive(await BleClient.read(bleId, SCALE_SERVICE, DRINK_CHAR));
    } catch {
      this.bleId = null;
      await BleClient.disconnect(bleId).catch(() => {});
      this.phase = 'off'; this.status = null;
      this.message = 'Суурьтай холбогдож чадсангүй. Суурь асаалттай, утсанд ойрхон байгаа эсэхийг шалгана уу.';
      this.changed();
      this.later();
    }
  }
  private lost(bleId: string): void {
    if (this.bleId !== bleId) return;
    this.bleId = null; this.status = null; this.phase = 'off';
    this.message = 'Суурьтай холболт тасарлаа. Дахин холбогдоно.';
    this.changed();
    this.later();
  }
  // Only a remembered scale reconnects by itself, and only while the app is on screen.
  private later(): void {
    clearTimeout(this.retry);
    if (this.saved) this.retry = setTimeout(() => { if (!document.hidden) this.reconnect(); }, RETRY_MS);
  }

  private onStatus(value: DataView): void {
    try { this.status = parseStatus(value); } catch { return; }
    this.changed();
  }
  // One drink at a time, in order; a resend of a drink still being saved waits its turn and is then skipped.
  private receive(value: DataView): void {
    this.saving = this.saving.then(() => this.save(value)).catch(() => {
      this.message = 'Суурийн уултыг хадгалж чадсангүй. Суурь дахин илгээнэ.';
      this.changed();
    });
  }
  private async save(value: DataView): Promise<void> {
    const drink = parseDrink(value);
    const bleId = this.bleId;
    if (!drink || !bleId) return;
    // A drink the log can never accept is still confirmed, or it would block every later one.
    const entry = ((): WaterEntry | null => { try { return drinkEntry(this.deviceId, drink); } catch { return null; } })();
    if (entry) {
      const added = await store.update(record => {
        if (record.state.events.some(e => e.id === entry.id)) return false;
        record.state.events.push(entry);
        return true;
      });
      // Pages reload their state (home shows the "Суурь: … мл" animation) and sync uploads the entry.
      if (added) { announce('sync'); void sync.run(); }
    }
    // An unconfirmed drink is simply sent again and recognised by its ID.
    await BleClient.write(bleId, SCALE_SERVICE, ACK_CHAR, ackBytes(drink)).catch(() => {});
  }
}

export const scale = new ScaleLink();
