// Service worker «Версты» (X-07): оболочка приложения работает без сети.
// Офлайн последнего маршрута (геометрия и расчёт) запланирован на v0.3 (ADR-0012).
const CACHE = "versta-shell-v1";
const SHELL = [
  "/",
  "/plan",
  "/manifest.webmanifest",
  "/icon.svg",
  "/fonts/Rubik-Regular.ttf",
  "/fonts/Rubik-Bold.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // API, тайлы и админка всегда из сети: данные должны быть свежими.
  if (["/api/", "/tiles/", "/admin"].some((prefix) => url.pathname.startsWith(prefix))) return;
  // Страницы: сначала сеть, без сети последняя сохранённая оболочка.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Сохраняем только оболочку приложения: «/» и «/plan».
          const key = url.pathname.startsWith("/plan")
            ? "/plan"
            : url.pathname === "/"
              ? "/"
              : null;
          if (key && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => caches.match("/plan").then((r) => r || caches.match("/"))),
    );
    return;
  }
  // Статика (сборка с хешами, шрифты, стиль карты): из кэша, иначе из сети с сохранением.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
