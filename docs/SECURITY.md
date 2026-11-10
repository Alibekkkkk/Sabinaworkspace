# Security and privacy

## What is and is not private

GitHub Pages serves published files publicly. `robots.txt` and `noindex` do not restrict access. Until the lesson and homework JSON files have been removed from the published site, anyone who knows their URLs may download them.

Making the GitHub repository private does not necessarily make its Pages site private. Check the repository's Pages settings and your GitHub plan separately. Making a repository private also does not erase copies already downloaded, cached, or cloned, and does not remove files from public Git history. Do not rewrite history without a separate, coordinated decision.

The Firebase web configuration in `js/config.js` is public client configuration, not a secret. Firebase Realtime Database Rules must enforce access.

Teacher authorization uses a console-managed `admins/<Firebase Auth UID>: true` record. Database Rules allow a signed-in user to read only their own admin record and deny all client writes; a user cannot grant themselves teacher access. Before deploying these rules, add the teacher UID in Firebase Console: open **Authentication → Users**, copy the teacher account's UID, then open **Realtime Database → Data**, add a boolean `true` value at `/admins/<UID>`. Repeat for each teacher account. The application reads this one record through `js/auth.js`; do not add email allowlists back into client code or rules.

Every page ships a meta-delivered Content Security Policy with **no `'unsafe-inline'` and no `'unsafe-eval'`** in `script-src` or `style-src`. There are no inline `<script>` or `<style>` blocks, no `style=` attributes in the HTML files, and no inline event handlers; behaviour is attached through delegated listeners (`js/delegated-actions.js`). Application-owned markup that carries presentational `style="..."` is parsed by `js/dom.js`, which renames the attribute before parsing and replays the declarations through the CSSOM (`element.style.cssText`), the one route strict `style-src` permits. `tests/security-policy.test.mjs` asserts all of this for every HTML file, and the pages were loaded in a browser with a clean console (no CSP violations).

Not done, and why:

- **`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` and other HTTP headers cannot be set on GitHub Pages**, and `frame-ancestors` is ignored in a `<meta>` policy. Clickjacking protection therefore needs a host that can send headers (Firebase Hosting, Cloudflare, Netlify). When you move, send the same policy as the meta tag plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. `firebase.json` deliberately has no `hosting` block so nobody assumes headers are being served.
- **Trusted Types (`require-trusted-types-for 'script'`) is not enabled.** `js/dom.js` and `js/sanitize-html.js` assign strings to `template.innerHTML`, and the Firebase compat SDK loaded from `gstatic.com` is not Trusted Types ready. Enabling it would require a named policy around those two call sites and testing against the SDK; track it as a follow-up.
- `innerHTML` is confined to three audited lines: one in `js/dom.js` (inert `<template>` parse of application-owned markup) and two in `js/sanitize-html.js` (the sanitizer itself). Everything else goes through those helpers.

Page renderers centralize application-owned markup parsing in `js/dom.js`. Dynamic text and attribute values must be HTML-escaped before being interpolated into those templates; do not pass untrusted markup to the DOM helpers. Teacher-authored rich content and saved annotations are passed through `js/sanitize-html.js` before rendering, and annotations are sanitized again when loaded. Keep these boundaries covered by injection tests whenever a page adds a dynamic field.

The PWA service worker caches only allowlisted public shell pages and static assets. It does not cache Firebase endpoints, protected lesson records, student sessions, or game progress; protected lessons and sign-in are unavailable offline by design.

Clip Lab has the same public-file constraint. `content/clips/*.json` and `content/manifest.json` are publicly downloadable on a static host, so clip drafts contain prompts and teacher-created study text but no correct answers. The teacher importer accepts answer keys separately and writes the completed clip record under `protectedContent/<lessonId>/clip`, where the existing assignment-based Firebase rules apply. Review the student's authenticated view and verify denied access for an unassigned account before using clips with students.

The Manga Reader follows the same rule: `content/manga/*.json` contains panel metadata and question options but no correct answers. Its SVG panel paths are restricted to original local art under `assets/manga/`; answer keys are added by the teacher tool only when writing `protectedContent/<lessonId>/manga`. The `features.mangaReader` value in the manifest is copied into the student's assigned curriculum view and gates the portal link; it is a user-interface feature flag, not a substitute for Firebase authorization.

## Migration runbook

Follow these steps in order. Do not delete the source JSON files or start the next application phase until all acceptance checks below pass.

### 1. Protect the repository and decide how to handle the public site

1. In GitHub, open the repository's **Settings → General → Danger Zone → Change repository visibility** and make the repository private, if that is still the chosen decision.
2. Check **Settings → Pages** and confirm whether the published site is still publicly accessible. Do not assume changing repository visibility made the site private.
3. If the public lesson/homework files must stop being accessible immediately, unpublish or restrict the site while migration is in progress. This may temporarily take the student site offline. Otherwise, recognize that the files remain public until step 7 is complete.
4. Do not force-push or rewrite Git history as part of this runbook. If old public commits need removal, plan that separately with everyone who uses the repository.

### 2. Prepare and run the local checks

Use a JDK version 21 or later, Node.js, and npm. From PowerShell, in the repository root:

```powershell
java -version
npm ci
npm test
npm run test:rules
```

Confirm `java -version` reports 21 or later and both test commands pass. `npm test` runs the focused unit tests; `npm run test:rules` starts the Realtime Database emulator and tests `database.rules.json`.

If `npm run test:rules` fails, stop and resolve the failure before deploying anything. Do not weaken rules or enable public access to make tests pass.

### 3. Confirm the Firebase project and back up existing data/rules

1. Sign in to Firebase Console and confirm the intended project is **sabina-s-workspace**, matching `projectId` in `js/config.js`. Confirm you have selected that exact project before making changes.
2. In Firebase Console, open **Realtime Database → Data** and export/download a JSON backup to a secure location outside the repository. Do not commit or publicly share the backup; it contains student data.
3. Open **Realtime Database → Rules** and save a separate copy of the currently deployed rules outside the repository.
4. Review the existing `curriculum` assignments and student records. Check how assignments represent `assignedTo`, `audience`, and content URLs. Stop if records use a shape or custom content URL the importer does not handle; investigate and update the migration before proceeding.

### 4. Check Firebase Authentication and hosting

1. In Firebase Console, confirm Google sign-in is enabled under **Authentication → Sign-in method**.
2. Under **Authentication → Settings → Authorized domains**, ensure the domain you will use for the migration tool and student site is authorized.
3. Use a Google account whose Firebase Auth UID has been added to `/admins/<UID>` as described above. The importer will not enable its import button for any other account.
4. Confirm the site deployment and rollback method. Do not deploy application changes to the student site until the local rules tests pass.

### 5. Deploy and verify the Realtime Database Rules

The rules are not deployed automatically. After completing steps 2–4, publish only the database rules:

```powershell
npx firebase login
npx firebase projects:list
npx firebase deploy --only database --project sabina-s-workspace
```

Before the deploy command, verify that the listed project is the intended project. In Firebase Console, confirm the published rules match `database.rules.json`.

If deployment fails or legitimate teacher/student flows are denied, restore the saved rules through Firebase Console and investigate. Do not continue to import content until the rules are correct.

### 6. Run the additive content import

1. Deploy the application with the source files in `content/` still present. The importer fetches those files, so do not remove or rename them yet.
2. Open the deployed site's **Import Content** page (linked from the teacher dashboard), sign in with the verified teacher account, and confirm the displayed email is correct.
3. Select **Import content** and confirm the prompt. The importer creates only missing `protectedContent` records, refreshes student curriculum views using current assignments, and marks stale views unpublished. It does not overwrite existing protected content or delete existing curriculum/student records.
4. Save the completion message and investigate any reported error. Stop if the imported lesson IDs, source files, assignment counts, or student codes do not match expectations. Do not rerun repeatedly to work around an error without understanding it.
5. In Firebase Console, inspect representative `protectedContent/<lessonId>` and `studentCurriculum/<studentCode>/<lessonId>` records. Confirm the expected content was imported and only intended students have published views.

### 7. Test access as a teacher and as students

Use separate browser profiles or devices for the teacher and student accounts. Test at least:

- A student assigned a lesson can sign in, see that lesson, and load its classwork and homework.
- A student with no assignment does not see the lesson and cannot read its protected content.
- Student A cannot read Student B's curriculum view, session, or homework data.
- A student cannot read the full `curriculum` or list `students`.
- The teacher can still open the dashboard and manage assignments.
- Missing or inaccessible content produces an error; it does not display another student's or a fallback lesson.

Verify denied reads using the actual deployed application/accounts and, where possible, inspect Firebase client errors/network results. A hidden lesson link by itself is not proof of authorization. If any check fails, stop. Fix the issue, rerun the emulator tests, and retest before removing files.

### 8. Remove public lesson/homework JSON only after verification

Once every check in step 7 passes:

1. Remove the lesson and homework JSON files that contain protected student content from `content/` and from the deployed site. Keep `content/manifest.json` only if it is still needed as migration/source mapping metadata; it does not contain lesson answers.
2. Check all remaining HTML, scripts, manifests, and curriculum views for URLs that still point to removed `content/*.json` files. Update those references to use the protected Firebase reads.
3. Deploy the removal and verify the old public file URLs return not found, and that assigned students still load their lessons and homework successfully.
4. Check that unassigned students still cannot read protected Firebase records. Removing static files does not replace or relax database authorization.

Do not remove the files if any student flow still depends on them. Keep a secure backup outside the public site and repository.

## Acceptance checklist

Phase 1 is ready for acceptance only when all are true:

- The repository visibility decision is completed and Pages visibility has been checked.
- Unit tests and Firebase Rules emulator tests pass.
- The intended project's deployed rules have been reviewed.
- Existing Firebase data and rules have secure backups.
- The additive import has completed and representative imported records are correct.
- Assigned, unassigned, cross-student, and teacher access checks pass against the deployed project.
- Public content file URLs no longer serve the protected lesson/homework JSON.
- Student lesson/homework flows still work after removal.

Record which project was tested and the date/results of these checks before preparing the Phase 1 commit. Do not begin Phase 2 until the checklist passes.

## Grading and student identity notes

New work is graded in the browser. Each submission stores raw answers, score, denominator, submission time, student identity, content filename/hash, and schema version in `sessions/<code>`. Historical submissions are immutable to students under `database.rules.json`. A teacher-controlled re-grade should be an explicit operation that creates a new attempt/audit record rather than silently overwriting the original score.

Client-side grading cannot hide answer keys from a student who can download the content. Trusted server-side grading requires a server component, such as a Cloud Function, and may require Firebase Blaze billing.

Student codes are short bearer identifiers and can be guessed or shared. New registration generates a random 8-character code (`js/student-code.js`, Web Crypto, 31-symbol alphabet without look-alikes) and claims only `students/<code>` with a Realtime Database transaction; it never lists the students. A code is bound to the first authenticated UID; current code-based accounts use anonymous Firebase Auth unless the student signs in with Google. This first claim does not prove that the claimant is the intended student. Deliver codes privately and bind pre-existing accounts under teacher supervision.

By default the portal uses tab-scoped session identity. “Remember me on this device” opts into persistent browser storage. Signing out or switching students clears legacy and namespaced `nd_*` keys in that browser. Browser-local drafts without a verified owner code are intentionally not migrated based on a guessed identity.

## Teacher commands, summaries and answers (Phase 0a)

- **Commands.** The teacher dashboard appends `sessions/<code>/commands/<id>` records of the form `{ type, payload?, createdAt }` where `type` is one of `goto`, `resetStage`, `resetVocab`, `resetAll` and `createdAt` must equal the **server** timestamp (`ServerValue.TIMESTAMP`; the rules reject a client-supplied time). The student client applies each command once, writes `ack: true` (the only field a student can write there, and it cannot be unset), and ignores commands older than 60 s on the server clock. The old single `command` node and the `Date.now() - 10000` client-clock check are gone.
- **Compact summaries.** Students maintain `sessionSummary/<code>` (score, stage, streak, elapsed, `doneCount`, `lastUpdate`, and per-homework `submitted/completed/score/total/updatedAt`). Every field is type- and range-validated and unknown fields are rejected, so a student cannot place free text (or HTML) where the dashboard will render it. The dashboard subscribes to `sessionSummary` only and loads a student's notes, history and progress on demand after selection.
- **Homework.** Answers are stored under the stable question id (dots mapped to `_`, since RTDB keys cannot contain `.`); records written with positional keys are migrated in memory on load. A teacher reset archives the current record into `attempts` (last 10) before clearing it; the rules allow an admin to write the homework record, a student can never modify a submitted one.
- **Grading.** `js/grading.js` is the single grader. Grammar items are exact after normalisation (case, whitespace, curly quotes, trailing punctuation, UK/US spelling, contractions); reading and short answers additionally allow one typo in words of six or more letters. Negations and auxiliaries are never dropped ("did not go" never matches "did go"), numbers must match exactly, and plural/past slips are not treated as typos. Known limit: `'s` and `'d` are ambiguous and are not expanded, so list both forms in the accepted answers.
- **Visibility.** A lesson is visible to a student only when `audience` is `"all"` or their code is in `assignedTo`; an empty `assignedTo` means nobody (`js/audience.js`). Lessons saved before this change without an `audience` stay hidden until the teacher re-saves them in the dashboard.

## Firebase console checklist (do these yourself)

The web config in `js/config.js` is public by design: the API key only identifies the project. What protects data is `database.rules.json` plus authentication. Two optional layers reduce abuse:

1. **Restrict the API key by HTTP referrer.** Google Cloud Console → *APIs & Services* → *Credentials* → open the *Browser key* for project `sabina-s-workspace` → *Application restrictions* → *Websites* → add `https://alibekkkkk.github.io/*` (and `http://localhost:8080/*` while developing). Under *API restrictions* keep it to the Firebase APIs the app uses (Identity Toolkit, Token Service, Firebase Realtime Database). Save, wait a few minutes, then sign in from the live site to confirm nothing broke.
2. **App Check (optional).** Firebase Console → *App Check* → register the web app with *reCAPTCHA Enterprise* (or v3), add the site key to the client, enable monitoring for Realtime Database first, and only switch to enforcement once the metrics show legitimate traffic passing. Enforcing before the client sends tokens locks everyone out.
3. **Teacher access.** Keep `/admins/<UID>: true` set only for teacher accounts (see above). There are no email allowlists in the code or rules any more.
4. **Anonymous sign-in.** Students without Google use anonymous auth. In *Authentication → Settings* keep *Authorized domains* limited to the live site and localhost.

## Hardening results

| Metric | Before | After |
| --- | --- | --- |
| `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` in pages and JS | ~128 | 3 (all inside `js/dom.js` and `js/sanitize-html.js`) |
| Inline `on*=` handlers | ~161 | 0 |
| Inline `<script>` / `<style>` blocks in HTML | several per page | 0 |
| `'unsafe-inline'` in CSP | every page | none |
| Teacher e-mail literals in code and rules | ~25 | 0 (only setup instructions in `TEACHER_SETUP.md`) |
| Sanitizer XSS corpus | few | 60+ payloads, idempotency (mutation-XSS) check |
| Dashboard subscription | whole `sessions` tree | `sessionSummary` |

## Rules and hosting constraints

`database.rules.json` denies root reads/writes, prevents listing `students/`, scopes session access to the UID bound at `students/<code>/uid`, restricts curriculum and protected content to users with a console-managed `/admins/<UID>: true` record or authorized student assignments, and validates homework score bounds and write-once submission state. Client writes to `admins/` are denied. Emulator coverage is in `tests/rules.test.mjs`.

Realtime Database Rules do not expose object/list type checks or child-count methods. The rules therefore validate fixed record shapes with `hasChildren([...])`, reject unknown fields on fixed-shape records with `$other: { ".validate": false }`, validate dynamic keys against the allowed key pattern, and bound string lengths and numeric ranges. These checks do not cap the number of children in a dynamic map or list.

The application caps session history and review submissions at 100 entries per transaction, homework archived attempts at 10 entries, game attempts at 50, game review items at 100, topic statistics at 100, and saved vocabulary at 500. These are client write-path limits, not security boundaries: a signed-in client bypassing the application can write additional valid entries. The rules cannot cap the number of distinct annotation, draft, history, topic, or vocabulary keys; annotations and drafts are limited per value, while curriculum-controlled key counts remain application-managed. Monitor database usage and move writes requiring non-bypassable quotas behind a trusted server.

GitHub Pages serves files publicly. Any answer key, student name, static lesson, or homework JSON committed in the repository can be downloaded from a public site. Database Rules protect Firebase paths only; they cannot protect static files.

## Offline and protected content

The service worker (`sw.js`) only handles files served by this site. Protected lesson content, answer keys, student progress and sign-in all travel over Firebase connections to other origins, which the worker never sees, so **none of it is stored by the worker**. Decision (Phase 8): protected content and answer keys are not cached for offline use, because storing them unencrypted on a shared device would defeat the protected-content design. A lesson that is already open keeps working offline because it is in memory; the offline banner says changes are kept only while the page stays open.

One exception, by design: the Manga Reader keeps the story it has opened in the device cache `learning-studio-manga-v1` so a chapter can be read offline. That copy contains the answer keys of the chapter questions and is deleted when the database refuses the student access (for example when the teacher switches the manga flag off). See `docs/MANGA.md`.

What the worker caches: the app shell (pages, scripts, styles, icons; generated list, versioned), public content JSON (network first), audio and images (limited, oldest dropped first). It never caches other origins, non-GET requests, partial (Range) responses or the reserved sign-in paths.

## HTTP headers (Firebase Hosting)

`firebase.json` now has a `hosting` block that sends, on every response: a strict `Content-Security-Policy` (the union of what the pages need, no `unsafe-inline` or `unsafe-eval`, plus `frame-ancestors 'self'`, so only this site can frame its pages: the dashboard previews lessons and homework in iframes), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, geolocation, payment and USB off; microphone off except on the five pages whose code can use speech recognition), `Cross-Origin-Opener-Policy: same-origin-allow-popups` (`same-origin` would break the Google sign-in popup) and `Strict-Transport-Security` for a year. `sw.js` and the manifest are sent with `Cache-Control: no-cache`; scripts and styles may be cached for an hour and must revalidate. Development files (tests, scripts, docs, rules, `package.json`) are not published.

The site is still on GitHub Pages, which cannot send these headers; the block takes effect only if you deploy to Firebase Hosting. Nothing was deployed.

**What was and was not verified.** `tests/hosting-headers.test.mjs` checks the rules (every header present, the header policy allows everything each page's own policy asks for, the microphone pages are exactly the pages whose code can ask for it). I could **not** observe the headers on a running server: the Hosting emulator in the installed firebase-tools served the files but did not apply `headers` or `ignore` (even for a minimal config), so the check by curl is still to do after a real deploy:

```bash
curl -sI https://<your-site>/portal.html | grep -iE "content-security|x-frame|x-content-type|referrer|permissions|cross-origin|strict-transport"
curl -sI https://<your-site>/listening.html | grep -i permissions-policy
curl -sI https://<your-site>/sw.js | grep -i cache-control
curl -s -o /dev/null -w "%{http_code}\n" https://<your-site>/tests/security-gates.test.mjs   # expect 404
```

## Security re-review (Phase 8)

| Check | Result |
| --- | --- |
| HTML written from strings (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`) | 2 files, both the sanitizing helpers (`js/dom.js`, `js/sanitize-html.js`); a test fails if any other file uses them. At the start of the project the review counted 128 |
| Inline event handlers | 0 (was about 161); a test fails if one appears |
| `eval`, `new Function`, string timers, `javascript:` URLs | 0; tested |
| `target="_blank"` without `rel="noopener"`, `window.open` without `noopener` | 4 found and fixed (two dashboard links, two `window.open` calls); tested |
| `unsafe-inline` or `unsafe-eval` in any page policy | 0 (the project started with `unsafe-inline`); tested |
| Secrets in the current tree | none; the only key-like string is the public Firebase web API key in `js/config.js`, which is public by design |
| Secrets in the full git history (274 commits, pattern scan for private keys, AWS, GitHub, OpenAI-style, Slack tokens, service-account JSON, `.env`, `.pem`) | none. The Firebase web API key appears (it is the same key in every commit, and public by design). No `gitleaks`/`trufflehog` was available, so this is a pattern scan, not a full entropy scan |
| `npm audit` | 47 advisories (15 high, 32 moderate), **all in development tooling** (`firebase`, `firebase-tools`, `lighthouse`, `puppeteer-core`, `@firebase/rules-unit-testing` and their dependencies). The project has no runtime dependencies: students load only the files in this repository and the Firebase SDK from Google's CDN. Fixing needs major version bumps of the tooling; not done |

## Exception: the listening-from-recording tool (Phase 11)

`tools/listening-recording.html` is a teacher-only page with a wider policy, in both its own `<meta>` tag and a hosting header rule placed after the site-wide one:
- It loads the speech-recognition library from `cdn.jsdelivr.net`, pinned to `@huggingface/transformers@3.0.2`.
- It runs WebAssembly (`'wasm-unsafe-eval'`).
- It may fetch from any `https:` host: the model files from Hugging Face, and the teacher's audio link.

No other page loads code from a CDN, and the student pages keep the strict policy (`tests/listening-recording.test.mjs`).

The recording link is stored in the lesson's protected listening set (`protectedContent/<lesson>/listening`). Only teachers write it; only that lesson's students read it.

Students play the link with an ordinary `<audio>` element (`media-src https:` was already allowed). It is never routed through Web Audio, because a recording from another site would play silently that way.
