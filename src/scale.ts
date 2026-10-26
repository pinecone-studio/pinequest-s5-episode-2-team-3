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
  // The base's own ID ("dusal-a1b2"), read on connect; it is also its family's ID (src/family.ts).
  baseId = '';
  private ready?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private saving = Promise.resolve();
  private started = false;

  get saved(): boolean { return readSaved() !== null; }
  // Tells this page and, in the tab host, every tab's frame (they all show the one shared link).
  private changed(): void {
    const pages: Window[] = [window];
    for (let i = 0; i < window.frames.length; i++) pages.push(window.frames[i]);
    for (const page of pages) { try { page.dispatchEvent(new (page as typeof window).Event('dusal-scale')); } catch { /* not our page */ } }
  }
  private init(): Promise<void> {
    return this.ready ??= BleClient.initialize().catch(error => { this.ready = undefined; throw error; });
  }

  start(): void {
    if (this.started || this.phase === 'unsupported') return;
    this.started = true;
    this.reconnect();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.reconnect(); });
  }
  reconnect(): void {
    const saved = readSaved();
    if (saved && this.phase === 'off') void this.connect(saved);
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
      this.baseId = deviceIdFrom(await BleClient.read(bleId, SCALE_SERVICE, ID_CHAR));
      await BleClient.startNotifications(bleId, SCALE_SERVICE, STATUS_CHAR, value => this.onStatus(value));
      await BleClient.startNotifications(bleId, SCALE_SERVICE, DRINK_CHAR, value => this.receive(value));
      this.phase = 'connected';
      this.changed();
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
    const entry = ((): WaterEntry | null => { try { return drinkEntry(this.baseId, drink); } catch { return null; } })();
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

// One link per app. In the phone app's tab host (tabs.ts) the three tabs are frames of one page, and two
// connections to the same base would fight; each tab uses the host's link instead of making its own.
type ScaleHost = Window & { dusalScale?: ScaleLink };
function hostLink(): ScaleLink | undefined {
  try { return window.parent !== window ? (window.parent as ScaleHost).dusalScale : undefined; } catch { return undefined; }
}
export const scale: ScaleLink = hostLink() ?? new ScaleLink();
(window as ScaleHost).dusalScale = scale;
