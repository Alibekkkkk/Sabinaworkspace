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
