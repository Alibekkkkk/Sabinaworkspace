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
"Before" was read from `engine.js`, `practice.js` and `tests/games.test.mjs` at the start of this phase. "UI" means a screen that can be played; "tests" means behaviour tests beyond "it generates".

| Type | Before: generator / validator / UI / tests / in lesson | After |
|---|---|---|
| word-match | yes / yes / yes (drop-down per word) / generation only / no | unchanged UI; sample JSON; validated in the all-types test |
| memory-cards | yes / yes / yes / generation only / no | same |
| flashcards | yes / yes / yes / generation only / no | same |
| speed-quiz | yes / yes / yes (list with one round timer) / generation only / no | **new module**: one question at a time, number keys, streak, untimed variant, tests |
| fill-gap | yes / yes / yes / generation only / no | typed items now use the shared grader (alternatives); no word bank yet |
| sentence-builder | yes / yes / yes (tap tiles) / generation only / no | same |
| hangman | yes / yes / yes / generation only / no | same (no XP cost for hints yet) |
| word-scramble | yes / yes / yes / generation only / no | same |
| listening-dictation | word-level only / yes / yes (speech synthesis) / generation only / no | same; the Phase 3 trainer is still its own page |
| pronunciation | yes / yes / yes (typing fallback) / generation only / no | same |
| boss-battle | multiple choice only / yes / yes (list of drop-downs) / generation only / no | **new module**: fight with shields and boss health, multiple choice + True/False/Not Given + typed answers, never locks out, weak-point summary, tests |
| story-choice | **never generated** (no content has `storyChoices`) / yes / yes (flat) / no / no | **new module**: branching `storyGraph`, validator (dead ends, loops, unreachable scenes, unexplained wrong choices), retry on wrong choice, tests |
| crossword | yes / yes / yes / grid cells check / no | seeded, repeatable, tests |
| word-search | yes / yes / yes / grid cells check / no | seeded, repeatable, tests |
| error-hunt | no | **new**: pick the wrong word, type the fix, hints, reveal after two wrong picks, tests |
| word-formation | no | **new**: from approved word-family forms, race or untimed, tests |

Modules in `js/games/types/`: speed-quiz, boss-battle, story-choice, error-hunt, word-formation. The other eleven still use the older screens in `js/pages/practice.js`; moving them to modules is the remaining part of Step 1.

## Lesson stages and games (mapping)
Not converted in this phase; the lesson player is unchanged. Planned mapping, for the next step:

| Lesson stage | Game framing | Keeps |
|---|---|---|
| 1 flashcards | Collect the cards (cards earned by quiz answers) | flip, audio, review flag |
| 2 matching | Word Match / Memory | content key `matchData`, grading |
| Reading questions | Mission framing + Error Hunt for True/False/Not Given | long answers stay written and teacher-reviewed |
| Context and grammar | Gap-fill, Sentence Builder, Word Formation Race | `contextQ`, `g6`, `g7`, `sbPp`, `sbPs`, `g10` |
| Final test | Boss Battle | time limit and one-attempt rule, set by the teacher |
| Per lesson | `gameMode: "full" | "light" | "off"` | classic lesson when off |

## Rewards
- **XP:** 10 per correct answer, +5 for a perfect round, +2 for each three answers in a row (at most +10). **Daily cap 400 XP**: after that games still count but pay nothing. One result pays at most 500 XP, and the database accepts at most +600 per write.
- **Levels:** thresholds in `LEVEL_THRESHOLDS` (level 2 at 100 XP, 3 at 220, ...); beyond the table every 500 XP is a level.
- **Gems:** 1 per 5 correct answers, +5 for finishing the weekly goals. They buy avatar looks (frames, themes, buddies) and never answers.
- **Streak:** next day adds one, a gap resets it. A **freeze** covers one missed day automatically; one is earned every 7 days in a row (at most 3).
- **Weekly goals** (week starts Monday, one id across New Year): learn 15 words, 3 listening rounds, 5 games.
- **Badges:** 22, each with an icon and a criterion shown in words; locked ones show their criterion too.
- **Hearts:** still tracked but never block play; the live-lesson default is no lockout (`applyRewards(..., { hearts: false })` switches the loss off).
- **Spaced review:** Leitner intervals 1, 3, 7, 14, 30 days (unchanged); the Practice card shows at most 20 due items and says "You're done for today" when nothing is due.
