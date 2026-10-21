import { isFresh, validateDeviceCache, type DeviceCache, type DeviceStatus } from '../shared/device';
import { validateId } from '../shared/contracts';
import type { LocalStore } from './local-store';

export class DeviceClient {
  cache: DeviceCache = { selectedId: null, devices: [] };
  phase: 'local' | 'paused' | 'ready' | 'error' = 'local';
  message = '';
  private running = false;
  constructor(private local: LocalStore, private send: typeof fetch = fetch,
    private changed: () => void = () => {}, private afterReading: () => Promise<void> = async () => {}) {}
  get selected(): DeviceStatus | undefined { return this.cache.devices.find(d => d.reading.deviceId === this.cache.selectedId); }
  get online(): boolean { return this.phase === 'ready' && !!this.selected && isFresh(this.selected); }
  async readCache(): Promise<void> { this.cache = (await this.local.read()).bottles ?? { selectedId: null, devices: [] }; }
  async select(id: string | null): Promise<void> {
    if (id !== null) validateId(id);
    await this.local.update(record => {
      const cache = record.bottles ?? { selectedId: null, devices: [] };
      if (id !== null && !cache.devices.some(d => d.reading.deviceId === id)) throw new Error('Сав олдсонгүй. Жагсаалтыг шинэчилнэ үү.');
      record.bottles = { ...cache, selectedId: id };
    });
    await this.readCache();
    this.changed();
  }
  async refresh(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const record = await this.local.read();
      this.cache = record.bottles ?? { selectedId: null, devices: [] };
      if (!record.sync || record.sync.paused) {
        this.phase = record.sync ? 'paused' : 'local';
        this.message = record.sync ? 'Синк түр зогссон.' : 'Эхлээд сервертэй холбоно уу.';
        return;
      }
      const url = record.sync.url;
      const send = this.send;
      const response = await send(`${url}/api/devices`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Савны мэдээллийг авч чадсангүй (${response.status}).`);
      const cache = validateDeviceCache({ selectedId: this.cache.selectedId, devices: await response.json() });
      const saved = await this.local.update(current => {
        if (current.sync?.url !== url || current.sync.paused) return false;
        current.bottles = { selectedId: current.bottles?.selectedId ?? null, devices: cache.devices };
        return true;
      });
      await this.readCache();
      if (!saved) { this.phase = 'paused'; this.message = 'Синк түр зогссон.'; return; }
      this.phase = 'ready'; this.message = '';
      // Events stay owned by the existing sync client; device status never edits the user's log.
      await this.afterReading();
    } catch (error) {
      this.phase = 'error';
      this.message = error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError' ? error.message : 'Сервертэй холбогдсонгүй. Сүүлд авсан хэмжилтийг харуулж байна.';
    } finally { this.running = false; this.changed(); }
  }
}
