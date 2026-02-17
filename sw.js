const CACHE_NAME = 'espanol-ia-v2';
// On ne garde que les fichiers locaux existants pour éviter les erreurs 404 dans le cache
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Promise.allSettled permet d'ignorer un fichier s'il est manquant sans bloquer le reste
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
});