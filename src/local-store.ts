import { defaults, STORAGE_KEY, validateState, type AppState } from './data';
import { mutation, snapshot, sameState, type Snapshot, type Mutation } from '../shared/sync';

export interface LocalRecord {
  version: 1;
  state: AppState;
  sequence: number;
  sync?: { url: string; base: Snapshot | null; attempt?: Mutation; paused?: boolean };
  lease?: { owner: string; until: number };
}

function checked(value: LocalRecord): LocalRecord {
  if (value.version !== 1 || !Number.isSafeInteger(value.sequence) || value.sequence < 0) throw new Error('Хадгалсан мэдээллийн бүтэц буруу байна.');
  value.state = validateState(value.state);
  if (value.sync !== undefined) {
    if (!value.sync || typeof value.sync !== 'object') throw new Error('Синк хадгалалтын бүтэц буруу байна.');
    if (value.sync.paused !== undefined && typeof value.sync.paused !== 'boolean') throw new Error('Синкийн төлөв буруу байна.');
    const url = new URL(value.sync.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Серверийн хаяг буруу байна.');
    if (value.sync.base !== null) value.sync.base = snapshot(value.sync.base);
    if (value.sync.attempt !== undefined) value.sync.attempt = mutation(value.sync.attempt);
  }
  if (value.lease && (typeof value.lease.owner !== 'string' || !Number.isFinite(value.lease.until))) throw new Error('Синкийн түгжээ буруу байна.');
  return value;
}

// Snapshot and unsent work share one atomic record: quota/errors cannot save only half a change.
export class LocalStore {
  private opened?: Promise<IDBDatabase>;
  constructor(private name = 'dusal-app-v2', private factory: IDBFactory = indexedDB,
    private legacy = () => localStorage.getItem(STORAGE_KEY)) {}
  private open(): Promise<IDBDatabase> {
    if (!this.opened) this.opened = new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('app');
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.opened = undefined; }; resolve(request.result); };
      request.onerror = () => { this.opened = undefined; reject(request.error); };
      request.onblocked = () => { this.opened = undefined; reject(new Error('Storage upgrade blocked')); };
    });
    return this.opened;
  }
  async update<T>(change: (record: LocalRecord) => T, recovery?: AppState): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('app', 'readwrite');
      const store = tx.objectStore('app');
      const request = store.get('state');
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          let record: LocalRecord;
          try {
            const old = request.result as LocalRecord | undefined;
            const raw = old === undefined ? this.legacy() : null;
            record = old === undefined ? { version: 1, state: raw === null ? defaults() : validateState(JSON.parse(raw)), sequence: 0 } : checked(old);
          } catch (error) {
            if (!recovery) throw error;
            // Only the explicit backup confirmation can replace unreadable storage; leave legacy bytes untouched.
            record = { version: 1, state: validateState(recovery), sequence: 0 };
          }
          const before = structuredClone(record.state);
          result = change(record);
          record.state = validateState(record.state);
          if (!sameState(before, record.state)) record.sequence++;
          store.put(checked(record), 'state');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('Storage write failed'));
    });
  }
  read(): Promise<LocalRecord> { return this.update(record => structuredClone(record)); }
}
