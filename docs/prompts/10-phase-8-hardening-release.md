# PHASE 8 — Hardening, performance, offline, docs, final audit (P4)

## Goal
Verify the whole product end-to-end, make it fast and resilient, close remaining gaps, and leave the project maintainable.

## Step 1 — PWA and offline
- `manifest.webmanifest` with proper icons (PNG 192/512 + maskable, not only SVG), `start_url`, `display: standalone`, theme colours, shortcuts (Lesson, Practice, Whiteboard).
- `sw.js`: versioned caches (shell, content, audio, images), strategies (shell: stale-while-revalidate; content JSON: network-first with cache fallback; audio/images: cache-first with size limits and LRU eviction; **never cache** auth endpoints or `protectedContent` answer payloads without encryption decision — document it), offline fallback page, update flow ("New version available – reload").
- Generate the precache list automatically from the file tree (`scripts/build-sw-manifest.mjs`) so new files can't be forgotten; test that every page/asset referenced by HTML is either cached or deliberately excluded.
- Offline-capable flows: open a lesson already loaded, practise cached games/listening, take notes; queue writes (Firebase offline persistence on) and show sync status.

## Step 2 — Performance
- Budgets: LCP < 2.5 s, CLS < 0.1, INP < 200 ms on a mid-range phone/4G; JS per page ≤ 150 kB gzip (excluding Firebase SDK: lazy-load only the Firebase modules each page needs, prefer modular v9+ imports); images WebP/AVIF; fonts subset and preloaded.
- Lighthouse CI config with assertions in `lighthouserc.json`; scores ≥ 90 Performance/Accessibility/Best Practices/SEO (mobile). Record results and fix regressions. If a budget can't be met, document why.
- Profile the lesson page and whiteboard (Chrome performance trace) and report 3 hot spots fixed.

## Step 3 — Security re-review (full)
- Re-run all XSS corpus tests; grep gates for `innerHTML`, `eval`, `new Function`, inline handlers, `target=_blank` without `rel=noopener`.
- Secrets scan over the full git history (`gitleaks`/`trufflehog` or equivalent) and a dependency audit (`npm audit`). Report any leaked keys (Firebase web config is public by design; anything else is not).
- HTTP headers via `firebase.json`: CSP (strict, nonce/hash), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (microphone only where needed), `Cross-Origin-Opener-Policy`, `frame-ancestors 'none'`, HSTS (hosting level). Verify with curl against the emulator/hosting config.
- Re-verify rules against the full threat list: student↔student isolation, privilege escalation, write abuse/size, timer/whiteboard/leaderboard/progress nodes, scheduling gates, feature flags.
- Privacy: data inventory in `docs/PRIVACY.md` (what is stored, where, retention, mic/speech consent, minors); a teacher "export/delete student data" tool.

## Step 4 — Robustness
- Global error boundary + user-friendly error page with a copyable diagnostic code; `window.onerror`/`unhandledrejection` logged to a capped `clientErrors/$code` node (rules-validated, rate-limited) for the teacher.
- Network edge cases: Firebase disconnect during test/timer/whiteboard, auth expiry, two tabs, clock skew, storage quota exceeded, blocked cookies/localStorage (private mode).
- i18n: move UI strings to `locales/en.json` and `locales/{ru,kk}.json` with a tiny `t()` helper; no hard-coded UI strings in JS. Language switch persisted; dates/numbers via `Intl`.

## Step 5 — Test suite and CI
- Unit + rules + content-lint + schema tests all in `npm test`; Playwright e2e suite (`npm run test:e2e`) covering: login/bind code, placement, lesson with timer (start/pause/stop), each stage, listening trainer round, whiteboard draw/persist, clip page, manga (Gaziz only), homework submit, teacher dashboard commands, scheduling gate, leaderboard opt-in, offline reload.
- GitHub Actions workflow (`.github/workflows/ci.yml`): install, unit, rules (emulator), content lint, Lighthouse CI, e2e (headless), upload screenshots on failure.
- Test coverage report for `js/` logic (`c8`); target ≥ 80 % on pure logic modules.

## Step 6 — Documentation
- `README.md`: quick start (`npm run dev`), architecture overview diagram (Mermaid), page map, data model diagram of Firebase paths.
- `TEACHER_SETUP.md`: step-by-step with screenshots — Firebase setup, admin claim, adding students, authoring each content type (lessons/sections, games, listening, clips, manga), running a class (timer, sections, whiteboard), assigning, reading reports, backups/restore.
- `docs/ARCHITECTURE.md`, `docs/GAMES.md`, `docs/CLIP_LAB.md`, `docs/MANGA.md`, `docs/PRIVACY.md`, ADRs in `docs/adr/`.
- A **changelog** and a "known limitations" list.

## Step 7 — Final acceptance review
Walk through, as each role, and record a screen-captured checklist (Playwright video or screenshots):
1. New visitor → register → bind code → placement → portal with learning path.
2. Student → live lesson with timer running, sections visible with estimates, listening trainer, whiteboard, game mode, finish; summary shows total time.
3. Teacher → dashboard: start/pause/stop timer, send commands, view live progress, review flags, assign with schedule, view weekly report and mastery analytics, toggle feature flags.
4. Gaziz → manga reader. Another student → manga not available.
5. Offline reload; dark/light; mobile and desktop; keyboard-only.

## Final report (required format)
1. Executive summary (≤ 10 lines).
2. Evidence table for every phase item from phases 0A–7: ✅/❌ with links to screenshots/test names.
3. Metrics: Lighthouse, bundle sizes, test counts and coverage, innerHTML/inline-handler/unsafe-inline counts (before → after).
4. Open issues and risks, ranked.
5. Decisions I must make and content I must supply.
6. Recommended next steps (≤ 8 bullets).
