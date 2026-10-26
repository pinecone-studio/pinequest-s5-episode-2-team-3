import type { CapacitorConfig } from '@capacitor/cli';

// The native apps load the same Vite build (`dist`) that Cloudflare serves.
const config: CapacitorConfig = {
  appId: 'mn.pinecone.dusal',
  appName: 'Дусал',
  webDir: 'dist',
  backgroundColor: '#faf9f6',
  // The app opens on the tab host, which keeps all three tabs loaded (src/tabs.ts).
  server: { appStartPath: '/tabs.html' },
};

export default config;
