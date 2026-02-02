const CACHE_NAME = 'sys-integration-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './W513.png',
  './小港分機查詢圖檔.webp',
  './總部交換機號碼管理圖檔.svg',
  './地圖標註圖檔.png',
  './資產辨識網頁圖檔.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
