# Phase 5, part 3: the older games as modules

Branch `araylim-4-academic`, nothing pushed or deployed. Audit table (after state): [GAMES.md](GAMES.md#audit-before-and-after).

## What was built
Eleven games moved from the old screens in `practice.js` to modules on the shared contract: Word Match, Memory Cards, Flashcards, Fill the Gap, Sentence Builder, Hangman, Word Scramble, Listening Dictation, Pronunciation, Crossword, Word Search. With the five from part 1, all sixteen types now run through `js/games/runtime.js`; the old code is gone.

New behaviour where the brief asked for it: Memory Cards flip animation (calm-aware) and a moves count; Sentence Builder tap-to-place with take-back and distractor tiles; Fill the Gap uses the shared grader and an optional word bank; Hangman and Word Scramble hints that cost 3 XP; Listening Dictation uses the Phase 3 player; Pronunciation uses the Phase 3 speaking layer (consent first, coaching feedback, typed fallback, nothing queued for review); Crossword and Word Search are fully keyboard-operable with one tab stop and spoken labels.

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 288 pass (10 new module tests: registry covers all 16 types, memory rules, hangman, hint XP, coaching, word-search selection, sentence tiles, typed grading, review games, flashcards) |
| `npm run test:games-keyboard-e2e` (run three times, all green) | ✅ all eleven games played to the end with keys only; hint XP exact (+66 instead of +69); Memory plays with the moves count; word bank; crossword is one tab stop; word search finds words forwards and backwards; pronunciation misses add nothing to review; axe clean on Word Search, Memory Cards, Sentence Builder and Crossword; crossword fits 390 px; no console errors |
| `npm run test:games-e2e`, `test:lesson-games-e2e` | ✅ still pass |
| Database rules | no rule changes in this part |

## Not done / honest limits
- ❌ Not tested: real microphone speech recognition and real audio. The browser test stubs the speech voice for Dictation and uses the typed fallback for Pronunciation.
- ❌ Drag-and-drop for Sentence Builder was not added (tap and keyboard only, by design).
- ❌ Axe was run on four of the eleven screens (the two grids, Memory Cards, Sentence Builder); the other seven use the same shared parts (`gm-*` buttons, inputs and feedback) already scanned in part 1, but were not each scanned.
- ❌ Puzzle cells are about 2 rem wide, below the 44 px target size used elsewhere (they meet the WCAG 2.2 AA minimum of 24 px).
- ⚠ Existing practice-page behaviour changed: a game now ends with the shared summary screen and "Play again", not the old "Check answers" button.

## Decisions needed
None new. Open from before: Error Hunt sentences for Sabina; full game mode as default.
