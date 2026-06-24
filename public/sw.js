/* Minimal service worker: app-shell cache so the PWA is installable and the
   shell loads offline. API calls always go to the network. */
const CACHE = 'jarvis-shell-v4';
const BASE = '/jarvis';
const SHELL = [`${BASE}/`, `${BASE}/index.html`, `${BASE}/styles.css`, `${BASE}/app.js`, `${BASE}/manifest.json`];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith(`${BASE}/api/`)) return; // never cache API
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match(`${BASE}/index.html`)))
  );
});

// ---- Web Push ----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'JAB Jarvis', body: e.data && e.data.text() }; }
  const title = data.title || 'JAB Jarvis';
  const options = {
    body: data.body || '',
    icon: `${BASE}/icons/icon-192.png`,
    badge: `${BASE}/icons/icon-192.png`,
    tag: data.kind ? `${data.kind}-${data.taskId || ''}` : undefined,
    data: { taskId: data.taskId, kind: data.kind },
    requireInteraction: false,
    vibrate: [120, 60, 120],
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Tell any open page to play the notification sound.
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach((c) => c.postMessage({ type: 'play-sound', data }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  const url = taskId ? `${BASE}/?task=${taskId}` : `${BASE}/`;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
