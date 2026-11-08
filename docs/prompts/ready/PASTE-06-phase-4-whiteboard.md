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

# PHASE 4 — Whiteboard (P2)

## Goal
A full online whiteboard inside the portal — draw, erase, write, shapes, sticky notes, images, undo/redo, zoom/pan — usable by teacher and student in class (real-time shared) and by the student alone (personal board), saved per lesson.

## Research first (write `docs/WHITEBOARD_RESEARCH.md`, ≤ 1 page)
Compare feature sets of Miro, Excalidraw, tldraw, Microsoft Whiteboard, Google Jamboard (retired – use its feature list as history), Zoom Whiteboard, Explain Everything, Lucidspark and "Online Whiteboard for teaching" tools. Produce a table: feature → must / should / later, with the reason for a one-to-one English class (e.g. fast handwriting for spelling, underline/circle errors, sentence-building with sticky notes, annotate a reading text, laser pointer, templates for tenses).

## Feature scope
**Must**
- Tools: pen (smooth, pressure-aware), highlighter (multiply blend, translucent), eraser (stroke eraser + area/pixel eraser), laser pointer (temporary trail, visible to the other person), line, arrow, rectangle, ellipse, triangle, text, sticky note, select (click, marquee, shift-multi), move, resize, rotate, delete, duplicate, copy/paste, undo/redo (Ctrl/Cmd+Z/Shift+Z), clear board (confirm; teacher-controlled on the shared board).
- Style: colour palette + custom colour picker (AA-aware defaults), stroke width (4–5 presets + slider), opacity, fill on/off, font size for text.
- Canvas: infinite or large (e.g. 8000×6000) pannable canvas; zoom 25–400 % (wheel/pinch/buttons); fit-to-content; multiple pages with thumbnails; backgrounds: blank, grid, dots, ruled (lined for handwriting), and **English templates** (tense timeline, T-chart, sentence-builder table, mind map, Venn, word-family tree).
- Input: mouse, touch (two-finger pan/pinch), stylus (pressure, tilt optional, palm rejection by pointer type), `touch-action: none`, Pointer Events with `getCoalescedEvents`. Large target UI on tablets.
- Real-time collaboration: shared presence (coloured named cursors), live strokes visible within ~200 ms, permission modes set by the teacher: `view` / `draw` / `teacher-only`; student's personal board is private.
- Persistence: autosave per `lesson` and per `student` (`whiteboards/$code/$lessonId/$pageId`), restored on reload; version snapshot at class stop (Phase 2 hook); export PNG, SVG, PDF (client-side) and "attach snapshot to homework feedback".
- Images: paste/upload (≤ 2 MB, downscaled, type-sniffed png/jpeg/webp only, no SVG upload), stored as data URL in Storage or compressed in DB with a cap — choose and justify.
- Accessibility: every toolbar button labelled with tooltip + keyboard shortcut; full keyboard alternatives for select/move/delete/undo; high-contrast toolbar; `aria-live` announcements for mode and tool changes; an "alt text" field per image and a text-only "board contents" outline (screen-reader view listing text/sticky objects).
**Should**: lasso select, snap-to-grid/align guides, lock objects, layers/z-order, emoji/stamp/sticker set (✓ ✗ ★ ? with accessible names), shape recognition (rough circle → circle), ruler/protractor not needed, text formatting (bold/underline), voice-free "raise hand" button.
**Later**: embedding video, handwriting-to-text, AI features.

## Architecture decisions (record as `docs/adr/0001-whiteboard.md`)
Constraints: static hosting, no build step today, strict CSP (Phase 0A), Firebase RTDB.
- Option A: embed tldraw or Excalidraw. Both are React-based and need a bundler; adding a build step must be justified, SRI-pinned, and CSP-compatible, and bundle size reported.
- Option B: custom, dependency-free module using `<canvas>` (or SVG) with a vector object model, Pointer Events, and a small command history. Recommended unless A is clearly superior after measuring.
- Decide, document the trade-offs (maintenance, size, features, licence — both candidates are MIT), then implement.
Data model (vector, not bitmap), e.g.
```
board = { id, pageId, rev, objects: { [objId]: { t:"stroke|shape|text|sticky|image", z, x,y,w,h,rot, style:{…}, pts:"<delta-encoded simplified path>", by: uid, at: ts } } }
```
- Simplify strokes (Ramer–Douglas–Peucker / Catmull-Rom smoothing); delta-encode points; batch live-stroke updates at ≤ 20 Hz to `…/live/$uid`; commit to `objects` on pointer-up. Undo/redo is per-user and operates on own objects using inverse commands; conflict policy: last-writer-wins per object, deletes tombstoned.
- Size guard: per-object ≤ 8 kB, per-page ≤ 1.5 MB; compress and prune old pages; show a friendly "board is full" message.
- Rendering: requestAnimationFrame, dirty-rect redraw, offscreen canvas cache for committed layers; 60 fps with 2 000 strokes on a mid phone (measure and report).

## Rules (test all)
- `whiteboards/$code/$lessonId/$pageId`: read: owner student + teachers; write: teacher always; student only when `mode` is `draw` or when it is their personal board; `.validate` for object shapes/types/size caps; presence node writable only by self; `mode` node writable by teachers only.
- Deny cross-student read/write; deny oversize; deny unknown object types.

## UI placement
- A "Whiteboard" tab/drawer in `lesson.html` (side-by-side with the lesson on ≥ 1280 px; full-screen on mobile with an easy "back to lesson") and a standalone `whiteboard.html`. Teacher dashboard shows a live thumbnail of the student's board and a "Take control / Give control" button. Floating toolbar (bottom-centre on mobile, left rail on desktop), minimal chrome, dark/light backgrounds, colour presets that stay readable in both themes.

## Tests
- Unit: stroke simplification, serialisation round-trip, undo/redo stack, hit-testing, transform math, export.
- Rules tests (above). Browser tests: draw with synthetic pointer events, erase, undo, refresh → persisted; two browser contexts see each other's strokes; permission toggle works; performance trace recorded.

## Acceptance criteria
I can draw/erase/type/add shapes and sticky notes, zoom and pan, undo/redo, export a PNG, reload and see my board, and (with the teacher in another browser) see each other's drawing live; the teacher can switch student drawing on/off; all of it works on a tablet-sized viewport with touch; keyboard and screen-reader paths exist; no CSP violations.

## Non-goals
No video/voice calling, no AI features.
