const cacheName = 'rivion-v1';

// Sizning fayllaringiz ro'yxati
const assets = [
  '/',
  '/index.html',
  '/main.html',
  '/manifest.json',
  '/main.css',
  '/style.css',
  '/main.js',
  '/script.js',
  '/firebase-config.js',
  '/googlefe4c79b94fb8a333.html'
];

// Service Worker o'rnatilganda fayllarni keshga saqlash
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('RIVION: Fayllar keshlanmoqda...');
      return cache.addAll(assets);
    })
  );
});

// Ma'lumotlarni yetkazib berish (Oflayn rejimni qo'llab-quvvatlash)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      // Agar keshda bo'lsa keshdan oladi, bo'lmasa tarmoqdan yuklaydi
      return response || fetch(e.request);
    })
  );
});

// Eski keshni tozalash (Ilova yangilanganda)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== cacheName)
            .map((key) => caches.delete(key))
      );
    })
  );
});