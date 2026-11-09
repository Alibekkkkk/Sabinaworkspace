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

- **Vocabulary word families, the grammar exercise ladder and the new reading question types** (B2 to B4 in the brief). They add lesson content and authoring tools and need your approval of the content design; see section 5 of `docs/CONTENT_REVIEW.md`.
- **CEFR word-level check** (needs an openly licensed word list saved locally) and the **grammar-structure check** (needs a `topic` on each grammar section).
- **"Lock while paused"** toggle (optional in the brief) and the **per-stage time-on-stage analytics derived from section events**; the existing per-stage views are unchanged.
- **Final-test countdown** still has its own timer; it was left as the brief asked and is not tied to the lesson clock.
- Per-paragraph reading audio and click-a-word definitions in the reading section.
- The teacher "forgot to stop" recovery is the stop-then-adjust flow with a logged reason; there is no separate wizard.
