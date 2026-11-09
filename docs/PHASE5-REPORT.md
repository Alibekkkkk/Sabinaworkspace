# Phase 5 report: game engine, rewards, mastery (first part)

Branch `araylim-4-academic`, nothing pushed or deployed. Contract, audit (before and after) and the stage mapping: [GAMES.md](GAMES.md). Screenshots: `docs/screenshots/phase5/`.

## What was built
- **Audit** of all 14 declared game types (table in GAMES.md). Findings: every type already had a generator, validator and a playable screen, but behaviour tests covered generation only, no game declared a skill or level, Boss Battle was multiple choice only, Story Choice was never generated (no lesson has `storyChoices`), `saveGameProgress` dropped `listening` and `vocabulary` from a student's progress on every game save (fixed), and nothing in the lesson used the engine.
- **Contract and metadata:** every generated game now has `skill`, `estimatedMinutes` and (when the lesson sets it) `cefr`; `validateGame` checks them.
- **Five games as modules** in `js/games/types/`: Speed Quiz (number keys, streak, untimed variant), Boss Battle (shields and boss health, choice + True/False/Not Given + typed answers, never locks out, weak-point summary), Story Choice (branching `storyGraph` with a validator), **Error Hunt** (new), **Word Formation Race** (new, from approved word-family forms).
- **Calm settings:** reduce animation, no timers, no sound, vibration; stored per device; timed games become untimed.
- **Reward loop** (`js/games/rewards.js`): XP with perfect and run bonuses and a 400 XP daily cap, configurable levels, gems, streak freezes (earned every 7 days, used automatically), weekly goals, 22 badges with icons and criteria, an avatar shop (emoji items, bought in a transaction). Panels on the practice page show all of it in words.
- **Seeded puzzles:** crossword and word search take a seed (same seed, same puzzle).
- **Database rules:** XP can only rise, at most 600 per write; gems may fall (spending) but rise at most 60 per write; new bounded `stats`, `avatar`, `streakFreezes`, daily XP and weekly counters; badge ids validated by pattern.
- **Teacher "Games & mastery" card** on the dashboard: games, accuracy by skill and topic, weakest items, seven-day points, streak, badges, plus a class view (items most students miss) and a CSV download.

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 272 pass (23 new rewards tests, 12 game-type tests, 6 mastery tests) |
| `npm run test:rules` | ✅ 36 pass (2 new: XP monotonic and capped, gems, stats/badges/avatar/daily/weekly shapes, other students denied) |
| `npm run test:games-e2e` (run twice, both green) | ✅ every module game played with the keyboard only; rewards, badges, saved progress, other progress kept, review queue, settings remembered, shop purchase, teacher card and class CSV link, axe clean at 1440 and 390 px, no console errors |
| `npm run check:visual` | ✅ no layout problems |
| Sample JSON per type | ✅ `docs/games/sample-lesson.json`; a test builds and validates all 16 types from it |

## Not done (this phase is large; these remain)
- ❌ **Lesson stage conversion and `gameMode: full | light | off`** (Step 3). The lesson player is untouched, so a lesson cannot yet be completed "in game mode". Planned mapping is in GAMES.md.
- ❌ **Eleven older games still use the screens in `practice.js`**, not modules. Not built: flip animation for Memory, gap-fill with a word bank, XP cost for hangman hints, Phase 3 dictation and pronunciation coaching as game types, drag-and-drop for Sentence Builder (tap tiles exist). Keyboard-only play was tested for the five new modules, not the older eleven.
- ❌ **Assigning a game with a due date, and pushing a mistake round** to a student (Step 5).
- ❌ "Collect the cards", celebrations sized small/big/epic across stages (only item and round level exist), rules-level proof that a student cannot lower totals through other fields.
- ⚠ Teachers still cannot write student progress (existing, tested policy), so there is no way to lower a student's XP; XP "can't decrease except by teacher" is therefore stricter than asked.
- ⚠ Daily and weekly counters are client-computed; the rules bound them but cannot recompute them. Hearts are still tracked but nothing uses them to block play.
- ⚠ Avatar items are emoji, shown only in the shop list; no avatar is drawn elsewhere yet.

## Decisions needed
1. Should a teacher be able to reset or lower a student's XP (needs a rules change to the "teachers cannot write progress" policy)?
2. Which lesson stages should be converted first (flashcards, matching or the final test)?

Suggested next step: lesson stage conversion with the per-lesson `gameMode` toggle, then the older games as modules.
