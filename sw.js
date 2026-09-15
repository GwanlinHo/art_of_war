/* Service Worker：快取全部檔案供離線閱讀
 * 更新任何檔案後，請把 CACHE_NAME 版號加一 */
var CACHE_NAME = "sunzi-cache-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./sunzi.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* 快取優先；快取沒有才走網路並補進快取 */
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === "basic") {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return resp;
      });
    }).catch(function () {
      if (event.request.mode === "navigate") {
        return caches.match("./index.html");
      }
      return new Response("", { status: 503, statusText: "offline" });
    })
  );
});
