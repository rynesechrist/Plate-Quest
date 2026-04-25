const CACHE_NAME = 'plate-quest-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/plates/alabama.jpg',
  '/plates/alaska.jpg',
  '/plates/arizona.jpg',
  '/plates/arkansas.jpg',
  '/plates/california.jpg',
  '/plates/colorado.jpg',
  '/plates/connecticut.jpg',
  '/plates/dc.jpg',
  '/plates/delaware.jpg',
  '/plates/florida.jpg',
  '/plates/georgia.jpg',
  '/plates/hawaii.jpg',
  '/plates/idaho.jpg',
  '/plates/illinois.jpg',
  '/plates/indiana.jpg',
  '/plates/iowa.jpg',
  '/plates/kansas.jpg',
  '/plates/kentucky.jpg',
  '/plates/louisiana.jpg',
  '/plates/maine.jpg',
  '/plates/maryland.jpg',
  '/plates/massachusetts.jpg',
  '/plates/michigan.jpg',
  '/plates/minnesota.jpg',
  '/plates/mississippi.jpg',
  '/plates/missouri.jpg',
  '/plates/montana.jpg',
  '/plates/nebraska.jpg',
  '/plates/nevada.jpg',
  '/plates/new-hampshire.jpg',
  '/plates/new-jersey.jpg',
  '/plates/new-mexico.jpg',
  '/plates/new-york.jpg',
  '/plates/north-carolina.jpg',
  '/plates/north-dakota.jpg',
  '/plates/ohio.jpg',
  '/plates/oklahoma.jpg',
  '/plates/oregon.jpg',
  '/plates/pennsylvania.jpg',
  '/plates/rhode-island.jpg',
  '/plates/south-carolina.jpg',
  '/plates/south-dakota.jpg',
  '/plates/tennessee.jpg',
  '/plates/texas.jpg',
  '/plates/utah.jpg',
  '/plates/vermont.jpg',
  '/plates/virginia.jpg',
  '/plates/washington.jpg',
  '/plates/west-virginia.jpg',
  '/plates/wisconsin.jpg',
  '/plates/wyoming.jpg'
];

// Install: cache all core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for everything (app works fully offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
