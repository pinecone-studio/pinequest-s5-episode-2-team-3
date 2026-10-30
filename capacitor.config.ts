import type { CapacitorConfig } from '@capacitor/cli';

// The native apps load the same Vite build (`dist`) that Cloudflare serves.
const config: CapacitorConfig = {
  appId: 'mn.pinecone.dusal',
  appName: 'Дусал',
  webDir: 'dist',
  backgroundColor: '#faf9f6',
  // The app opens on the tab host, which keeps all three tabs loaded (src/tabs.ts).
  server: { appStartPath: '/tabs.html' },
  // Android 15 draws apps under the status and navigation bars; margins keep the tab bar and the sheets
  // that open from the bottom clear of the system buttons.
  android: { adjustMarginsForEdgeToEdge: 'auto' },
};

export default config;
