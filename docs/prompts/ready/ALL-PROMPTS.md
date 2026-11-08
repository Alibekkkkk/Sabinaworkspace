# ALL PROMPTS (each section below is one self-contained paste)



=====================  01-phase-0a-hygiene-security.md  =====================

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

# PHASE 0A — Repository hygiene and security hardening (P0)

## Goal
Make the codebase safe and reviewable before building anything new: clean diffs, no inline script, no unsafe HTML injection, a CSP without `'unsafe-inline'`, a single source of teacher identity, and the carried-over audit defects fixed.

## Why this matters
Student names, notes, content fields and Firebase data are rendered with `innerHTML` and inline `onclick` in 128+161 places. Any one unescaped field is stored XSS that can read another student's data or act as the teacher. A 17k-line line-ending diff also hides real changes in review.

## Read first
`docs/AUDIT.md`, `docs/SECURITY.md`, `js/sanitize-html.js`, `tests/security-policy.test.mjs`, `tests/sanitization.test.mjs`, `database.rules.json`, `tests/rules.test.mjs`, `js/config.js`, and the inline `<script>` blocks of `lesson.html`, `dashboard.html`, `homework.html`, `portal.html`.

## Step 1 — Line endings and junk (commit alone)
- Add `.gitattributes`: `* text=auto eol=lf` plus `*.png *.jpg *.svg binary` where appropriate.
- Run `git add --renormalize .`. Verify with `git diff --stat` that the only changes are whitespace-level, and that `git diff -w --stat` is empty or tiny.
- Delete `database-debug.log` (and ensure `*.log`, `.firebase/`, `node_modules/` are ignored).
- Acceptance: `git status` clean afterwards; the commit contains no behavioural change; `npm test` still passes.

## Step 2 — Extract inline scripts and styles
- Move each page's inline `<script>` into `js/pages/<page>.js` (ES module) and inline `<style>` into `css/pages/<page>.css`. Keep behaviour identical.
- Pages keep only: `<meta>` tags, links, and `<script type="module" src>`.
- Acceptance: no `<script>` without `src`, no `<style>` blocks and no `style="..."` attributes with dynamic data in any page (static presentational `style=` should be moved to classes).

## Step 3 — Remove every inline event handler
- Replace each `onclick=`, `onchange=`, `oninput=`, `onkeydown=` etc. with delegated listeners: elements carry `data-action="name"` and validated `data-*` params; one `document.addEventListener('click', …)` per page dispatches through a whitelist map `{ actionName: handler }`.
- Never build handler arguments by string concatenation (see `jsArg(...)` calls in `lesson.html` around the flag-for-review buttons). Params must be read from `dataset` and validated (type, length, charset) in the handler.
- Acceptance: `grep -rnE " on[a-z]+=" *.html js` returns nothing; every previously clickable control still works (list them in the report and show you clicked each in the browser).

## Step 4 — Replace every `innerHTML` sink
- For each of the ~128 sinks decide: (a) static markup → `<template>` cloned with `cloneNode`; (b) data text → `textContent`/`createElement`; (c) intentionally rich teacher content (e.g. `readingHtml`) → pass through `sanitizeHtml()` with a strict allowlist (`p, br, strong, em, ul, ol, li, mark, span[data-*], h3, h4, blockquote`; no `style`, no `on*`, no `javascript:` URLs, no `<svg>`/`<iframe>`).
- Create `js/dom.js` with small safe helpers (`el(tag, attrs, ...children)`, `clear(node)`, `setText`). Use them rather than ad-hoc string templates.
- The sanitizer must be tested against an XSS corpus (at least 40 payloads: `<img src=x onerror>`, `<svg onload>`, `javascript:` hrefs, `<a href=data:>`, nested/malformed tags, mutation-XSS patterns, HTML entities, Unicode tricks). Add them to `tests/sanitization.test.mjs`.
- Acceptance: `grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" *.html js` shows only calls inside `js/sanitize-html.js` (documented). Provide the before/after count.

## Step 5 — Strict CSP
- Remove `'unsafe-inline'` from `script-src` and `style-src` on every page. If any inline remains, use a hash and list it. Keep `object-src 'none'`, `base-uri 'self'`, `frame-ancestors` where possible (note: `frame-ancestors` is ignored in a `<meta>` CSP — add `firebase.json` `headers` for real HTTP CSP and document it).
- Add `Trusted Types` (`require-trusted-types-for 'script'`) if feasible without breaking Firebase SDK; otherwise document why not.
- Update `tests/security-policy.test.mjs` and `docs/SECURITY.md` so the test asserts the new strict policy on every HTML file.
- Acceptance: open every page in the browser; DevTools console shows **zero** CSP violations; Google sign-in, Firebase, YouTube embed still work.

## Step 6 — Single teacher identity
- Today the verified-email allowlist is pasted ~25 times in `database.rules.json` and again in `js/config.js`, `dashboard.html`, `lesson.html`, `homework.html`.
- Introduce `admins/$uid: true` in the database (writable only by existing admins / by console), or set a custom claim `admin: true` via a documented one-off script (`scripts/set-admin-claim.mjs`) and test on `auth.token.admin === true`. Pick one, justify in 5 lines, implement, and migrate the rules to a single reusable condition pattern.
- Client code reads `isTeacher` from one function in `js/auth.js`; no email literals remain anywhere in HTML/JS.
- Acceptance: `grep -rn "@gmail.com\|@nu.edu.kz" .` finds nothing outside `docs/` setup instructions; `npm run test:rules` still passes with new tests for: non-admin cannot write admin node, student cannot read another student, teacher can read all.

## Step 7 — Carry-over defects from `docs/AUDIT.md` (fix each, add a test)
1. Teacher command schema mismatch (`resetStage` vs `reset`): define one schema `{id, type, payload, createdAt: SERVER_TIMESTAMP}` under `sessions/$code/commands/$id`; student acks under `.../ack`. Remove the single `command` node and the client-clock `Date.now()-10000` check.
2. Hard-coded values: `/ 130` score, `sabina` in storage keys/channel names, `DEFAULT_STAGES`, `maxScore || 130`, `maxScore||80`, `total||16`. Read from content/manifest metadata; add `maxScore` and `stages` to each content file (migration script) and validate.
3. Dashboard subscribes to the whole `sessions` tree: subscribe to `sessionSummary` (compact) and open one student's detail on demand.
4. Homework: fail closed (never fall back to another student's file), key answers by stable question `id`, archive old attempts instead of resetting submitted records, define a shared `showToast` (move into `js/ui.js`, `role="status"`).
5. Grader (`isAnswerCorrect` copies in `lesson` and `homework`): extract to `js/grading.js`. Grammar items = exact match after normalisation (case, whitespace, curly quotes, trailing punctuation). Reading/short answers = bounded fuzzy match (Levenshtein ≤ 1 for words ≥ 6 chars) with accepted-alternatives array. Add a UK/US spelling map (`organise/organize`, `centre/center`, `learnt/learned`, `colour/color`, …) and contraction handling. Never strip auxiliaries/negations. Test with a table of ≥ 60 cases including known false positives (e.g. "did not go" vs "did go").
6. Lessons with empty `assignedTo` are visible to everyone: require `audience: "all"` or explicit assignment.
7. Registration reads all `students`: generate a code server-side-style (random 8-char from a safe alphabet) and claim only `students/<code>` atomically.

## Step 8 — Firebase configuration review (write findings to `docs/SECURITY.md`)
- List what is public by design (Firebase web config) and what protects data (rules). Give me the exact console steps to restrict the API key by HTTP referrer and to enable App Check (optional) — do not attempt console actions.
- Review rules for: unbounded writes (add `.validate` size/type caps on every student-writable node), missing `.validate` on `reviewQueue`, `annotations`, `state`, `studentProgress`; ensure a student cannot write a field that makes the teacher dashboard render HTML.
- Add rules tests for every student-writable path (own code OK, other code denied, oversized payload denied, wrong types denied).

## Non-goals
No visual redesign here. No new features. Do not change lesson content text.

## Deliverables
Commits per step; updated tests; `docs/SECURITY.md` rewritten to describe the real, verified posture; report with the counts before/after (`innerHTML`, inline handlers, `unsafe-inline`, email literals), plus a list of anything you could not remove and why.


=====================  02-phase-0b-leftovers.md  =====================

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


=====================  03-phase-1-redesign-core-pages.md  =====================

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


=====================  04-phase-2-timer-and-sections.md  =====================

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

# PHASE 2 — Precision lesson timer + standard timed sections (P1)

## Goal
1. A **clock-accurate lesson timer** the teacher starts, pauses, resumes and stops; students see it live; the final duration is saved permanently with the lesson record and shown everywhere.
2. Every lesson of every student is organised into three standard **sections** — Vocabulary, Grammar, Reading Comprehension — each with a visible **estimated time**, actual time and remaining time, shown at all times during class.

## Current state (verify)
- `lesson.html` ~line 1892 `startTimer()` uses `setInterval` counting from `state.sessionStart = Date.now()` at page load: resets on refresh, differs per device, can't pause, never persisted. `pushFullState`/`saveState` send `elapsed` computed from it. The final test has its own separate countdown (`testState.timer`, `getTestTimeLimit()`); leave that mechanism but make it consistent with the new clock.
- Lesson content has stage keys (`vocab`, `matchData`, `readingHtml`, `readingQ`, `contextQ`, `g6`, `g7`, `sbPp`, `sbPs`, `g10`, `test*`) and 9 `DEFAULT_STAGES`; there is no section concept or time estimate.
- Rules: `sessions/$code/command(s)` are teacher-write; `sessions/$code/{state,draft,history,…}` are student-write.

## PART A — Timer

### A1. Data model (Realtime Database)
```
lessonClock/$code/$lessonId
  state:           "idle" | "running" | "paused" | "stopped"
  accumulatedMs:   number   // time banked before the current run segment
  runningSince:    number   // server timestamp (ServerValue.TIMESTAMP) of current run start; null unless running
  startedAt:       number   // server ts of first start
  stoppedAt:       number   // server ts, when stopped
  totalMs:         number   // frozen final duration, set on stop
  currentSection:  "vocabulary" | "grammar" | "reading" | string
  sections:        { [sectionId]: { accumulatedMs, runningSince } }   // per-section clock
  rev:             number   // increments on every transition (optimistic concurrency)
lessonClockLog/$code/$lessonId/$eventId   // append-only
  { type: "start"|"pause"|"resume"|"stop"|"section"|"adjust", at: serverTs, by: uid, fromState, toState, note? }
```
- Display value = `accumulatedMs + (state==="running" ? serverNow - runningSince : 0)` where `serverNow = Date.now() + serverTimeOffset` from `.info/serverTimeOffset`.
- All transitions happen in **transactions** that check `rev` and the legal state machine: `idle→running`, `running→paused`, `paused→running`, `running|paused→stopped`. Illegal transitions are rejected by both client and rules.
- Section switching banks the active section's time into `sections[id].accumulatedMs` in the same transaction.
- Multiple teachers/devices: last valid transition wins, UI reflects state from the listener, never from local assumption.

### A2. Rules (extend `database.rules.json`, test every line)
- Read: the owning student and teachers. Write `lessonClock`: teachers only. `lessonClockLog`: teachers `.write` create-only (`!data.exists()`), no updates/deletes → append-only.
- `.validate`: `state` in enum; numbers ≥ 0; `runningSince <= now`; `totalMs` only when `state==="stopped"`; after `stopped`, only an `adjust` event by a teacher may change `totalMs` and it must log the previous value.
- A student can never write the clock. Cross-student read denied.

### A3. UI/UX
- Lesson header (student, read-only): large tabular-nums `mm:ss` (switch to `h:mm:ss` after 60 min) with state chip (Running / Paused / Stopped / Not started). Smooth update using `requestAnimationFrame` limited to 4 Hz; `aria-live="off"` for the ticking value and `role="timer"`; announce only state changes politely.
- Teacher (dashboard student detail AND a floating mini-control on the lesson page when `isTeacher`): Start, Pause, Resume, Stop (with confirm "Stop and save 47:12?"), "Switch section", and "Adjust time (±)" with a reason (logged).
- Paused state visually distinct (dimmed, striped bar) and the student's activity is NOT blocked unless the teacher sets "lock while paused" (optional toggle, default off).
- Stopped: show a **class summary card** (total time, time per section vs estimate, score, XP) and keep the value forever in the lesson record.
- Everywhere durations appear: lesson header, portal lesson card ("Last class 52:08"), dashboard history table, weekly summary, CSV export (`duration_seconds` column), student profile ("Total class time this month").
- Safety nets: warn the teacher if the clock has been running > 2 h or if no student activity for 15 min while running; "forgot to stop" recovery (teacher can stop and adjust with log). Reconnect behaviour: on offline, keep ticking from the last known server offset and reconcile when the listener reconnects; show a small "offline – time may resync" hint.
- Accuracy test: simulate clock skew (client clock ±10 min), tab sleep, refresh, two clients — displayed values must agree within 500 ms.

### A4. Replace legacy timing
- Delete `sessionStart` logic and route `elapsed` in `pushFullState`/`saveState`/dashboard through the new clock (summary values written to `sessionSummary/$code`).
- Keep per-stage "time on stage" analytics, but derive from section/stage events, not `Date.now()` deltas.

## PART B — Standard sections

### B1. Content schema v2 (migration + validator)
Add to every `content/<student>.json` (write `scripts/migrate-sections.mjs`, idempotent, with a dry-run flag and snapshot in `content/_snapshots/`):
```
"schemaVersion": 2,
"sections": [
  { "id": "vocabulary", "title": "Vocabulary", "estimatedMinutes": 15,
    "stages": ["vocab","matchData"], "goals": ["Learn 10 target words and their word families"] },
  { "id": "grammar", "title": "Grammar", "estimatedMinutes": 20,
    "stages": ["g6","g7","sbPp","sbPs","g10"], "topic": "…", "goals": [...] },
  { "id": "reading", "title": "Reading Comprehension", "estimatedMinutes": 25,
    "stages": ["readingHtml","readingQ","contextQ"], "goals": [...] }
]
```
Optionally `testMinutes`. Keep the final test as its own closing stage. Existing students' content is migrated by mapping the existing stages — **do not rewrite lesson text without approval**.

### B2. Vocabulary section
- Flashcards keep ALL existing functions (flip, audio pronunciation, examples, quiz modal, review flag, learned/unlearned status, spaced repetition hooks).
- **Word formation** for every target word (new `vocab[].forms`): `{ noun, verb, adjective, adverb, negative, other }` plus `affixes: [{part, type:"prefix|suffix", meaning}]` and one example sentence per form. UI: a "Word family" tab on the card, and a mini-exercise "Form the word": `Environment → (adj) ______ → "environmental"`; types: choose, type, build from morphemes (drag prefix/root/suffix tiles). Validator rejects forms that don't exist (use a maintained wordlist/derivation source; record licence) and flags uncertain ones for teacher review rather than guessing.
- Auto-suggestion tool in `tools/import-content.html`: teacher types a word → proposes forms/affixes → teacher approves.

### B3. Grammar section
- Each grammar topic has: concise rule card (formula + 2 contrasting examples + common L1 errors for Kazakh/Russian speakers), then an exercise ladder that demands active production, not recognition:
  1. Notice (highlight the structure in a short text)
  2. Complete the sentence (typed gap; accepted-alternatives array)
  3. Build the sentence (drag word tiles incl. 1–2 distractors; punctuation/capital tiles)
  4. Correct the error (find + fix)
  5. Transform (rewrite using the target structure)
  6. Produce (write 2–3 original sentences; self-check checklist + teacher review queue)
- Immediate explanation for wrong answers ("Present perfect needs *have/has* + past participle").
- Item metadata: `{id, type, prompt, answers[], explanation, tags[]}`; stable IDs so the review queue and analytics work.

### B4. Reading Comprehension section
- **Hard constraint:** the passage must strictly reuse the lesson's target vocabulary and grammar. Build `npm run lint:content`:
  - checks each target word (and its forms) appears ≥ 1–2 times in the passage and that the target grammar structure appears ≥ 3 times (pattern list per grammar topic, e.g. `/\b(has|have)\s+\w+(ed|en)\b/`);
  - flags words above the lesson CEFR level using an openly licensed word list (e.g. NGSL — record its licence) with an allowlist for proper nouns;
  - validates every question's answer exists/is derivable from the text;
  - validates `estimatedMinutes` vs reading length (words ÷ 120 wpm + questions × 1.5 min) and warns if > 25 % off.
- Questions: short answer (1–10 words, accepted answers), long answer (≥ 2–3 sentences; rubric criteria + model answer + word-count guide; stored for teacher review; instant self-check against rubric), true/false/not given with required evidence quote, find-the-sentence (click in text), vocabulary-in-context, and a final opinion/application question that forces use of target grammar.
- Reading tools: click-a-word definitions limited to the lesson vocabulary, adjustable text size, highlight/annotate (existing), per-paragraph audio.

### B5. Section time bar (always visible)
- Sticky bar in the lesson (and a compact version on mobile): three section segments with estimated minutes, the current section highlighted, actual elapsed vs estimate (`12:30 / 15:00`), remaining, a thin progress bar that turns amber at 100 % and red beyond 120 %. Tooltip on each. Teacher sees the same plus quick "next section".
- Per-section actual time saved at Stop (from `lessonClock.sections`) and shown in the class summary and dashboard.
- Teacher can edit `estimatedMinutes` and section order in the dashboard (writes to the student's curriculum overrides, not the protected content).

## Tests (required)
- Pure state-machine tests (all legal/illegal transitions, rev conflicts).
- Time computation tests with simulated skew/offset, pause/resume sums, section switching sums (property-based or ≥ 30 cases).
- Rules tests: student cannot write, teacher can, append-only log, validation.
- Content tests: migration idempotency; schema validator; lint rules with passing and failing fixtures.
- Browser test: start → pause → refresh → resume → stop; value persists and matches within 500 ms.

## Acceptance criteria
- I can start the timer from the dashboard; the student's lesson page shows the same time within 0.5 s; refreshing either page keeps the time; pause freezes it; stop saves it; it appears in history, portal, weekly summary and CSV.
- Every student's lesson has the three sections with estimated times visible throughout the class.
- `npm run lint:content` passes for all migrated content or prints actionable warnings (list them in the report; do not silently edit lesson text).

## Non-goals
Do not rewrite existing lesson reading texts/questions in bulk — propose changes in a separate `docs/CONTENT_REVIEW.md` for my approval.


=====================  05-phase-3-listening-trainer.md  =====================

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

# PHASE 3 — Listening dictation trainer with a British-voice character (P2)

## Goal
A TikTok/Duolingo-style listening trainer: an animated character says a sentence in a clear, eloquent **British** voice; the sentence appears with some words hidden as star placeholders; the student types the missing words in place; the app gives per-word feedback and lets them save new words. Optional speaking (shadowing) uses speech recognition.

## Reference (from the screenshot the teacher provided — reproduce the interaction, not the branding)
Large centred sentence; hidden words shown as `*` per letter; a typing cursor in the current gap; a mic button; a difficulty chip ("Easy"); controls: back, replay, Skip, Next; tapping a word offers "Look up" and "Save"; a translation line under the sentence (in the student's language). Do not copy any third-party sentences, UI assets or logos.

## Pedagogical notes (apply them)
- Dictation trains decoding connected speech. Start with content words; later hide function words/weak forms ("have", "to", "of") because these are hardest to hear.
- Use sentences built from the student's current lesson vocabulary/grammar (Phase 2 sections) at their CEFR level (from placement).
- Provide slow audio and per-word replay to reduce frustration.

## Step 1 — Data and schema
`content/listening/<student-or-pack>.json`:
```
{ "schemaVersion": 1, "id": "…", "title": "…", "level": "B1",
  "voice": { "id": "en-GB-SoniaNeural", "provider": "azure", "character": "nora" },
  "items": [ {
    "id": "l1-001", "text": "You can grip and grasp at fear and it ruins the enjoyment.",
    "audio": { "normal": "audio/l1-001.mp3", "slow": "audio/l1-001-slow.mp3" },
    "wordTimings": [ {"i":0,"start":0.00,"end":0.25}, … ],
    "gaps": { "easy": [4,8], "medium": [1,3,4,8], "hard": "all" },
    "translation": { "ru": "…", "kk": "…" },
    "lessonTags": ["vocabulary:grasp","grammar:present simple"],
    "credits": "original / licence"
  } ] }
```
- Validator (`js/listening/schema.js` + tests): ids unique; gap indices within range; audio paths exist; text length ≤ 25 words; no copyrighted sources recorded; translation optional.
- Authoring: extend `tools/import-content.html`: paste sentences → auto-pick gaps by difficulty (content words first, then function words) → preview → export JSON. Generate gaps from the lesson's target vocabulary when tags are present.

## Step 2 — Audio generation pipeline (British, eloquent, consistent)
- Browser `speechSynthesis` voices vary by device and often sound poor; treat it only as a fallback (`lang="en-GB"`, pick best `Google UK English`/`Microsoft Sonia/Ryan` voice if present).
- Primary: pre-generate neural TTS audio with a script `scripts/generate-listening-audio.mjs` that reads a provider key from env (`TTS_PROVIDER`, `TTS_KEY`, never committed), supports Azure (`en-GB-SoniaNeural`, `en-GB-RyanNeural` with SSML prosody), Google (`en-GB-Neural2-*`) and ElevenLabs. Output normal + 0.75× slow mp3 (loudness-normalised), plus word timings when the provider supplies boundaries (else estimate by forced alignment or syllable heuristics, flagged).
- Store files under `content/audio/` (size budget: ≤ 60 kB per sentence); add to `sw.js` runtime cache (cache-first, with versioned names); respect provider terms for redistribution — record the provider/licence in `credits`. If I haven't provided a key, ship the fallback voice and mark audio generation as ❌ "needs key" in the report. **Do not fabricate or fake audio.**

## Step 3 — Character tutor
- An original SVG/Lottie character (no existing mascots) with states: idle (blink), talking (mouth shapes driven by audio amplitude via Web Audio `AnalyserNode`, or by `wordTimings`), happy, encouraging, thinking, celebrating. Optional 2–3 characters the student picks (e.g. "Nora" British female, "Arthur" British male) tied to voices.
- `prefers-reduced-motion`: swap to static poses.
- Speech bubble shows the sentence with the hidden words; an `aria-live="polite"` region mirrors state for screen readers.

## Step 4 — Dictation UI and logic
- Gaps: one `<input>` per hidden word, width ≈ word length, placeholder `*****` (one star per letter), `aria-label="Gap 2 of 3, 7 letters"`; auto-advance on space/Enter/length reached; Backspace at start returns to the previous gap; Tab order natural; works with mobile keyboards (autocapitalize off, spellcheck off, autocomplete off).
- Controls: ▶ Replay, 🐢 Slow, ⏮ Previous, ⏭ Skip, Next, 💡 Hint (reveal first letter, costs XP), 👁 Reveal word, 🌐 Translation toggle (language remembered), ✓ Check.
- Checking: normalise case/curly quotes/trailing punctuation, accept UK/US spelling pairs (`colour/color`), contractions (`it's/it is` only if item allows), numerals vs words per item `alternatives`. Per-word green/red with the correct spelling shown; show where letters differ (diff on the word). No negative toast spam; one calm feedback sheet.
- After checking: the sentence is shown fully; every word is tappable → popover: meaning (from lesson vocab if present, else an on-device dictionary stub or teacher-supplied gloss), "Save to my words" (adds to personal deck and review queue). Do **not** call a third-party dictionary API without CSP/privacy review.
- Levels: **Easy** 1–2 gaps; **Medium** ~50 %; **Hard** all words typed from audio; **Expert** no text shown + no slow replay. Auto-adapt: 3 correct in a row → up; 2 wrong in a row → down; student can override.
- Session structure: 8–10 sentences per round → round summary (accuracy, hardest words, stars 1–3, XP) → "Practise mistakes" mini round.
- Gamification: XP per correct word, combo multiplier, daily streak contribution, gems; mistakes enter `reviewQueue`.

## Step 5 — Speaking / shadowing (optional layer)
- Use Web Speech API `SpeechRecognition` (`lang="en-GB"`) where supported (Chrome/Edge/Safari); feature-detect; fall back to typing only. Show the live transcript; compare word-by-word to the target (alignment via Levenshtein on tokens) and highlight misses; score is coaching, not grading.
- **Privacy:** recognition audio may be sent to the browser vendor. Show a one-time plain-language consent screen before first use; do not store audio; store only the text and score; parental/teacher note in docs. Provide a "type instead" button always.

## Step 6 — Integration
- Entry points: portal ("Listening"), lesson Vocabulary/Grammar section ("Listen & type"), practice hub, teacher assign. Time spent contributes to the Phase 2 section clock if started inside a lesson.
- Save progress in `studentProgress/$code/listening/{itemId: {attempts, bestAccuracy, lastAt}}` (rules with caps) and feed the dashboard (weak words, accuracy trend).
- Offline: cached items playable without network (service worker).

## Tests
- Unit: gap generation, normalisation/answer matching (≥ 50 cases incl. contractions/UK-US), adaptive level logic, schema validator, diff display function.
- Component/browser: keyboard flow through gaps; screen-reader labels; mobile viewport; fallback when audio fails (clear message + TTS fallback); fallback when SpeechRecognition unsupported.
- Rules tests for the progress node.

## Acceptance criteria
- I can open the trainer, hear the sentence (real British neural audio if a key was provided, otherwise the clearly labelled fallback), see star gaps, type the words in place, get per-word feedback, tap words to save them, replay slow, change levels, and finish a round with a summary.
- Works on a phone-sized screen and with keyboard only; passes axe; no console errors; no secrets in git (prove with a secrets scan).

## Non-goals
No video; no free-form speaking assessment scoring beyond the coaching view.


=====================  06-phase-4-whiteboard.md  =====================

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


=====================  07-phase-5-game-engine.md  =====================

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


=====================  08-phase-6-clip-lab.md  =====================

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

# PHASE 6 — Clip Lab: learn English from video (P3)

## Goal
Short video moments from cartoons, anime, films, series and documentaries used as interactive English lessons — legally and reliably.

## Current state (verify)
`clip.html`, `js/clips/schema.js` (`validateClip`, `addProtectedClipAnswers`, `clipEmbedUrl`), 7 files in `content/clips/` each with a YouTube `videoId`, `startSeconds/endSeconds`, and **a single transcript line** with a note that its timing is unverified; exercise structure minimal; `protectedContent/.../clip` is served via rules; manifest links `clipFile`/`clipId` per student. YouTube IFrame API is loaded from `https://www.youtube.com/iframe_api` (CSP entry needed).

## Legal and safety design (non-negotiable)
- Never download, re-host, rip, or screen-record video. Never paste verbatim captions or lyrics. Use only: official embeddable players (YouTube/Vimeo with embedding allowed), content the teacher owns, or openly licensed/public-domain video (Wikimedia Commons, Internet Archive PD, Creative Commons — record licence + attribution).
- Transcripts are **original teacher-style paraphrase/summary or short fair-use excerpts** used for teaching, clearly marked `transcriptType: "original" | "excerpt" | "licensed"`; the schema rejects `transcriptType: "verbatim-captions"` unless a `licence` field is present.
- For anime/cartoons/movies/series: prefer official trailers/clips on the studio's own channel, or write original comprehension tasks around a *link out* ("watch scene at 12:30–13:10 on <service>") when embedding isn't allowed. State this in the docs and UI ("Open the video").
- Document: `docs/CLIP_LAB.md` explaining copyright rules, how to choose a clip, and how to write a legal exercise.

## Step 1 — Verify and repair existing clips
For each of the 7 clip files: check the video exists, embedding is allowed (oEmbed endpoint returns 200; do this with a script `scripts/check-clips.mjs` — network access may be limited; if you cannot verify, mark `verified:false` and surface a teacher warning), the channel/title/attribution match the actual video, and the start/end window contains the described scene. Remove or replace any clip you cannot verify (ask me for replacements). Write results to `docs/CLIP_REPORT.md`.

## Step 2 — Schema v2 + authoring
```
{ schemaVersion: 2, id, title, level: "A2|B1|…", genre: ["anime","cartoon","film","series","documentary"],
  source: { provider, videoId|url, channel, videoTitle, rights: "official-embed|owned|CC-BY|public-domain", licence?, attribution, reviewedAt },
  startSeconds, endSeconds,                 // 10–90 s windows
  transcriptType, transcript: [ { id, start, end, text, translation?, speaker?, notes? } ],   // ≥ 8 lines for a 60 s clip
  vocabulary: [ { word, meaning, example, lineId } ], grammarPoints: [..], cultural: [..],
  exercises: [ …see Step 4… ] }
```
- Validator rules: line times inside window and monotonic; no overlaps; every exercise references existing line ids; `answers` kept in protected content only; `reviewedAt` within 12 months else warn.
- Authoring tool in `tools/import-content.html`: paste URL → fetch title/channel via oEmbed → set start/end by scrubbing the embedded player ("Mark start/end" buttons) → add lines while the video plays ("Tap to stamp time") → preview → export validated JSON.

## Step 3 — Player and interactive transcript
- YouTube IFrame API wrapper `js/clips/player.js` with: play/pause, seek, **loop current line**, speed 0.5/0.75/1, keyboard shortcuts (Space, ←/→ previous/next line, L loop), automatic stop at `endSeconds`, graceful failures (blocked/removed video → clear message, link-out, and lesson remains usable with the transcript).
- Interactive transcript: active line highlight synced to `getCurrentTime()` (≈ 4 Hz), click a line to seek, subtitle modes (EN / native / none / hidden-until-reveal), clickable words → definition popover from the clip vocabulary or lesson deck; "Save word" to deck/review queue.
- Layout: video left, transcript right on desktop; stacked on mobile with sticky mini-player.
- Privacy: use `youtube-nocookie.com`; no tracking; no autoplay with sound.

## Step 4 — Exercise types (all JSON-driven, graded with the shared grader)
1. **Before-you-watch**: predict from title/thumbnail words; vocabulary pre-teach.
2. **Gist**: 2–3 MCQ after first watch.
3. **Gap-fill on subtitles**: hide key words in the line; type while the line loops.
4. **What did they say?** (dictation of one line, reusing Phase 3 gap UI; audio from the video line loop).
5. **Order the lines**: drag shuffled lines to the correct sequence.
6. **Who said it?** (matching lines to speakers).
7. **Shadowing**: student repeats the line; optional speech recognition feedback (consent as in Phase 3).
8. **Grammar spotter**: tap all examples of the target structure in the transcript.
9. **After-you-watch production**: write/say 2–3 sentences; teacher-review queue.
Gamify: XP, "scene mastered" stars, collectible clips, streak.

## Step 5 — Integration
- Portal "Clips" tab with level/genre/grammar filters; lesson Vocabulary/Grammar sections can embed a clip; assignments/scheduling (Phase 0B); the Phase 2 clock counts time on the clip; dashboard shows clip completion, weak lines, saved words.
- `sw.js`: cache clip JSON (not video).

## Tests
Schema validator (good/bad fixtures), line-time alignment utilities, transcript-sync logic with a mocked player, exercise grading, rules tests for protected clip answers (student cannot read answers before submitting).

## Acceptance criteria
- Each shipped clip has ≥ 8 verified transcript lines (or is flagged and hidden from students), exercises of ≥ 4 types, and verified embeddability; failing videos degrade gracefully.
- I can add a new clip using the authoring tool without touching code.
- No verbatim caption copying; `docs/CLIP_LAB.md` explains the rules.

## Non-goals
No video hosting, downloading, or scraping; no automatic caption import.


=====================  09-phase-7-manga-reader.md  =====================

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


=====================  10-phase-8-hardening-release.md  =====================

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
