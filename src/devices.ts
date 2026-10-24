import { store, announce } from './storage';
import { sync } from './sync';
import { DeviceClient } from './device-client';
import { scale } from './scale';

export const devices = new DeviceClient(store, fetch, () => announce('device'), () => sync.run());
let started = false;
export function startDevices(): void {
  if (started) return;
  started = true;
  // A remembered Bluetooth base reconnects on every page that shows device data.
  scale.start();
  void devices.refresh();
  window.addEventListener('online', () => void devices.refresh());
  window.addEventListener('focus', () => void devices.refresh());
  window.addEventListener('dusal-device-cache', () => {
    void devices.readCache().then(() => window.dispatchEvent(new Event('dusal-device-view'))).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void devices.refresh(); });
  setInterval(() => { if (!document.hidden) void devices.refresh(); }, 15_000);
}
export function deviceSummary(): string {
  if (!devices.cache.selectedId) return 'Гараар бүртгэж байна · үлдэгдэл тооцоолсон';
  if (!devices.selected) return 'Савны хэмжилт хүлээж байна';
  if (!devices.online) return 'Савтай холболт шинэчлэгдээгүй · сүүлчийн хэмжилт';
  if (!devices.selected.reading.stable) return 'Сав хөдөлгөөнтэй эсвэл хэмжилт боломжгүй';
  return 'Савны хэмжилт ирж байна';
}
