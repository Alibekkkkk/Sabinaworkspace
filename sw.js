const CACHE_NAME = "learning-studio-shell-v1";
const SHELL_URLS = [
  "index.html",
  "portal.html",
  "dashboard.html",
  "lesson.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "homework.html",
  "practice.html",
  "clip.html",
  "manga.html",
  "offline.html",
  "manifest.webmanifest",
  "css/design-system.css",
  "css/portal-redesign.css",
  "js/config.js",
  "js/student-context.js",
  "js/protected-content.js",
  "js/sanitize-html.js",
  "js/pwa.js",
  "js/theme.js",
  "js/games/engine.js",
  "js/games/progress.js",
  "js/clips/schema.js",
  "js/manga/schema.js",
  "content/manifest.json",
  "assets/pwa/icon.svg",
  "assets/manga/garden-rooftop.svg",
  "assets/manga/garden-neighbors.svg",
  "assets/manga/garden-harvest.svg"
];
const SHELL_ASSETS = new Set(SHELL_URLS);
const SHELL_DOCUMENTS = new Set([
  "index.html",
  "portal.html",
  "dashboard.html",
  "lesson.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "homework.html",
  "practice.html",
  "clip.html",
  "manga.html"
]);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS.map(path => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("learning-studio-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const scope = new URL(self.registration.scope);
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const relativePath = url.pathname.slice(scope.pathname.length);
  const isDocument = request.mode === "navigate" &&
    (SHELL_DOCUMENTS.has(relativePath) || relativePath === "");
  if (!isDocument && !SHELL_ASSETS.has(relativePath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        url.search = "";
        await cache.put(isDocument ? url.href : request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedUrl = new URL(request.url);
      cachedUrl.search = "";
      const cached = await cache.match(isDocument ? cachedUrl.href : request);
      if (cached) return cached;
      if (isDocument) {
        const offlinePage = await cache.match(new URL("offline.html", scope).href);
        if (offlinePage) return offlinePage;
      }
      throw error;
    }
  })());
});
