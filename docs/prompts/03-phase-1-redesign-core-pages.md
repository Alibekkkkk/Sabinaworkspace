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
