import { Capacitor } from '@capacitor/core';

// Only production web builds get the service worker: `vite dev` should never serve stale files,
// and the native apps already bundle every file.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
