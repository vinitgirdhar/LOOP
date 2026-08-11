/*
  Loop service worker.

  Three caching rules, chosen because they fail in the least surprising way:

    1. Built assets (/_next/static/**) are content-hashed, so a hit is always
       correct — cache first, never revalidate.
    2. Navigations are network first with a cached shell behind them. A stale
       page is better than a dinosaur, and the offline page is the last resort.
    3. API GETs are network first, and the last good response is kept so a
       reopened phone shows yesterday's board instead of an error. Anything
       that is not a GET is never cached and never replayed here — the client
       owns the mutation queue, because only it knows which failures are worth
       retrying and which are a 403.

  The version string is the cache name. Bumping it evicts everything, which is
  the entire upgrade strategy and is deliberately blunt.
*/

const VERSION = 'loop-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;

const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed precache must not block activation — the worker is still
      // useful for everything else.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Puts a response in a cache without ever failing the request it came from. */
function remember(cacheName, request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const copy = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => undefined);
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Another origin's caching is not ours to decide.
  if (url.origin !== self.location.origin) return;

  // Never cache auth or the share-link resolver: a cached session response is
  // a correctness bug, and a cached guest page could outlive its revocation.
  if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/public/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-') || url.pathname === '/logo.svg') {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((response) => remember(STATIC_CACHE, request, response))),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => remember(PAGE_CACHE, request, response))
        .catch(async () => (await caches.match(request)) ?? (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => remember(API_CACHE, request, response))
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            // Tell the app this is history, not live data, so the UI can say so.
            const headers = new Headers(cached.headers);
            headers.set('x-loop-offline', '1');
            return new Response(await cached.blob(), { status: cached.status, headers });
          }
          return new Response(
            JSON.stringify({ success: false, error: 'You are offline and this has not been loaded before', code: 'offline' }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }),
    );
  }
});

// The page asks for an immediate upgrade after it has told the reader.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
