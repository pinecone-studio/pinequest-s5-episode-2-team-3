import { API_URL } from './api';
import { store, announce } from './storage';
import { SyncClient } from './sync-client';

export const sync = new SyncClient(store, API_URL, fetch, announce);
let started = false;
export function startSync(): void {
  if (started) return;
  started = true;
  void sync.run();
  window.addEventListener('online', () => void sync.run());
  window.addEventListener('focus', () => void sync.run());
  window.addEventListener('dusal-local-save', () => void sync.run());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync.run(); });
  setInterval(() => { if (!document.hidden) void sync.run(); }, 30_000);
}
