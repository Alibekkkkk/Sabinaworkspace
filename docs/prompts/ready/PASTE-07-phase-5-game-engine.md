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

# PHASE 5 — Game engine and real exercise conversion (P3)

## Goal
Make gamification part of the actual lesson, not a side page. Convert the lesson stages and homework into game-like interactions where it helps learning, add a coherent reward loop, and give the teacher insight.

## Current state (verify)
- `js/games/engine.js` already exports `createPracticeGames`, `validateGame`, `evaluateGame`, `createReviewGame`, `applyGamification`, `updateReviewQueue`, `createVocabMatchGame`, with a `SUPPORTED_GAME_TYPES` set (word-match, memory-cards, speed-quiz, fill-gap, sentence-builder, hangman, word-scramble, listening-dictation, pronunciation, flashcards, boss-battle, story-choice, crossword, word-search). Many are declared but may not have real UIs. `js/games/progress.js` saves to `studentProgress/$code`. `practice.html` hosts them. The main `lesson.html` stages do NOT use the engine.
- First, audit: for each game type write a table "declared? generator? validator? UI? tests? used in lesson?" and report it before building.

## Principles
1. Games must serve a learning objective; each game declares `skill` (vocab/grammar/reading/listening/speaking/spelling), `cefr`, `estimatedMinutes`.
2. Do not trivialise: long-answer reading questions and teacher-reviewed writing stay as written tasks; they get game *framing* (quest, progress, XP), not trivia conversion.
3. Mastery over luck: reward accuracy and spaced revisits; avoid pay-to-win loops, punishing hearts that block a student mid-class (teacher can disable hearts; default for live lessons = no lockout).
4. Keep it calm for neurodiverse learners: a settings panel with "reduce animation", "no timers" (swaps timed modes for untimed), "no sound".

## Step 1 — Engine hardening
- Define a stable game contract (`docs/GAMES.md`): `{id,type,skill,cefr,items[],config,rewards}`, lifecycle (`init → render → answer → evaluate → finish`), result shape `{score,max,accuracy,durationMs,mistakes[]}`.
- Each game module in `js/games/types/<type>.js` exporting `create(config)`, `render(container, state, bus)`, `evaluate`. UI built with `js/dom.js` helpers (no innerHTML), keyboard accessible, mobile friendly, ARIA live feedback.
- Shared services: sound (WebAudio tiny sfx, mute), haptics (`navigator.vibrate`, optional), confetti (reduced-motion aware), timer (uses Phase 2 clock when inside a lesson).

## Step 2 — Game types (implement real UIs, one commit each, each with tests + a sample JSON)
1. **Word Match / Memory Cards** — pairs word ↔ meaning/example/image; flip animation; accuracy + moves.
2. **Speed Quiz** (Kahoot style) — timed MCQ with streak bonus; untimed accessible variant.
3. **Sentence Builder** — drag/tap word tiles into order (touch-friendly tap-to-place as an alternative to drag), distractors, punctuation tiles.
4. **Gap-Fill with Word Bank / typed gaps** — uses accepted-alternatives and Phase 0A grader.
5. **Word Scramble & Hangman** — letters; hint costs XP; vocabulary from lesson.
6. **Listening Dictation** — reuse Phase 3 module as a game type.
7. **Pronunciation Challenge** — optional; Phase 3 speech layer; coaching not scoring.
8. **Boss Battle** — end-of-unit test framed as a fight: correct answers damage the boss, mistakes cost "shield", all driven by the existing `testMcq/testShort/testTfng/testComplete`; no hard lockout; summary of weak points.
9. **Story Choice** — branching mini-story where each choice requires a correct grammar form; JSON-driven graph with validation (no dead ends, no cycles unless intended).
10. **Crossword & Word Search** — generated from lesson vocabulary with a deterministic seeded generator (same seed → same puzzle), accessible grid navigation (arrow keys, screen-reader row/col labels).
11. **Error Hunt** (new) — find the mistake in a sentence/paragraph and fix it.
12. **Word Formation Race** (new, from Phase 2 forms) — transform root words quickly.

## Step 3 — Convert real lesson stages (without losing function)
Map each stage to a game wrapper while preserving content keys and grading:
- Stage 1 flashcards → "Collect the cards" (cards earned by correct quiz; deck progress map); keep flip/audio/review-flag.
- Stage 2 matching/drag-drop → Word Match/Memory.
- Reading comprehension → "Mission" framing + Error Hunt/Find-the-evidence mini games for TFNG; long answers remain written.
- Context questions and grammar stages → Gap-fill, Sentence Builder, Word Formation Race.
- Final test → Boss Battle (existing time limit/one-attempt rule respected, configurable by teacher).
Provide a per-lesson teacher toggle `gameMode: "full" | "light" | "off"` so a teacher can run a classic lesson. Document the mapping table in `docs/GAMES.md`.

## Step 4 — Reward loop and meta-game
- XP (per item, accuracy and streak bonuses, daily cap against grinding), levels (thresholds in config), gems/coins (spend on avatar items/themes, not on answers), badges (≥ 20, with criteria and icons; e.g. "Perfect round", "7-day streak", "Word collector 100", "Listening ear"), daily streak with **freeze** (earned, auto-used), weekly goals/quests ("Learn 15 words", "3 listening rounds"), avatar customisation (original assets).
- Server-side integrity: XP/gem writes validated in rules (increments ≤ per-session cap; totals can't decrease except by teacher); anti-tamper note: client XP is not security-sensitive but must not break the leaderboard (Phase 0B).
- Spaced repetition: Leitner boxes (1,3,7,14,30 days — existing `REVIEW_INTERVALS_DAYS`), "Practice" button builds a queue from `reviewQueue` (mistakes, saved words, flagged items) with a daily limit and a clear "You're done" state.
- Celebrations calibrated: small for items, big for stage, epic for unit; never block progression.

## Step 5 — Teacher insight
- Dashboard "Games & mastery" tab: per student — games assigned/played, accuracy by skill and topic, weakest items (top 10), time spent (from Phase 2 clocks), streaks, XP trend; per class — leaderboard (opt-in), most-missed words. CSV export. Teacher can assign a specific game with params and a due date (Phase 0B scheduling), or push a "mistake round" to a student.

## Tests
- Unit tests per game type (generation determinism with seeds, evaluation, edge cases: empty input, duplicates, Unicode, long words).
- Gamification maths (levels, caps, streak-freeze, week rollover across year boundary).
- Rules tests for progress caps.
- Browser tests: play one round of each game with keyboard only; complete a full lesson in game mode and in off mode.

## Acceptance criteria
- Every game type in the table has a working UI, a sample JSON, a validator and tests; the audit table at the start shows "before" and the end shows "after".
- A student can complete a lesson in game mode with all original content reachable and grading intact; teacher sees mastery analytics.
- No inline handlers/innerHTML added; axe clean; works at 390 px.

## Non-goals
No multiplayer real-time game rooms, no purchases, no third-party ad/analytics SDKs.
