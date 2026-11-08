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

# PHASE 1 — Redesign lesson, dashboard and homework (P1)

## Goal
Bring the three pages used in every class to the same modern, gamified, accessible standard as the new pages, so the whole product feels like one app. Remove `css/legacy-pages.css`.

## Context
`lesson.html` (student live class, 9 stages), `dashboard.html` (teacher control room), `homework.html`. After Phase 0A their logic lives in `js/pages/*.js` with delegated handlers and no inline script. This phase is presentation + UX + component structure, not new features (timer and sections come in Phase 2; do leave a reserved header area for them).

## Step 1 — Design research (document, don't copy)
Review how these products solve the same problems and write decisions in `docs/DESIGN_RESEARCH.md` (append): Duolingo (lesson path, progress bar, feedback sheet), Busuu, Kahoot (bold feedback, timers), Quizlet (flashcards), LingQ and Language Reactor (reader/transcript), Webtoon (reader), Khan Academy (mastery), Google Classroom / Teams for Education and Zoom (teacher control layout), tldraw/Miro (toolbar layout for later). For each: 2 things adopted, 1 thing avoided, and why it fits one-to-one tutoring. Include accessibility patterns (feedback not only by colour; calm mode).

## Step 2 — Design system extension (`css/design-system.css` + `css/components/*.css`)
- Tokens: colour scales (brand, success, warning, danger, neutral) for light AND dark, with computed contrast table in docs; type scale (fluid `clamp`), spacing 4-pt grid, radii, elevation, motion durations/easings, z-index layers.
- Components with documented markup and states (default, hover, focus-visible, active, disabled, loading, error): button (primary/secondary/ghost/danger/icon), card, chip/badge, progress bar and ring, stat tile, tabs, stepper, modal/sheet, toast, tooltip, input/textarea, segmented control, skeleton, empty state, banner/alert, avatar/mascot slot, toolbar.
- Add a living style guide page `styleguide.html` (not linked in nav, `noindex`) rendering every component in both themes. Use it for visual review.
- Typography: choose a friendly, readable pair (e.g. a rounded display face + a highly legible UI face). Self-host fonts (woff2, subset, `font-display: swap`) instead of Google Fonts to remove the third-party dependency and CSP allowance.
- Imagery: SVG illustrations/mascot (original, no copyrighted characters), consistent stroke style, lightweight (< 8 kB each). Provide empty-state and celebration illustrations.

## Step 3 — App shell
- Common header with logo, student name/avatar, level/XP chip, theme toggle, and a reserved **lesson bar slot** (timer + section progress, Phase 2).
- Navigation: sidebar on ≥ 1024px; bottom tab bar on mobile (Home, Lesson, Practice, Clips, Homework, Me). Manga tab shown only when the feature flag is on.
- Route-level states: skeleton while loading, friendly offline banner, error page with retry and diagnostic code.

## Step 4 — `lesson.html` redesign
- Left: stage path (the 9 stages as a vertical/horizontal learning path with state: locked/current/done/mastered, from the real stage list in content metadata — not a hard-coded array). Centre: current activity in a focused card. Right (≥ 1280px) or collapsible drawer: notes, saved words, teacher messages.
- Every existing capability must still work: flashcards (flip, audio, review-flag), quiz modal, drag-and-drop, reading with annotations and sticky notes, context questions, completing-sentence and sentence-builder stages, flag-for-teacher-review, final test (timer, one attempt), live teacher commands (goto stage, reset), notes and drafts autosave.
- Feedback design: immediate, kind, specific. A bottom "feedback sheet" (green/red with icon + text, never colour alone) showing correct answer and the grammar reason; haptic-free micro-animations; confetti (respects reduced motion) on stage completion.
- Content readability: reading text max-width 70ch, 18–20px, adjustable font size and line spacing, dyslexia-friendly option (increase spacing, optional font), highlight colours with AA contrast.
- Remove the compatibility redirects `lesson_abay.html` / `lesson_gaziz.html` or leave them as documented 301-style redirects with a test.

## Step 5 — `dashboard.html` redesign (teacher)
- Layout: top "Today" strip (live students, who is stuck, pending review flags), left student list with status dots (online/idle/stuck), main student detail (current stage, score, time on stage, notes, answers), right command panel (go to stage, reset stage, send message, assign). Keep every existing function: curriculum editing, student code management, review flags, history, export, weekly report, import tool link.
- Information density appropriate for a teacher on a laptop while teaching; large safe targets for destructive actions with confirm dialogs and undo toast where possible.
- Charts: lightweight inline SVG (no heavy chart library) for progress over time and weak-topic bars.

## Step 6 — `homework.html` redesign
- Per-question cards, autosave indicator, progress bar, "submit" confirm modal summarising unanswered items, result screen with per-question feedback and XP. Respect stable-ID answer keys (Phase 0A).

## Step 7 — Cleanup and quality gates
- Delete `css/legacy-pages.css` and all rules only used by it. Update `sw.js` shell list and bump `CACHE_NAME`.
- Visual regression: Playwright screenshots of each page in light/dark × 390/768/1440 saved to `docs/screenshots/phase1/`; fail the script if the page has horizontal scroll, text clipped, or overlapping elements (write an automated overlap/overflow check using `getBoundingClientRect`).
- axe: zero critical/serious on all three pages. Lighthouse accessibility ≥ 95, performance ≥ 85 on mobile for lesson (record).
- Keyboard-only walkthrough of a whole lesson recorded as a Playwright test.

## Acceptance criteria
- No page references `legacy-pages.css`. All three pages use only design-system tokens (grep shows no hard-coded hex colours outside the tokens file).
- Every capability in step 4–6 verified by an automated or documented manual click-through listed in the report.
- Responsive, no horizontal scroll at 320px.
- No regression in the 45+ tests; add tests for any logic extracted during the refactor.

## Non-goals
No timer, no new games, no whiteboard (reserve space only).
