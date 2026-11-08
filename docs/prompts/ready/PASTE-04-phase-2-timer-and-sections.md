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
