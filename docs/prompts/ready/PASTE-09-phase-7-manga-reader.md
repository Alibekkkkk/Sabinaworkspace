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

# PHASE 7 — Manga / manhwa reading mode for Gaziz (P3)

## ⛔ Blocker — ask me first
Before building more than the infrastructure, ask me (via the report) which content to use. Allowed sources only: (a) original panels drawn/commissioned by the teacher; (b) openly licensed or public-domain comics (e.g. Creative Commons webcomics, Wikimedia Commons, Internet Archive PD works) with the licence and URL recorded; (c) teacher-written scripts rendered with original/placeholder art; (d) **link-out** to an official licensed reader (e.g. publisher apps) with the student reading there and doing tasks here. **Never include scans/screenshots of commercial manga or manhwa.**

## Goal
A reading experience in the style of manga/manhwa that teaches English: read a panelled story with speech bubbles, tap to understand, collect vocabulary, answer comprehension questions, and earn rewards — enabled **only for Gaziz** for now, switchable per student.

## Current state (verify)
`manga.html`, `js/manga/schema.js` (`validateManga`, `addProtectedMangaAnswers`), `content/manga/gaziz-demo.json` (1 chapter), 3 placeholder SVGs in `assets/manga/`; manifest flag `features.mangaReader: true` and `mangaFeatureFor: "gaziz"`; rules grant `protectedContent/.../manga` only when `studentCurriculum/$code/$lessonId/features/mangaReader === true`.

## Step 1 — Feature flag as a first-class concept
- `features` map per student in `studentCurriculum/$code/features` (and manifest default) with helper `hasFeature(student, "mangaReader")`. Portal/nav/manga page render only when true; direct URL access for others shows a friendly "not enabled" page and rules deny the data. Teacher toggle in dashboard (Feature flags panel: mangaReader, clipLab, whiteboard, listeningTrainer). Test: Gaziz yes; Sabina no; toggling works; rules tests.

## Step 2 — Content format v2
```
{ schemaVersion: 2, id, title, series?, level: "B1", genre: ["action","slice-of-life"],
  credits: { author, artist, licence, sourceUrl, rights: "original|CC-BY|public-domain|licensed-link" },
  readingDirection: "ltr" | "rtl" | "vertical",
  chapters: [ { id, title, summary, estimatedMinutes, pages: [ { id, image: "assets/manga/…", alt, panels: [
      { id, bbox:[x,y,w,h], bubbles: [ { id, type:"speech|thought|narration|sfx", speaker, text, simplified, translation?, 
        audio?, vocabulary:[{word, meaning, example}], grammarNote? } ] } ] } ],
    vocabulary:[…], questions:[ … ], boss: {…} } ] }
```
- `alt` text required for every image and panel summaries for screen readers; validator checks bbox inside the image, ids unique, every question references real bubbles/panels, no external image hosts unless listed in an allowlist.
- Panel/bubble authoring: add a **visual editor** to `tools/import-content.html` — upload/choose image, drag panel rectangles, add bubbles by clicking, type text; exports validated JSON; supports importing a simple script (CSV/Markdown) for quick text-first creation.

## Step 3 — Reader
- Modes: **Vertical scroll (manhwa)**, **Page flip (manga/comic)**, **Panel-by-panel guided view** (zooms into each panel in order; the best mode on phones). Remember last position per chapter. Reading direction toggle (LTR/RTL).
- Bubbles: overlay hotspots (accessible `<button>`s with the bubble text as accessible name, not just images). Tap/click → bottom sheet with: original text, **simplified English** version, optional translation (toggle, off by default for Gaziz's level), grammar note, "🔊 Read aloud" (neural audio if provided else `speechSynthesis` en-GB), "Save sentence".
- Words: tap any word in the text sheet → definition from bubble vocabulary/lesson deck; Save to deck/review queue.
- Reading aids: font size, high-contrast text sheet, "hide text until tapped" challenge mode, spoiler-free progress.
- Performance: lazy-load page images, `loading=lazy`, `decoding=async`, responsive sizes, ≤ 250 kB per page image (WebP/AVIF with fallback), preload next page; works offline via service-worker cache of the chapter.
- Theme: dramatic dark theme for the reader (CSS tokens), respects light mode and reduced motion; subtle page-turn/scroll animations only if allowed.

## Step 4 — Learning loop and games
- Pre-reading: 6–8 target words (previewed with images/examples).
- During: optional **"Fill the bubble"** (hide a word in a bubble; choose/type it), **"Who said it?"**, **"What happens next?"** (predict), inline mini-quiz after each page spread (1 question, skippable).
- After chapter: comprehension questions (gist MCQ, detail short answer, inference long answer with rubric, vocabulary in context), a **chapter boss quiz** (reuse Phase 5 Boss Battle), and a retell/summary writing task for teacher review.
- Rewards: XP per page and per correct answer, a **reading streak**, "chapters collected" shelf, badges; time spent contributes to the Phase 2 clock when launched in a lesson.
- Difficulty adaptation for Gaziz: read his level from placement + his lesson content (`content/gaziz.json` vocabulary) and select/generate: shorter vs longer bubbles, simplified toggle default, more glosses on lower accuracy, fewer on higher. Write the adaptation rules in `docs/MANGA.md` and unit-test the selector.

## Step 5 — Teacher view
Dashboard: Gaziz's pages read, time, words saved, quiz accuracy, comprehension answers awaiting review; ability to assign a chapter with due date.

## Tests
Schema validator (good/bad fixtures), bbox/hotspot geometry, reading-position persistence, mode switching, adaptation selector, rules tests for feature flag, browser tests for each mode with keyboard and touch emulation, overflow/overlap checks at 390 px.

## Acceptance criteria
- Only Gaziz sees the manga entry; another student cannot read the content by URL (rules test).
- With licensed/original content supplied by me (or the clearly labelled demo), I can read in all three modes, tap bubbles/words, save vocabulary, answer chapter questions and see rewards.
- Credits and licence are shown in the reader and recorded in JSON; no commercial pages in the repo (run a check of `assets/manga` and report file sources).

## Non-goals
No scraping of manga sites; no OCR of copyrighted pages.
