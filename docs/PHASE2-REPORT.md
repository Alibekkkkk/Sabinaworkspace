# Phase 2 report: lesson clock and standard sections

## What works now

**Lesson clock (Part A)**
- The teacher starts, pauses, resumes and stops a clock per student and lesson, from the dashboard ("Lesson clock" card) or from a floating panel on the lesson page in teacher preview. Stopping asks "Stop and save 47:12?".
- The student's lesson header shows the same value live (`mm:ss`, `h:mm:ss` after an hour) with a state chip (Not started, Running, Paused, Stopped). The value ticks 4 times a second as `role="timer"` with `aria-live="off"`; only state changes are announced.
- Time is computed from server timestamps plus the device's measured offset, so a refresh, a sleeping tab or a wrong device clock do not change it. The old `setInterval`/`sessionStart` timer is gone; the `elapsed` written to the session state now comes from the clock.
- The stopped total is saved permanently (`lessonClock/<code>/<lessonId>/totalMs`) and shown in: the lesson's class summary card, the dashboard history table and monthly total, the portal ("Last class 52:08" on the lesson card and a "Class time this month" tile), the weekly summary ("Classes this week") and a CSV export with a `duration_seconds` column (spreadsheet-formula-safe).
- Adjusting time needs a reason; it is written to the clock record (`lastAdjust.previousMs`) and to the append-only log.
- Teacher warnings: running longer than 2 hours, and no student activity for 15 minutes while running. Offline devices show "offline - time may resync".

**Sections (Part B, schema and bar)**
- Every classwork file in `content/` is now schema v2 with `sections` (Vocabulary, Grammar, Reading Comprehension), each with `estimatedMinutes` and the content keys it covers; the final test stays a closing stage of its own. Migration: `npm run migrate:sections` (`-- --dry-run` first); idempotent; adds exactly six lines per file; snapshots in `content/_snapshots/`. Imported copies in Firebase need a re-import (Import Content tool) to carry the new fields.
- An always-visible section bar under the header shows, for each section, planned time, actual time, remaining or over time, and a progress bar that turns amber at 100% and red beyond 120% (text says "At the planned time" / "Over time", so colour is not the only signal). The current section is highlighted; the teacher has "Next section". On phones the segments wrap.
- Teacher overrides of the planned minutes are stored per student (`studentCurriculum/<code>/<lessonId>/sectionOverrides`), not in the protected lesson content.
- `npm run lint:content` checks schema/sections (errors) and target vocabulary, grammar-structure counts, reading time and short answers (warnings). Findings are in `docs/CONTENT_REVIEW.md`.

**Grammar ladder (Part B3)**
- Rule card (formula, 2 contrasting examples, common mistakes for Kazakh and Russian speakers) is shown at the top of the Grammar stage 4. The six-step ladder (Notice, Complete, Build, Correct the error, Transform, Use it yourself) is added at the end of stage 8. Steps unlock one after another; every wrong answer shows its explanation, and "Show answer" appears after the first miss.
- Content lives in the lesson file under `grammarLadder` with item metadata `{id, prompt, answers[], explanation, tags[]}` and stable ids. `js/grammar-ladder.js` validates it (also run by `npm run lint:content`).
- Step 6 asks for 2-3 original sentences, a self-check checklist and at most 300 characters; the text goes to the teacher's review queue. A missing target structure is only a hint.
- **Approval gate:** `status: "draft"` is visible only in teacher preview (with a banner). Sabina's present-perfect ladder is a draft that needs your review; set `"status": "approved"` in `content/sabina.json` to show it to the student.
- The ladder does not change the existing stage scores. Progress is saved in the lesson draft.
- Evidence: 9 unit tests, `npm run test:ladder-e2e` (26 checks: draft hidden from student, order of unlocking, explanations, tiles, review queue, refresh keeps progress), axe clean and no horizontal scroll at 1440/390/320.

**Word families (Part B2)**
- Every target word can carry `vocab[].forms`: noun, verb, adjective, adverb, negative and one `other` form (each with an example sentence), plus `affixes` (part, prefix or suffix, meaning). A flashcard shows a "Word family" button that lists the forms, examples and word parts, with a Back button to the quiz.
- "Form the word" sits under the flashcards: `Humid в†’ (noun) ______`. The type rotates between choose, type and build from morphemes (tap prefix, root and suffix tiles, with distractor pieces). Wrong answers explain where the word comes from. Progress is saved in the lesson draft.
- **Validation without a dictionary:** no openly licensed derivation list was available offline, so nothing is guessed. A form must share a stem (4+ letters) with the headword, spell out its `parts` (which must add up to the word), or be listed in an optional `content/wordlists/derivations.txt` (one word per line, record its licence). Anything else is a lint error that tells the author to list it under `forms.review`; review items are hidden from students and appear as warnings.
- **Approval gate:** `forms.status` is `draft` or `approved` per word; students see approved families only. Seven of Sabina's words (flood, volcano, eruption, humid, deforestation, atmosphere, evacuation) have a draft family that needs your review; the other 13 words have no real derived forms and were left alone.
- Authoring: the import tool (`tools/import-content.html`) has a "Word family helper". It proposes candidate forms from suffix and prefix patterns (not checked against a dictionary), the teacher ticks the real ones and writes examples, and it prints a `forms` block to paste into the lesson file.
- Evidence: 7 unit tests; `npm run test:wordfamily-e2e` (15 checks: draft hidden from student, panel, all three exercise types solved, wrong answer explains, saved and restored after refresh); axe clean and no horizontal scroll at 1440/390/320.
- **Fixed on the way:** flashcards could not be opened at all, because `openQuiz` assigned an undeclared variable (`s1CurrentIdx`), which throws in module code. It is now declared.

**Reading tasks (Part B4)**
- A new "Part C вЂ” Go deeper" block sits under the existing questions on the reading stage. It lives in the lesson file under `readingTasks` (`status`, `tasks[]`) so the existing short-answer, multiple-choice and context questions, their scoring and the stage completion are untouched. It does not change any score.
- Four task types: **True / False / Not Given with evidence** (after the right answer the student must tap the sentence that proves it; Not Given has no evidence), **find the sentence** (tap it in a clickable copy of the passage, grouped by paragraph A, B, C), **long answer** (word guide, a rubric self-check that shows which points were found, then sent to the review queue, with the model answer shown afterwards) and an **application question** (a regular expression for the target structure is required before sending; if it is missing the structure hint explains why).
- The linter and the page both validate `readingTasks` against the passage: every evidence sentence must be an exact sentence of the text, a Not Given statement cannot carry evidence, each model answer must satisfy its own rubric or structure, and word guides must fit the 300-character review queue limit.
- The rubric is advisory (key-word groups, simple plurals and phrases); it never blocks sending. The teacher reads the full answer.
- **Approval gate:** `status` is `draft` or `approved`. Sabina's seven tasks (3 True/False/Not Given, 2 find, 1 long, 1 application using the present perfect) are drafts for you to review.
- Evidence: 9 unit tests; `npm run test:reading-e2e` (22 checks: draft hidden from student, wrong answers explained, evidence required, rubric self-check, length gate, structure gate, review queue entries with task id and type, saved and restored after refresh, sent answers stay locked); axe clean and no horizontal scroll at 1440/390/320.

## Evidence

| Check | Result | Repeat |
| --- | --- | --- |
| Unit tests | 170 pass, including 18 clock tests (every legal and illegal transition, revision conflicts, pause/resume sums, section sums, 300 random histories where section times always add up to the total, skew of +-10 minutes, tab sleep) and the sections, migration and lint tests | `npm test` |
| Rules tests | 26 pass, including the clock state machine, frozen total, append-only log, teacher-only writes, cross-student denial and section overrides | `npm run test:rules` |
| Browser test, two sessions, student device clock +10 minutes | 16/16 checks: student and teacher agree within a second while running; pause freezes; a student refresh and a teacher refresh keep the value; resume continues; stop saves `totalMs`, equal to the displayed value; summary card appears; the log is exactly start, pause, resume, stop; `stoppedAt` is a real server time | `npm run dev`, then `npm run test:clock-e2e` |
| Layout gate | no horizontal scroll, clipped text or overlaps on lesson, homework, dashboard in both themes at 320/390/768/1440 | `npm run check:visual` |
| Live checks on the demo stack | dashboard card shows controls, section estimates (editing one stores the override, and the student's section bar then shows it), saved-time table, monthly total; portal tile and "Last class" | manual, recorded here |

Revision conflicts: a write is only accepted when its `rev` is the stored `rev` + 1, so two teachers acting on the same snapshot cannot both succeed; the loser sees "Someone else just changed the clock. It has been refreshed; try again."

## Decisions worth knowing

- **No transaction for clock changes.** The Firebase SDK resolves server timestamps inside a transaction with its own estimate, which can be a few milliseconds ahead of the server and be refused by the `runningSince <= now` rule. Clock changes are plain writes with true server timestamps; the rules enforce the state machine and the revision.
- The browser test's "skewed device" had to shift both `Date.now()` and `new Date()`, because Firebase measures its offset through `new Date()`.

## Not done

- **Click-a-word definitions limited to the lesson vocabulary and per-paragraph audio** in the reading section (the rest of B4 is built).
- **CEFR word-level check** (needs an openly licensed word list saved locally) and the **grammar-structure check** (needs a `topic` on each grammar section).
- **"Lock while paused"** toggle (optional in the brief) and the **per-stage time-on-stage analytics derived from section events**; the existing per-stage views are unchanged.
- **Final-test countdown** still has its own timer; it was left as the brief asked and is not tied to the lesson clock.
- The teacher "forgot to stop" recovery is the stop-then-adjust flow with a logged reason; there is no separate wizard.
