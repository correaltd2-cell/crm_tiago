/* NEW STAR — service worker: app shell cache-first (offline 100%) */
const VERSAO = 'newstar-v19';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './icon-192.png', './icon-512.png',
  './js/calc.js', './js/seed.js', './js/ui.js', './js/db.js', './js/rota.js',
  './js/pdf.js', './js/pedido.js', './js/ajuda.js', './js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // dados (Supabase/Google) sempre pela rede — a camada db.js cuida do offline
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const cp = res.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, cp));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
