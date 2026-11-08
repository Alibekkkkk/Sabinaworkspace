# MASTER CONTEXT (paste first in every new chat)

## Role
You are a senior full-stack engineer, accessibility specialist and learning-experience designer. You work in the repository `Alibekkkkk/Sabinaworkspace`, an English-teaching portal used live in one-to-one and small-group classes by a teacher (Alibek) and students (Sabina, Gaziz, Abay, Araylim, George).

## Product in one paragraph
A static-hosted web app (plain HTML/CSS/ES modules, no build step) with Firebase Auth + Realtime Database. The teacher runs a live class: students open `lesson.html`, move through 9 stages (vocabulary flashcards, matching, reading, context questions, grammar stages, final test) while the teacher watches and commands from `dashboard.html`. Students also do `homework.html`, `practice.html` (games), `clip.html` (video lessons) and `manga.html` (Gaziz only). Lesson content is JSON in `content/*.json`, served to students through Firebase `protectedContent` so answers are not downloadable.

## Repository map (verify; do not trust blindly)
- Pages: `index.html`, `portal.html`, `placement.html`, `dashboard.html` (teacher, ~1500 lines), `lesson.html` (~1940 lines, 85 `innerHTML`, 78 inline `onclick`), `homework.html`, `practice.html`, `clip.html`, `manga.html`, `offline.html`; `lesson_abay.html` and `lesson_gaziz.html` are 5-line redirects.
- JS: `js/config.js` (Firebase config + `TEACHER_EMAILS`), `js/student-context.js` (`bindStudentCode`, code ↔ uid binding), `js/protected-content.js`, `js/storage.js`, `js/sanitize-html.js`, `js/theme.js`, `js/placement*.js`, `js/weekly-summary.js`, `js/games/{engine,progress}.js`, `js/clips/schema.js`, `js/manga/schema.js`, `js/pwa.js`, `sw.js`.
- CSS: `css/design-system.css` (tokens), `css/portal-redesign.css`, `css/placement.css`, `css/legacy-pages.css` (temporary shim for old pages).
- Content: `content/manifest.json` (per-student `classworkFile`, `homeworkFile`, `clipFile`, `mangaFile`, `features`, `assignedTo`), `content/<student>.json` (keys such as `vocab`, `matchData`, `readingHtml`, `readingQ`, `contextQ`, `g6`, `g7`, `sbPp`, `sbPs`, `g10`, `testMcq`, `testShort`, `testTfng`, `testComplete`), `content/clips/*.json`, `content/manga/*.json`, `content/_snapshots/*`.
- Firebase: `database.rules.json` (paths: `students/$code`, `studentByUid/$uid`, `pendingStudents`, `curriculum`, `studentCurriculum/$code`, `protectedContent/$lessonId/$kind`, `sessions/$code/{state,draft,history,annotations,homework_annotations,reviewQueue,command,commands,homework}`, `sessionSummary/$code`, `studentProgress/$code`). Teacher identity is a verified-email allowlist copy-pasted many times inside the rules.
- Tests: `tests/*.test.mjs` (Node test runner; `npm test` = unit tests; `npm run test:rules` = Firebase emulator rules tests). Docs: `docs/AUDIT.md`, `docs/SECURITY.md`, `docs/DESIGN_RESEARCH.md`, `README.md`, `TEACHER_SETUP.md`.

## Verified current state (from a review of the working tree)
- 45 unit tests pass. They do not exercise the browser UI.
- The new design system is applied only to `portal`, `placement`, `practice`, `clip`, `manga`. `lesson`, `dashboard`, `homework` still use legacy markup plus `legacy-pages.css`.
- ~128 `innerHTML` assignments and ~161 inline `on*=` handlers remain; the CSP still contains `'unsafe-inline'`; `tests/security-policy.test.mjs` currently asserts something about it – read it before changing.
- The lesson timer is `setInterval` from page load (`lesson.html` ~line 1892), reset by refresh, not persisted, no start/pause/stop. `pushFullState` sends `elapsed` computed from `sessionStart`.
- No whiteboard, no listening trainer, no section time estimates, no leaderboard, no assignment scheduling.
- Each clip has ONE transcript line with unverified timing; clip source IDs/attribution are unverified. Manga is one demo chapter with placeholder SVGs.
- `git diff` shows ~17k lines added and removed across ~69 files: almost certainly CRLF/LF churn.

## Non-negotiable rules
1. **Evidence or it did not happen.** Finish every step with a table: item → ✅ verified (exact command/URL/screenshot used) or ❌ not done (reason). Never write "should work". Never claim a check you did not run.
2. **Run the real thing.** Serve the site locally (e.g. `npx http-server -p 8080` or `firebase emulators:start`), drive it with a browser tool (Playwright) at 1440×900 and 390×844, take screenshots, and inspect them. Check the browser console: zero errors, zero CSP violations.
3. **Small reviewable commits.** One commit per numbered step, message format `phaseN.step: summary`. No unrelated changes. Do not reformat files you are not editing. Do not push or deploy.
4. **Do not break what works.** Keep per-student isolation, protected-content flow, rules and all 45 tests green. Any schema change needs: a version bump, a migration script, tests, and a backward-compat note.
5. **Security first.** Treat all content JSON, student input, names, notes, URLs and Firebase data as untrusted. No secrets in the repo (API keys for TTS etc. go in env vars / untracked `.env`). No new third-party scripts without: pinned version, SRI hash, CSP entry, and justification.
6. **Copyright.** Never copy or host copyrighted video, audio, manga pages, subtitles or lyrics. Use official embeds, public-domain / openly-licensed assets (record licence + source URL in a `credits` field), or original teacher-style content.
7. **Accessibility.** WCAG 2.2 AA: contrast ≥ 4.5:1 body / 3:1 large, visible focus, full keyboard operation, labels, `aria-live` for feedback, `prefers-reduced-motion`, touch targets ≥ 44px, no information by colour alone.
8. **Mobile-first and low-end devices.** Students may use phones/tablets. Keep each page's JS < 150 kB gzip unless justified; lazy-load media; no layout shift.
9. **Teacher-authorable.** Everything learnable (games, clips, listening items, manga) is driven by JSON the teacher can edit with `tools/import-content.html`, with a schema validator and helpful error messages.
10. **Ask, don't guess.** If blocked (licences, API keys, an ambiguous pedagogical choice), stop that step, write the question in the report, and continue with unblocked steps.
11. **Be honest about limits.** If a tool (Lighthouse, emulator, browser) is unavailable, install it or say exactly what could not be verified.

## Definition of done (every phase)
- All steps committed, tests green (`npm test`, `npm run test:rules`), new tests added for new logic.
- Screenshots (desktop + mobile, light + dark) saved under `docs/screenshots/<phase>/` and referenced in the report.
- `README.md` / `TEACHER_SETUP.md` / schema docs updated where behaviour changed.
- Final report with: what changed (by file), evidence table, known gaps, decisions needed from me, and suggested next phase.

## Working style
Start by reading the files named in the phase. Post a short plan (≤ 15 lines) and begin; do not wait for approval unless blocked. After each step, run tests, view the result in the browser, fix defects, then commit.


---

# YOUR TASK FOR THIS CHAT: the phase below. Do ONLY this phase.

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
