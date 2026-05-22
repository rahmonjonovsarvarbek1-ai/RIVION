const cacheName = 'rivion-v2'; // Versiyani v2 qildik, eski kesh avtomatik o'chishi uchun

// Kesh qilinadigan asosiy fayllar ro'yxati
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

// 1. Service Worker o'rnatilganda fayllarni keshga yozish
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('RIVION: Baza fayllari keshga saqlanmoqda...');
      return cache.addAll(assets);
    }).then(() => self.skipWaiting()) // Yangi SW o'rnatilishi bilan darhol ishga tushadi
  );
});

// 2. Aktivatsiya bosqichi - Eski kesh versiyalarini butunlay o'chirish
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== cacheName) {
            console.log('RIVION: Eski kesh o‘chirilmoqda:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Barcha ochiq sahifalarni nazoratga oladi
  );
});

// 3. So'rovlarni boshqarish (Network-First strategiyasi)
self.addEventListener('fetch', (e) => {
  // Faqat HTTP va HTTPS so'rovlarini keshga tekshiramiz (Firebase yoki tashqi API'lar bilan xato bermasligi uchun)
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Agar internet bor bo'lsa, yangi faylni keshga ham saqlab qo'yamiz
        const resClone = res.clone();
        caches.open(cacheName).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => {
        // Agar internet o'chib qolsa (error bo'lsa), keshdan qidiradi
        return caches.match(e.request);
      })
  );
});