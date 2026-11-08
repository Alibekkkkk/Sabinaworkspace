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

# PHASE 0B — Finish the unfinished work from the first prompt (P0)

## Goal
Close every item an earlier agent reported as unfinished or left half-done, and fix the layout defects visible on the login and placement pages.

## Read first
`placement.html`, `js/placement.js`, `js/placement-page.js`, `css/placement.css`, `portal.html`, `css/portal-redesign.css`, `index.html`, `js/weekly-summary.js`, `database.rules.json`, `content/manifest.json`.

## Step 1 — Login / portal visual defects (reproduce each with a screenshot first)
1. Active "Sign in" tab: dark-blue text on blue background (unreadable). Fix to ≥ 4.5:1; check hover, focus, disabled states.
2. The "Learning Studio" heading is clipped at the top of the card on small viewports (likely `line-height`/overflow/padding). Fix at 320, 390, 768, 1440 widths.
3. The theme (sun) toggle overlaps the subtitle text ("pick up where yo…"). Reserve space; make it a labelled `<button aria-pressed>`.
4. The student-code input is pre-filled ("SABIN") — a privacy leak and wrong UX. Never pre-fill. On load, clear legacy keys (`nd_student_code`, `nd_student_name`, `nd_session_code`, `nd_state_*`, `nd_draft_*`, `nd_vocab_*`) unless the signed-in uid owns them, and never auto-enter the portal for a different uid.
5. A tiny checkbox below the code field has no label and no visible focus. Add a visible label ("Remember me on this device"), `<label for>`, 44px target, and explain what it stores.
6. Check the whole login/register flow with keyboard only, and with a screen-reader labels audit (every input has a programmatic label, errors are announced via `aria-live`).

## Step 2 — Placement test: make it real
Current state: 12 multiple-choice questions, no progress, no result, nothing saved.
- Layout bugs: question titles ("1. Choose the correct greeting.") straddle the top border of the card; the header card has a big empty bottom area; radios/options are oversized and the page is too long on mobile. Redesign as a one-question-at-a-time flow with progress bar ("3 / 12"), large tappable option cards, back/next, keyboard shortcuts (1–3, Enter), and a result page.
- Expand to 24–30 adaptive questions across A1–C1 (start at A2; go up/down depending on answers; stop early when confident). Mix item types: multiple choice, gap typing, sentence ordering, and one short listening item (browser TTS en-GB is acceptable here). Keep an item bank in `content/placement/items.json` with CEFR tags, a schema validator and tests.
- Scoring: `assessPlacement()` returns `{cefr, confidence, strengths[], weaknesses[], suggestedPath[]}`. Add unit tests including boundary cases and "all wrong"/"all right".
- Persistence: save to `studentProgress/$code/placement/{takenAt, cefr, confidence, answers[], durationMs}` with rules (student writes own, teacher reads all, max one retake per 7 days unless teacher resets). Show the previous result and allow retake.
- Integration: the portal home shows "Your level: B1 (estimated)" and a **learning path** (ordered list of lessons/games/clips recommended from weaknesses). The teacher dashboard shows the placement result on the student card and can override the level. State clearly it is a rough guide, not an exam.
- Anonymous/unregistered users may try the test but results are not stored.

## Step 3 — Opt-in class leaderboard
- Privacy by design: students are opted OUT by default; opt-in toggle in settings with plain-language explanation; they choose a nickname (validated: 3–16 chars, no profanity list match, no real-name check needed; teacher can rename/remove).
- Data: `leaderboard/$classId/$code: {nickname, weeklyXp, updatedAt}` written by the student for self only (rules validate numeric caps, e.g. weeklyXp ≤ 5000 per week); reads limited to students of the same class and the teacher. Weekly reset is computed by `weekId` key (ISO week) not by deletion.
- UI: top 10 + own rank, weekly/all-time tabs, friendly (celebrate improvement, not only first place), no exposure of other students' real names/codes.
- Tests: rules (cannot write another code, cannot read other class, cannot exceed caps) and pure ranking function.

## Step 4 — Assignment scheduling
- Teacher can, per student or group, assign a lesson/homework/practice/clip/manga with: `availableFrom`, `dueAt`, `closesAt` (optional), `published`. Students see "Due in 2 days / Overdue / Locked until …". Use `studentCurriculum/$code/$lessonId` fields; keep `published !== false` semantics of current rules and extend rules to enforce `availableFrom` server-side via `now >= availableFrom` in the `protectedContent` read rule.
- Teacher UI in `dashboard`: calendar/list view, bulk assign to multiple students, duplicate to next week, edit/delete, see completion state. Time zone: store UTC, display in the teacher's and student's local time (and show the zone).
- Weekly summary (`js/weekly-summary.js`) includes due/overdue and time spent.
- Tests: pure scheduling functions (`isAvailable`, `dueState`) with DST/timezone edge cases, and rules tests.

## Step 5 — Lighthouse and axe baseline
- Install and run Lighthouse CI (or `npx lighthouse` with Chrome headless; install Chromium if missing) against: login, portal, placement, practice, clip, manga, and (with seeded emulator data) lesson, homework, dashboard. Record Performance/Accessibility/Best Practices/SEO for mobile and desktop in `docs/LIGHTHOUSE.md` with the commit hash.
- Run axe-core on each page and list violations. Fix all "critical/serious" ones that are in code you own; list remaining ones.
- Add `npm run audit:web` so I can repeat it.

## Step 6 — Seed/demo mode for local testing
- Provide `npm run dev` (static server + Firebase emulators + seed script `scripts/seed-emulator.mjs`) creating a teacher, 3 students with codes, lessons assigned, and sample progress, so every page can be opened locally and tested without production data. Document in README.

## Acceptance criteria
- All 6 login defects have before/after screenshots at 390 and 1440 widths.
- Placement result persists and is visible in portal and dashboard; rules tests prove isolation.
- Leaderboard opt-out default verified by test and screenshot.
- Scheduling gates content server-side (prove with a rules test that a student cannot read `protectedContent` before `availableFrom`).
- `docs/LIGHTHOUSE.md` exists with real numbers.

## Non-goals
No redesign of lesson/dashboard/homework (Phase 1). No new game types.
