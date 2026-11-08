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
