import type { CapacitorConfig } from '@capacitor/cli';

// The native apps load the same Vite build (`dist`) that Cloudflare serves.
const config: CapacitorConfig = {
  appId: 'mn.pinecone.dusal',
  appName: 'Дусал',
  webDir: 'dist',
  backgroundColor: '#faf9f6',
};

export default config;
