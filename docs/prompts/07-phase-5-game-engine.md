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
