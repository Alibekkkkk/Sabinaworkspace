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
