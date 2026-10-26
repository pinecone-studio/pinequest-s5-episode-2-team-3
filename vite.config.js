import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Each team part is its own page; list them here so `vite build` includes all.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        entries: resolve(import.meta.dirname, 'entries.html'),
        history: resolve(import.meta.dirname, 'history.html'),
        overview: resolve(import.meta.dirname, 'overview.html'),
        settings: resolve(import.meta.dirname, 'settings.html'),
        tabs: resolve(import.meta.dirname, 'tabs.html'),
      },
    },
  },
});
