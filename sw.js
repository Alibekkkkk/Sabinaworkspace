const CACHE_NAME = "learning-studio-shell-v12";
const AUDIO_CACHE = "learning-studio-audio-v1";
const SHELL_URLS = [
  "index.html",
  "portal.html",
  "placement.html",
  "dashboard.html",
  "lesson.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "homework.html",
  "practice.html",
  "listening.html",
  "whiteboard.html",
  "clip.html",
  "manga.html",
  "offline.html",
  "manifest.webmanifest",
  "css/design-system.css",
  "css/components/controls.css",
  "css/components/surfaces.css",
  "css/components/progress.css",
  "css/components/feedback.css",
  "css/components/page-aliases.css",
  "css/placement.css",
  "css/portal-redesign.css",
  "js/config.js",
  "js/auth.js",
  "js/student-context.js",
  "js/bounded-realtime-list.js",
  "js/dom.js",
  "js/protected-content.js",
  "js/sanitize-html.js",
  "js/pwa.js",
  "js/theme.js",
  "js/reading-prefs.js",
  "js/shell.js",
  "js/celebrate.js",
  "js/weekly-summary.js",
  "js/placement.js",
  "js/placement-page.js",
  "js/games/engine.js",
  "js/games/progress.js",
  "js/grading.js",
  "js/word-family.js",
  "js/games/rewards.js",
  "js/games/game-mode.js",
  "js/games/game-mode-card.js",
  "js/games/lesson-layer.js",
  "js/games/settings.js",
  "js/games/seed.js",
  "js/games/ui.js",
  "js/games/runtime.js",
  "js/games/panels.js",
  "js/games/mastery-summary.js",
  "js/games/mastery-card.js",
  "js/games/types/pairs.js",
  "js/games/types/puzzles.js",
  "js/games/types/tiles.js",
  "js/games/types/typed.js",
  "js/games/types/sequence.js",
  "js/games/types/error-hunt.js",
  "js/games/types/boss-battle.js",
  "js/games/types/speed-quiz.js",
  "js/games/types/story-choice.js",
  "js/games/types/word-formation.js",
  "css/pages/games.css",
  "js/listening-card.js",
  "js/listening-summary.js",
  "js/listening/schema.js",
  "js/listening/answers.js",
  "js/listening/levels.js",
  "js/listening/audio.js",
  "js/listening/character.js",
  "js/listening/dictation.js",
  "js/listening/speaking.js",
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
  "js/pages/whiteboard.js",
  "css/pages/whiteboard.css",
  "js/clips/schema.js",
  "js/clips/schema-v2.js",
  "js/clips/lines.js",
  "js/clips/exercises.js",
  "js/clips/exercise-ui.js",
  "js/clips/player.js",
  "js/manga/schema.js",
  "js/pages/clip.js",
  "js/pages/tools-clips.js",
  "js/clips/authoring.js",
  "css/pages/clip.css",
  "js/pages/dashboard.js",
  "css/pages/dashboard.css",
  "js/pages/homework.js",
  "css/pages/homework.css",
  "js/pages/index.js",
  "js/pages/legacy-index.js",
  "css/pages/legacy-index.css",
  "js/pages/lesson.js",
  "css/pages/lesson.css",
  "js/pages/lesson_abay.js",
  "js/pages/lesson_gaziz.js",
  "js/pages/manga.js",
  "css/pages/manga.css",
  "css/pages/offline.css",
  "js/pages/portal.js",
  "css/pages/portal.css",
  "js/pages/listening.js",
  "css/pages/listening.css",
  "js/pages/practice.js",
  "css/pages/practice.css",
  "js/pages/tools-import-content.js",
  "css/pages/tools-import-content.css",
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
  "placement.html",
  "dashboard.html",
  "lesson.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "homework.html",
  "practice.html",
  "listening.html",
  "whiteboard.html",
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
  // Listening: packs are network-first, audio is cache-first in its own cache so rounds work offline once heard.
  if (relativePath.startsWith("content/audio/") && /\.mp3$/.test(relativePath)) {
    event.respondWith(caches.open(AUDIO_CACHE).then(async cache => {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic" && response.status === 200) await cache.put(request, response.clone());
      return response;
    }));
    return;
  }
  if (relativePath.startsWith("content/listening/") && relativePath.endsWith(".json")) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    }));
    return;
  }
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
