// Offline support: pages are network-first, hashed build assets cache-first.
const CACHE = 'dusal-v2';
const PAGES = ['/', '/overview.html', '/entries.html', '/history.html', '/settings.html'];

// Production serves /overview for /overview.html, so both share one cache key.
const pageKey = url => new URL(url, self.location.origin).pathname.replace(/\.html$/, '').replace(/\/index$/, '/');

// A redirected response can't answer a navigation, so store a plain copy.
async function plain(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

// Cache each page plus the JS/CSS it references, so every page opens offline after one visit.
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(PAGES.map(async page => {
    const response = await plain(await fetch(page, { cache: 'no-cache' }));
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(pageKey(page), response);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
    await cache.addAll(assets);
  }));
}

self.addEventListener('install', event => event.waitUntil(precache().then(() => self.skipWaiting())));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()),
));

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(pageKey(request.url), (await plain(response)).clone());
    return response;
  } catch {
    return (await cache.match(pageKey(request.url))) ?? (await cache.match('/')) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Icons and the manifest: answer from cache, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached ?? Response.error());
  return cached ?? fresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
  else event.respondWith(staleWhileRevalidate(request));
});
