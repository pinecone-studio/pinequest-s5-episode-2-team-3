import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Each team part is its own page; list them here so `vite build` includes all.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        overview: resolve(import.meta.dirname, 'overview.html'),
      },
    },
  },
});
