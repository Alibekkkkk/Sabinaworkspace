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
