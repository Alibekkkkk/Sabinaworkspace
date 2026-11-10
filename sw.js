// Learning Studio service worker. Caches, by kind:
//   shell    (pages, scripts, styles, icons)  precached; stale-while-revalidate; rolled over when CACHE_VERSION changes
//   content  (content/**/*.json)              network-first, cached copy when offline
//   audio    (content/audio/*.mp3)            cache-first, at most MAX_AUDIO files, oldest dropped first
//   images   (assets/**, content/**)          cache-first, at most MAX_IMAGES files, oldest dropped first
// Never cached: other origins (Firebase, sign-in, fonts), anything that is not a GET, partial (Range) responses, and the
// reserved sign-in paths. Protected lesson content and answer keys travel over Firebase connections, not through this worker,
// so they are never stored here; see docs/SECURITY.md ("Offline and protected content").
// The precache list below is generated: run `node scripts/build-sw-manifest.mjs` after adding or removing files.
// BEGIN GENERATED (scripts/build-sw-manifest.mjs)
const CACHE_VERSION = "25b975ea6e";
const SHELL_URLS = [
  "clip.html",
  "clips.html",
  "dashboard.html",
  "homework.html",
  "index.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "lesson.html",
  "listening.html",
  "manga.html",
  "offline.html",
  "placement.html",
  "portal.html",
  "practice.html",
  "whiteboard.html",
  "assets/illustrations/celebrate.svg",
  "assets/illustrations/empty.svg",
  "assets/illustrations/mascot.svg",
  "assets/manga/garden-harvest.svg",
  "assets/manga/garden-neighbors.svg",
  "assets/manga/garden-p1.svg",
  "assets/manga/garden-p2.svg",
  "assets/manga/garden-p3.svg",
  "assets/manga/garden-p4.svg",
  "assets/manga/garden-p5.svg",
  "assets/manga/garden-rooftop.svg",
  "assets/pwa/apple-touch-icon.png",
  "assets/pwa/icon-192.png",
  "assets/pwa/icon-512.png",
  "assets/pwa/icon-maskable-512.png",
  "assets/pwa/icon.svg",
  "content/manifest.json",
  "css/components/controls.css",
  "css/components/feedback.css",
  "css/components/page-aliases.css",
  "css/components/progress.css",
  "css/components/surfaces.css",
  "css/design-system.css",
  "css/pages/clip.css",
  "css/pages/clips.css",
  "css/pages/dashboard.css",
  "css/pages/games.css",
  "css/pages/homework.css",
  "css/pages/legacy-index.css",
  "css/pages/lesson.css",
  "css/pages/listening.css",
  "css/pages/manga.css",
  "css/pages/offline.css",
  "css/pages/portal.css",
  "css/pages/practice.css",
  "css/pages/whiteboard.css",
  "css/placement.css",
  "css/portal-redesign.css",
  "js/audience.js",
  "js/auth-persistence.js",
  "js/auth.js",
  "js/bounded-realtime-list.js",
  "js/celebrate.js",
  "js/charts.js",
  "js/clips/catalog.js",
  "js/clips/exercise-ui.js",
  "js/clips/exercises.js",
  "js/clips/lines.js",
  "js/clips/player.js",
  "js/clips/schema-v2.js",
  "js/clips/schema.js",
  "js/clock-controls.js",
  "js/clock-report.js",
  "js/clock-service.js",
  "js/clock-ui.js",
  "js/config.js",
  "js/dashboard-clock.js",
  "js/dashboard-status.js",
  "js/delegated-actions.js",
  "js/diagnostic.js",
  "js/dom.js",
  "js/error-card.js",
  "js/error-log.js",
  "js/feature-gate.js",
  "js/features.js",
  "js/games/engine.js",
  "js/games/game-mode-card.js",
  "js/games/game-mode.js",
  "js/games/lesson-layer.js",
  "js/games/mastery-card.js",
  "js/games/mastery-summary.js",
  "js/games/panels.js",
  "js/games/progress.js",
  "js/games/rewards.js",
  "js/games/runtime.js",
  "js/games/seed.js",
  "js/games/settings.js",
  "js/games/types/boss-battle.js",
  "js/games/types/error-hunt.js",
  "js/games/types/pairs.js",
  "js/games/types/puzzles.js",
  "js/games/types/sequence.js",
  "js/games/types/speed-quiz.js",
  "js/games/types/story-choice.js",
  "js/games/types/tiles.js",
  "js/games/types/typed.js",
  "js/games/types/word-formation.js",
  "js/games/ui.js",
  "js/grading.js",
  "js/grammar-ladder-ui.js",
  "js/grammar-ladder.js",
  "js/homework-answers.js",
  "js/i18n.js",
  "js/leaderboard.js",
  "js/lesson-clock-ui.js",
  "js/lesson-clock.js",
  "js/lesson-meta.js",
  "js/listening-card.js",
  "js/listening-summary.js",
  "js/listening/answers.js",
  "js/listening/audio.js",
  "js/listening/character.js",
  "js/listening/dictation.js",
  "js/listening/levels.js",
  "js/listening/schema.js",
  "js/listening/speaking.js",
  "js/manga/adaptation.js",
  "js/manga/geometry.js",
  "js/manga/learning-ui.js",
  "js/manga/learning.js",
  "js/manga/reader-state.js",
  "js/manga/reader-ui.js",
  "js/manga/schema-v2.js",
  "js/manga/schema.js",
  "js/manga/shelf.js",
  "js/notices.js",
  "js/pages/clip.js",
  "js/pages/clips.js",
  "js/pages/dashboard.js",
  "js/pages/homework.js",
  "js/pages/index.js",
  "js/pages/legacy-index.js",
  "js/pages/lesson_abay.js",
  "js/pages/lesson_gaziz.js",
  "js/pages/lesson.js",
  "js/pages/listening.js",
  "js/pages/manga.js",
  "js/pages/portal.js",
  "js/pages/practice.js",
  "js/pages/styleguide.js",
  "js/pages/whiteboard.js",
  "js/placement-page.js",
  "js/placement.js",
  "js/privacy/dashboard-card.js",
  "js/privacy/student-data.js",
  "js/protected-content.js",
  "js/pwa.js",
  "js/reading-prefs.js",
  "js/reading-tasks-ui.js",
  "js/reading-tasks.js",
  "js/safe-storage.js",
  "js/sanitize-html.js",
  "js/schedule.js",
  "js/sections.js",
  "js/shell.js",
  "js/storage.js",
  "js/student-code.js",
  "js/student-context.js",
  "js/tab-guard.js",
  "js/theme.js",
  "js/ui.js",
  "js/weekly-summary.js",
  "js/whiteboard/app.js",
  "js/whiteboard/board.js",
  "js/whiteboard/dashboard-card.js",
  "js/whiteboard/export.js",
  "js/whiteboard/geometry.js",
  "js/whiteboard/history.js",
  "js/whiteboard/images.js",
  "js/whiteboard/model.js",
  "js/whiteboard/renderer.js",
  "js/whiteboard/snapshot.js",
  "js/whiteboard/sync.js",
  "js/whiteboard/templates.js",
  "js/word-family-ui.js",
  "js/word-family.js",
  "locales/en.json",
  "locales/kk.json",
  "locales/ru.json",
  "manifest.webmanifest"
];
// END GENERATED
const CACHE_PREFIX = "learning-studio-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const CONTENT_CACHE = `${CACHE_PREFIX}content-v1`;
const AUDIO_CACHE = `${CACHE_PREFIX}audio-v1`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-v1`;
const MAX_AUDIO = 60;
const MAX_IMAGES = 120;
const SHELL_ASSETS = new Set(SHELL_URLS);
const SHELL_DOCUMENTS = new Set(SHELL_URLS.filter(path => path.endsWith(".html")));
const IMAGE_PATTERN = /\.(svg|png|jpe?g|webp|avif|gif)$/i;

self.addEventListener("install", event => {
  // A new version waits here until the student agrees to reload ("New version available"); see the message handler below.
  // "reload" skips the browser's HTTP cache, so a new version never precaches an older copy of a file the host cached for an hour.
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => Promise.all(SHELL_URLS.map(path => cache.add(new Request(new URL(path, self.registration.scope).href, { cache: "reload" }))))));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(`${CACHE_PREFIX}shell-`) && key !== SHELL_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Keeps a cache to its limit by dropping the oldest entries (the cache lists entries oldest first; a hit is re-added to stay fresh).
async function trim(cache, maximum) {
  const keys = await cache.keys();
  for (let index = 0; index < keys.length - maximum; index += 1) await cache.delete(keys[index]);
}

async function cacheFirst(request, cacheName, maximum) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }));
  if (cached) { if (cacheName !== SHELL_CACHE) { try { await cache.put(request, cached.clone()); } catch (error) { /* keep serving */ } } return cached; }
  const response = await fetch(request);
  if (response.ok && response.type === "basic" && response.status === 200) { await cache.put(request, response.clone()); await trim(cache, maximum); }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Stale-while-revalidate: answer from the cache at once and refresh it in the background.
async function staleWhileRevalidate(event, request, key, isDocument, scope) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key);
  const refresh = fetch(request).then(async response => {
    if (response.ok && response.type === "basic") await cache.put(key, response.clone());
    return response;
  }).catch(() => null);
  if (cached) { event.waitUntil(refresh); return cached; }
  const fresh = await refresh;
  if (fresh) return fresh;
  if (isDocument) { const offlinePage = await cache.match(new URL("offline.html", scope).href); if (offlinePage) return offlinePage; }
  return Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const scope = new URL(self.registration.scope);
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const relativePath = url.pathname.slice(scope.pathname.length);
  if (relativePath.startsWith("__/") || request.headers.has("range")) return; // reserved sign-in paths and partial media are never cached

  if (/^content\/audio\/.*\.(mp3|ogg|m4a)$/.test(relativePath)) { event.respondWith(cacheFirst(request, AUDIO_CACHE, MAX_AUDIO)); return; }
  if (relativePath.startsWith("content/") && relativePath.endsWith(".json") && relativePath !== "content/manifest.json") { event.respondWith(networkFirst(request, CONTENT_CACHE)); return; }

  const isDocument = request.mode === "navigate" && (SHELL_DOCUMENTS.has(relativePath) || relativePath === "");
  if (isDocument || SHELL_ASSETS.has(relativePath)) {
    const key = new URL(isDocument && relativePath === "" ? "index.html" : relativePath, scope);
    event.respondWith(staleWhileRevalidate(event, request, key.href, isDocument, scope));
    return;
  }
  if (IMAGE_PATTERN.test(relativePath) && (relativePath.startsWith("assets/") || relativePath.startsWith("content/"))) event.respondWith(cacheFirst(request, IMAGE_CACHE, MAX_IMAGES));
});
