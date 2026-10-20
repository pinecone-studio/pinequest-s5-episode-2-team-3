import { merge, sameState, snapshot, revision, type Conflict, type Choices, type Snapshot } from '../shared/sync';
import type { LocalStore, LocalRecord } from './local-store';

export type SyncPhase = 'local' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'error' | 'paused';
export interface SyncInfo { phase: SyncPhase; message: string; conflicts: Conflict[] }

export class SyncClient {
  info: SyncInfo = { phase: 'local', message: 'Энэ төхөөрөмжид хадгалж байна.', conflicts: [] };
  private running = false;
  private again = false;
  private owner = crypto.randomUUID();
  private choices: Choices = {};
  private conflictContext?: string;
  constructor(private local: LocalStore, private url: string, private send: typeof fetch = fetch,
    private changed: (source: 'sync' | 'status') => void = () => {}) {}
  private status(phase: SyncPhase, message: string, conflicts: Conflict[] = []) {
    this.info = { phase, message, conflicts };
    this.changed('status');
  }
  async connect(): Promise<void> {
    await this.local.update(record => {
      if (!record.sync) record.sync = { url: this.url.replace(/\/$/, ''), base: null };
      record.sync.paused = false;
    });
    await this.run(true);
  }
  async pause(): Promise<void> {
    await this.local.update(record => { if (record.sync) record.sync.paused = true; });
    this.status('paused', 'Синк түр зогссон. Өөрчлөлт энэ төхөөрөмжид хадгалагдана.');
  }
  async choose(choices: Choices): Promise<void> { this.choices = choices; await this.run(true); }
  private async request(url: string, init?: RequestInit): Promise<Response> {
    const send = this.send;
    return send(`${url}/api/sync`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  }
  private owned(record: LocalRecord) {
    if (record.lease?.owner !== this.owner || record.sync?.paused) throw new Error('Синк өөр цонхонд үргэлжилж байна эсвэл түр зогссон.');
    record.lease.until = Date.now() + 30_000;
    return record.sync!;
  }
  async run(reviewed = false): Promise<void> {
    if (this.running) { this.again = true; return; }
    if (this.info.phase === 'conflict' && !reviewed) return;
    this.running = true;
    let acquired = false;
    try {
      const initial = await this.local.update(record => {
        if (!record.sync || record.sync.paused) return record.sync ? 'paused' : 'local';
        if (record.lease && record.lease.owner !== this.owner && record.lease.until > Date.now()) return 'busy';
        record.lease = { owner: this.owner, until: Date.now() + 30_000 };
        return 'acquired';
      });
      if (initial !== 'acquired') {
        if (initial === 'local') this.status('local', 'Энэ төхөөрөмжид хадгалж байна.');
        else if (initial === 'paused') this.status('paused', 'Синк түр зогссон. Өөрчлөлт энэ төхөөрөмжид хадгалагдана.');
        else this.status('pending', 'Өөр цонхонд синк хийж байна.');
        return;
      }
      acquired = true;
      this.status('syncing', 'Сервертэй синк хийж байна…');
      for (let tries = 0; tries < 8; tries++) {
        const local = await this.local.read();
        const config = local.sync!;
        if (config.attempt) {
          const attempt = config.attempt;
          const response = await this.request(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
          if (response.status === 409) {
            const error = await response.json();
            if (error.code !== 'revision') throw new Error('Сервер хүсэлтийн ID-г хүлээн авсангүй. Хадгалсан өөрчлөлт устгагдаагүй.');
            await this.local.update(record => { const sync = this.owned(record); if (sync.attempt?.id === attempt.id) delete sync.attempt; });
            continue;
          }
          if (!response.ok) throw new Error(`Сервертэй синк хийж чадсангүй (${response.status}). Өөрчлөлт хадгалагдсан.`);
          const ack = await response.json();
          if (ack.id !== attempt.id || revision(ack.revision) < attempt.baseRevision) throw new Error('Серверийн хариу буруу байна.');
          await this.local.update(record => {
            const sync = this.owned(record);
            if (sync.attempt?.id !== attempt.id) throw new Error('Pending request changed');
            sync.base = { revision: ack.revision, state: attempt.state };
            delete sync.attempt;
          });
          this.changed('status');
          continue;
        }
        const response = await this.request(config.url);
        if (!response.ok) throw new Error(`Сервер синкийг дэмжихгүй эсвэл холбогдох боломжгүй (${response.status}).`);
        const remote: Snapshot = snapshot(await response.json());
        let conflict: Conflict[] = [];
        let synced = false;
        let stateChanged = false;
        await this.local.update(record => {
          const sync = this.owned(record);
          // Choices apply only to the exact versions the user reviewed, never to later edits.
          const context = JSON.stringify([remote, record.state]);
          if (this.conflictContext !== context) this.choices = {};
          const result = merge(sync.base?.state ?? null, record.state, remote.state, this.choices);
          if (result.conflicts.length) { conflict = result.conflicts; this.conflictContext = context; return; }
          stateChanged = !sameState(record.state, result.state);
          record.state = result.state;
          sync.base = remote;
          if (sameState(result.state, remote.state)) synced = true;
          else sync.attempt = { id: crypto.randomUUID(), baseRevision: remote.revision, state: result.state };
          this.choices = {}; this.conflictContext = undefined;
        });
        if (stateChanged) this.changed('sync');
        if (conflict.length) { this.status('conflict', 'Хоёр талд давхар өөрчилсөн мэдээлэл байна. Аль хувилбарыг хадгалахаа сонгоно уу.', conflict); return; }
        if (synced) { this.status('synced', 'Бүртгэл, өдрийн тохиргоо сервертэй синк болсон.'); return; }
      }
      this.status('pending', 'Өөрчлөлт хадгалагдсан. Үлдсэн синкийг дахин оролдоно.');
    } catch (error) {
      const paused = await this.local.read().then(record => record.sync?.paused).catch(() => false);
      this.status(paused ? 'paused' : 'error', paused ? 'Синк түр зогссон.' : (error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError' ? error.message : 'Сервертэй холбогдсонгүй. Өөрчлөлт төхөөрөмжид хадгалагдсан; дахин оролдоно.'));
    } finally {
      if (acquired) await this.local.update(record => { if (record.lease?.owner === this.owner) delete record.lease; }).catch(() => {});
      this.running = false;
      if (this.again) { this.again = false; queueMicrotask(() => void this.run()); }
    }
  }
}

