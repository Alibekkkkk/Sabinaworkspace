# Games: contract, audit and mapping

## Contract
A game is plain JSON the engine validates (`validateGame` in `js/games/engine.js`).

```
{ id, type, title, instructions,
  skill: vocab | grammar | reading | listening | speaking | spelling,
  cefr?: "B1" | "A2-B1",            // set content.cefr on the lesson
  estimatedMinutes: 1..60,
  pairs | questions: [ { id, prompt, answer, alternatives?, typed?, mode?, options?, topic?, explanation? } ],
  config: secondsPerQuestion?, graph? (story), grid? (crossword, word search) }
```
Lifecycle: **init** (`createPracticeGames` builds and validates) → **render** (`types/<type>.js` `render(container, game, bus)`) → **answer** (the screen collects `answers[itemId]`) → **evaluate** (`evaluateGame`, typed items use the shared grader in `js/grading.js`) → **finish** (`bus.finish(payload)`; `runtime.buildResult` makes the result).
Result: `{ score, total, mistakes[], correctItemIds[], bestRun, durationMs, timeSpentSeconds, kind, won?, fixes?, words? }`. Rewards are applied by `js/games/rewards.js` inside one database transaction (`saveGameProgress`).

Teacher content keys read by `createPracticeGames`: `matchData`, `testMcq`, `testTfng`, `testShort`, `testComplete`, `sbPp`/`sbPs`, `vocab[].forms` (approved only), `errorHunt`, `storyGraph`, `storyChoices` (old flat list), `cefr`. A complete example for every type: [`docs/games/sample-lesson.json`](games/sample-lesson.json) (a test builds all 16 types from it). Puzzles take a seed: same seed, same puzzle (`createPracticeGames(content, { seed })`; the practice page uses the student's code).

Shared services (`js/games/settings.js`): sound (small WebAudio tones, mute), haptics (`navigator.vibrate`), confetti (calm-aware), and the settings panel: **reduce animation**, **no timers** (timed games become untimed), **no sound**, vibration. Stored per device.

## Audit: before and after
"Before" was read from `engine.js`, `practice.js` and `tests/games.test.mjs` at the start of Phase 5. "After" is the state now: **all sixteen types are modules** in `js/games/types/` (`runtime.js` routes every generated game, a test checks it), built on the shared contract, with behaviour tests and a keyboard-only browser run.

| Type | Before | After |
|---|---|---|
| word-match | old screen: a drop-down per word; generation tests only | **module** (`pairs.js`): pick a word, then its meaning; a wrong pick is forgiven but costs that word's point |
| memory-cards | old screen, random order, no moves | **module**: flip animation (off in calm mode), moves count, pure tested rules; a pair found after two wrong flips goes to review |
| flashcards | old screen | **module**: turn over, "I knew it" or "Practise again" |
| speed-quiz | old list with one round timer | module (Phase 5): number keys, streak, untimed variant |
| fill-gap | old screen, plain equality | **module** (`typed.js`): shared grader (alternatives, case, punctuation), optional word bank |
| sentence-builder | old screen, clear only | **module** (`tiles.js`): tap to place, tap a placed tile to take it back, distractor tiles, no drag-only step |
| hangman | old screen | **module**: keyboard letters, six lives, a hint reveals a letter and costs 3 XP |
| word-scramble | old screen | **module**: real anagrams, a hint shows the first letter (3 XP) |
| listening-dictation | old screen, speech synthesis only | **module**: the Phase 3 player (British voice, slow play, device-voice label), "show the word" fallback |
| pronunciation | old screen | **module**: Phase 3 speaking layer with the consent screen, `compareSpoken` coaching, three tries, typed fallback; **coaching only: nothing is added to review** |
| boss-battle, story-choice, error-hunt, word-formation | modules (Phase 5) | unchanged |
| crossword | old screen | **module** (`puzzles.js`): one tab stop, arrow keys, typing runs along the clue, Space switches across/down, Tab jumps to the next clue, spoken row, column and clue labels |
| word-search | old screen | **module**: one tab stop, arrow keys, Enter selects, words forwards or backwards, pure tested selection rules |

The old 400-line screen code was deleted from `js/pages/practice.js` (531 lines down to 138).

## Lesson stages and games
Set per student and lesson by the teacher (dashboard card "Lesson game mode", stored at `studentCurriculum/<code>/<lessonId>/gameMode`; a lesson file may suggest a default with `gameMode`). Default **light**. A re-import of lesson content never overwrites the teacher's choice. **No mode replaces a stage, changes its content key, its grading or its score.**

| Stage | Off | Light | Full (adds) |
|---|---|---|---|
| every stage | classic | a mission line at the top; XP when the stage is finished (about 25 XP per 10-point stage, daily cap applies, no hearts lost) | same |
| 1 Vocabulary | classic | "Collect the cards": a card map with all words, each collected / in progress / not started, and a meter; flip, audio, review flag and the quiz are untouched | same |
| 2 Word Match | classic | mission line | same (the stage already is a matching game) |
| 3 Reading | classic | mission line (look for the evidence); long answers and reading tasks stay as written, teacher-reviewed tasks | **Error Hunt** as collapsed extra practice if the lesson has `errorHunt` (practice only: never changes the stage score) |
| 4, 5, 6, 7 | classic | mission line | same; Form the word (Phase 2) already covers word formation |
| 8 Choose the tense | classic | mission line | Error Hunt extra practice |
| 9 Final test | classic | mission line ("Boss: the unit test") | a second button **Start as a Boss Battle**: the same questions, the same time limit, one attempt, and the same scoring (`round(correct / total * 10)`) through the same end-of-test code. Wrong answers cost a shield and let the boss heal; they never end the test early |
| Whole lesson | | finishing every stage shows "Lesson complete!" and a big celebration (calm mode respected) | same |

Celebrations: a finished game gets a small one, a finished stage the usual confetti, a finished lesson a big one. They never block the next step, and "reduce animation" turns them off.

## Rewards
- **XP:** 10 per correct answer, +5 for a perfect round, +2 for each three answers in a row (at most +10). **Daily cap 400 XP**: after that games still count but pay nothing. One result pays at most 500 XP, and the database accepts at most +600 per write.
- **Levels:** thresholds in `LEVEL_THRESHOLDS` (level 2 at 100 XP, 3 at 220, ...); beyond the table every 500 XP is a level.
- **Gems:** 1 per 5 correct answers, +5 for finishing the weekly goals. They buy avatar looks (frames, themes, buddies) and never answers.
- **Streak:** next day adds one, a gap resets it. A **freeze** covers one missed day automatically; one is earned every 7 days in a row (at most 3).
- **Weekly goals** (week starts Monday, one id across New Year): learn 15 words, 3 listening rounds, 5 games.
- **Badges:** 22, each with an icon and a criterion shown in words; locked ones show their criterion too.
- **Hints:** a hint (Hangman, Word Scramble) takes 3 XP off the round, never below zero.
- **Hearts:** still tracked but never block play; the live-lesson default is no lockout (`applyRewards(..., { hearts: false })` switches the loss off).
- **Spaced review:** Leitner intervals 1, 3, 7, 14, 30 days (unchanged); the Practice card shows at most 20 due items and says "You're done for today" when nothing is due.
