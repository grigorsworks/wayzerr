// Keeps the Wayzerr phone app on the phone, so it opens even when the computer is away
// (and then shows "Phone disconnected" instead of an error page). Chats are never stored here.
const CACHE = 'wayzerr-shell-v6';
const SHELL = ['/', '/characters.js', '/talk.js', '/icon.png', '/apple-touch-icon.png', '/jsqr.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const key = u.pathname === '/index.html' ? '/' : u.pathname;
  if (!SHELL.includes(key)) return;
  // Fresh from the computer when it's there; the saved copy when it isn't.
  // Through the permanent address, a computer that is off answers with a Cloudflare error page (not a network error), so a bad answer also falls back to the saved copy.
  e.respondWith(fetch(e.request).then((r) => { if (!r.ok && r.status >= 500) return caches.match(key).then((c) => c || r); if (r.ok && key !== '/') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } if (r.ok && key === '/') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return r; }).catch(() => caches.match(key)));
});
