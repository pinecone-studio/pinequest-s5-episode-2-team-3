import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey, type WaterEntry } from './data';
import { announce, store } from './storage';
import { sync } from './sync';
import { ACK_CHAR, COMMAND_CHAR, DRINK_CHAR, ID_CHAR, SCALE_SERVICE, STATUS_CHAR, ackBytes, deviceIdFrom, drinkEntry, parseDrink, parseStatus, type ScaleDrink, type ScaleStatus } from './scale-protocol';

// Android keeps the link to the base while the app is closed and shows each drink as a notification
// (ScaleWatchService.java); the drinks it kept meanwhile are added to the log when the app opens.
interface WatchedDrink extends Omit<ScaleDrink, 'secondsAgo'> { baseId: string; secondsAgo: number; receivedAt: number }
interface ScaleWatchPlugin {
  start(options: { address: string }): Promise<void>;
  stop(): Promise<void>;
  takeDrinks(): Promise<{ drinks: WatchedDrink[] }>;
  // Today's total and the goal or doctor's limit, so a drink's notification says how much is left.
  setDay(options: { day: string; drunk: number; goal: number; mode: 'goal' | 'limit' }): Promise<void>;
  buzz(options: { overMl: number }): Promise<void>;
}
const watch = Capacitor.getPlatform() === 'android' ? registerPlugin<ScaleWatchPlugin>('DusalScaleWatch') : null;

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

// Named bottles with their empty weight, kept on this phone. Choosing one tells the base which weight to take
// off, and that the next weight is a new bottle, not a drink or a refill.
export interface Bottle { id: string; name: string; grams: number }
const BOTTLES_KEY = 'dusal-bottles-v1';
export function savedBottles(): { list: Bottle[]; selected: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(BOTTLES_KEY) ?? 'null');
    if (saved && Array.isArray(saved.list)) return saved;
  } catch { /* none saved yet */ }
  return { list: [], selected: null };
}
// The name of the bottle chosen to stand on the base, if one is.
export function chosenBottleName(): string | undefined {
  const { list, selected } = savedBottles();
  return list.find(b => b.id === selected)?.name;
}
function writeBottles(value: { list: Bottle[]; selected: string | null }): void {
  try { localStorage.setItem(BOTTLES_KEY, JSON.stringify(value)); } catch { /* the base still has the weight */ }
}

// The smart base over Bluetooth LE. It counts drinks itself and repeats the oldest one until the app
// confirms it, so a drink is confirmed only after it is in local storage; sync then uploads it as usual.
export class ScaleLink {
  phase: ScalePhase = supported() ? 'off' : 'unsupported';
  name = readSaved()?.name ?? '';
  message = '';
  // What the last tare/zero/bottle command did, in words for the panel.
  result = '';
  status: ScaleStatus | null = null;
  private bleId: string | null = null;
  // The base's own ID ("dusal-a1b2"), read on connect; it is also its family's ID (src/family.ts).
  baseId = '';
  private ready?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private saving = Promise.resolve();
  private started = false;
  private newBottleName: string | null = null;
  private today = -1;
  private plan: { goal: number; mode: 'goal' | 'limit' } | null = null;
  private sentToday = '';
  // Whether the first status since connecting was checked for a base that lost its bottle.
  private bottleChecked = false;

  get saved(): boolean { return readSaved() !== null; }
  // Tells this page and, in the tab host, every tab's frame (they all show the one shared link).
  private changed(): void {
    const pages: Window[] = [window];
    for (let i = 0; i < window.frames.length; i++) pages.push(window.frames[i]);
    for (const page of pages) { try { page.dispatchEvent(new (page as typeof window).Event('dusal-scale')); } catch { /* not our page */ } }
  }
  private init(): Promise<void> {
    // Only the Bluetooth permissions: a location grant given "only this time" expires and then Bluetooth
    // fails with "Permission denied" although it is on.
    return this.ready ??= BleClient.initialize({ androidNeverForLocation: true }).catch(error => { this.ready = undefined; throw error; });
  }

  start(): void {
    if (this.started || this.phase === 'unsupported') return;
    this.started = true;
    this.reconnect();
    void this.takeWatched();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { void this.takeWatched(); this.reconnect(); } });
  }
  // Drinks the background watch confirmed to the base while the app was closed.
  private async takeWatched(): Promise<void> {
    if (!watch) return;
    const { drinks } = await watch.takeDrinks().catch(() => ({ drinks: [] as WatchedDrink[] }));
    const entries = drinks.flatMap(d => { try { return [drinkEntry(d.baseId, { ...d, secondsAgo: d.secondsAgo < 0 ? null : d.secondsAgo }, d.receivedAt)]; } catch { return []; } });
    if (!entries.length) return;
    const added = await store.update(record => {
      const fresh = entries.filter(entry => !record.state.events.some(e => e.id === entry.id));
      record.state.events.push(...fresh);
      return fresh.length > 0;
    });
    if (added) { announce('sync'); void sync.run(); }
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
    void watch?.stop().catch(() => {});
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
      // A base with older firmware has no command channel; it still weighs and counts.
      await BleClient.startNotifications(bleId, SCALE_SERVICE, COMMAND_CHAR, value => this.answered(value)).catch(() => {});
      this.phase = 'connected';
      this.bottleChecked = false;
      if (this.saved) void watch?.start({ address: bleId }).catch(() => {});
      this.sentToday = '';
      void this.sendToday();
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

  // ---------- Commands (what BOOT does, for a base sealed in its case) ----------

  async command(text: string): Promise<void> {
    const bleId = this.bleId;
    if (!bleId) throw new Error('Эхлээд суурьтай Bluetooth-ээр холбогдоно уу.');
    await BleClient.write(bleId, SCALE_SERVICE, COMMAND_CHAR, new DataView(new TextEncoder().encode(text).buffer));
  }
  private say(result: string): void { this.result = result; this.changed(); }
  // The base's speaker says one of its phrases (the voice demo); a base without one ignores it.
  async speak(what: 'ready' | 'reached' | 'over' | number | `extra ${number}`): Promise<void> { await this.command(`say ${what}`); }

  // The empty bottle is on the base: weigh it once it is still and save it under this name.
  async addBottle(name: string): Promise<void> {
    this.newBottleName = name.trim() || `Сав ${savedBottles().list.length + 1}`;
    this.say('Жин тогтворжихыг хүлээж байна…');
    try { await this.command('tare'); } catch (error) { this.newBottleName = null; throw error; }
  }
  async chooseBottle(id: string): Promise<void> {
    const saved = savedBottles();
    const bottle = saved.list.find(b => b.id === id);
    if (!bottle) return;
    writeBottles({ ...saved, selected: id });
    this.say('Сонгож байна…');
    await this.command(`bottle ${bottle.grams}`);
  }
  removeBottle(id: string): void {
    const saved = savedBottles();
    writeBottles({ list: saved.list.filter(b => b.id !== id), selected: saved.selected === id ? null : saved.selected });
    this.changed();
  }
  // The base can forget its bottle (new firmware, a jump read as another bottle) while this phone still has
  // the chosen one weighed: on the first status after connecting, hand it that weight again. Only then, so a
  // BOOT press that clears the bottle later is not undone.
  private restoreBottle(): void {
    if (this.bottleChecked || this.phase !== 'connected' || !this.status) return;
    this.bottleChecked = true;
    if (!this.status.calibrated || this.status.bottleSet) return;
    const { list, selected } = savedBottles();
    const bottle = list.find(b => b.id === selected);
    if (bottle) void this.command(`bottle ${bottle.grams}`).catch(() => { this.bottleChecked = false; });
  }
  async zero(): Promise<void> {
    this.say('Тэглэж байна…');
    await this.command('zero');
  }
  private answered(value: DataView): void {
    const text = new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    const tare = /^tare (\d+)$/.exec(text);
    const chosen = /^bottle (\d+)$/.exec(text);
    const saved = savedBottles();
    if (tare && this.newBottleName !== null) {
      const bottle = { id: crypto.randomUUID(), name: this.newBottleName, grams: Number(tare[1]) };
      writeBottles({ list: [...saved.list, bottle], selected: bottle.id });
      this.result = `«${bottle.name}» хадгалагдлаа: ${bottle.grams} г ✓`;
    } else if (chosen) {
      const bottle = saved.list.find(b => b.id === saved.selected);
      this.result = `${bottle ? `«${bottle.name}»` : 'Сав'} сонгогдлоо (${chosen[1]} г) ✓`;
    } else {
      // The base forgot its bottle when zeroed, so none is selected here either.
      if (text === 'zero' && saved.selected) writeBottles({ ...saved, selected: null });
      this.result = tare ? `Савны жин: ${tare[1]} г ✓`
        : text === 'tare-failed' ? 'Жин тогтворжсонгүй. Саваа хөдөлгөлгүй тавиад дахин оролдоно уу.'
        : text === 'zero' ? 'Суурийн жинг тэглэлээ ✓' : this.result;
    }
    if (tare || text === 'tare-failed') this.newBottleName = null;
    this.changed();
  }

  // The base's screen shows the app's total for today, so hand-logged drinks, deletions and resets show there too.
  // With the plan the base also knows the goal or limit, so its speaker can say how much is left.
  shareToday(ml: number, force = false, plan?: { goal: number; mode: 'goal' | 'limit' }): void {
    this.today = Math.max(0, Math.round(ml));
    if (plan) {
      this.plan = { goal: Math.round(plan.goal), mode: plan.mode };
      void watch?.setDay({ day: dayKey(), drunk: this.today, ...plan }).catch(() => {});
    }
    if (force) this.sentToday = '';
    void this.sendToday();
  }
  private async sendToday(): Promise<void> {
    if (this.phase !== 'connected' || this.today < 0) return;
    // "today <ml> <goal> <goal|limit>"; older firmware reads only the first number.
    const text = this.plan ? `today ${this.today} ${this.plan.goal} ${this.plan.mode}` : `today ${this.today}`;
    if (text === this.sentToday) return;
    this.sentToday = text;
    await this.command(text).catch(() => { this.sentToday = ''; });
  }
  // Clears today's drinks from the log (with the base's screen) — for a fresh demo.
  async resetToday(): Promise<void> {
    const today = dayKey();
    const removed = await store.update(record => {
      const before = record.state.events.length;
      record.state.events = record.state.events.filter(e => !(e.type === 'drink' && dayKey(new Date(e.at)) === today));
      return before - record.state.events.length;
    });
    if (removed) { announce('sync'); void sync.run(); }
    this.shareToday(0, true);
  }

  private onStatus(value: DataView): void {
    try { this.status = parseStatus(value); } catch { return; }
    this.restoreBottle();
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
// The strongest buzz with a loud sound in the Android app (Buzz.java), louder with every 10 ml past the
// goal or limit (`overMl`, 0 when close to it); elsewhere the browser's own buzz, where it has one.
export function strongBuzz(pattern: number[], overMl = 0): void {
  if (watch) void watch.buzz({ overMl: Math.max(0, Math.round(overMl)) }).catch(() => {});
  else navigator.vibrate?.(pattern);
}
(window as ScaleHost).dusalScale = scale;
