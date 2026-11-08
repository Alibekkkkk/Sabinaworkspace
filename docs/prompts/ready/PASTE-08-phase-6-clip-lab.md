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
