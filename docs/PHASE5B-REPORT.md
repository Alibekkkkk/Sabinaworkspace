# Phase 5, part 2: lesson stages and game mode

Branch `araylim-4-academic`, nothing pushed or deployed. The mapping table is in [GAMES.md](GAMES.md#lesson-stages-and-games). Screenshots: `docs/screenshots/phase5/lesson-*.png`.

## What was built
- **`gameMode: full | light | off`** per student and lesson, set from a new dashboard card ("Lesson game mode"), saved on the student's assignment record (so a content import keeps it), validated by the rules, default light.
- **Light:** a mission line on all nine stages, the card map on stage 1 ("Collect the cards", each card collected, in progress or not started, in words), stage XP through the existing reward transaction (no hearts lost, daily cap applies), a "Lesson complete!" message and big celebration.
- **Full:** Error Hunt as collapsed extra practice on the reading and tense stages when the lesson has `errorHunt`; the final test can be taken as a **Boss Battle** with the same questions, the same time limit, one attempt, and the same scoring and completion code as the classic test.
- **Off:** nothing added; the classic lesson, byte for byte in behaviour.
- Boss Battle now reports each answer to the lesson (`reportAnswer`), so a time-out ends the test with the right partial score.

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 278 pass (6 new game-mode tests: mode resolution, what each mode allows, missions for all stages, a whole lesson's XP under the daily cap, card map wording, lesson-complete rule) |
| `npm run test:rules` | ✅ 37 pass, including the new gameMode rule test (three values only, teacher-written, student-readable) |
| `npm run test:lesson-games-e2e` | ✅ driven from the teacher dashboard through off, light, full and back: OFF shows no game layer and only the classic start; LIGHT shows missions, a 20-card map, keeps the flashcards and Word Match; FULL offers Error Hunt (played with the keyboard, 3 of 3, stage score untouched, fixes counted) and a Boss Battle that answers all 29 questions with two deliberate mistakes: result 27 / 29, stage marked done, score 9 exactly as the classic formula, test cannot be retaken, stage XP saved; axe clean on the new parts; no console errors |
| Regression e2e | ✅ ladder, reading tasks, word families, lesson clock and games all still pass with light as the default |
| `npm run check:visual` | ✅ no layout problems |

## Not done
- ❌ Stage 1 "Collect the cards" is a card map over the existing flashcards; cards are not a separate reward currency, and the deck map is not tied to gems.
- ❌ Stages 2 and 4 to 8 get a mission line only. Word Match as Memory, Sentence Builder and gap-fill games in the lesson were not added (the older game screens are not modules yet); Form the word (Phase 2) already covers word formation.
- ❌ Reading comprehension True/False/Not Given as Error Hunt: Error Hunt content is teacher-authored (`errorHunt`); Sabina's lesson has none, so full mode shows no Error Hunt there until you add sentences. The test used the sample sentences.
- ❌ The "Lesson complete!" message and big celebration were covered by a unit test and by reading the code, not driven in a browser (it needs all nine stages done).
- ❌ A teacher viewing a lesson sees the mission lines but no XP is awarded; the full-mode extras are hidden from the teacher preview.
- ⚠ Boss Battle in the lesson earns stage XP like the classic test but does not count towards the "Boss slayer" badge (that comes from Practice).

## Decisions needed
1. Should full mode become the default for some students, or stay opt-in?
2. Who writes the Error Hunt sentences for Sabina's lesson (a draft set can be prepared for approval, as with the other drafts)?
