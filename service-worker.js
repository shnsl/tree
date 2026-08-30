// Build 2026-01 - sifir cache & mobil guncelleme zorlamasi

// Tek ayar dosyasi (app-config.js) cache adini ve surumu belirler.
importScripts('./app-config.js');
const APP_VERSION = self.PWA_CONFIG.VERSION;
const CACHE_NAME = self.PWA_CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Kullanicinin "Guncelle" butonuna tiklayinca beklemede olan yeni surumu aktiflestirir.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ana sayfa (HTML) navigasyonlari icin: once ag -> kullanicilar her zaman
  // en guncel surumu gorur, mobil cache sorunu yasanmaz.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || caches.match('./index.html'))
        )
    );
    return;
  }

  // Diger statik dosyalar (ikon, manifest vb.): once cache, olmazsa ag.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
