# Phase 6, part 2: the Clips tab and clip results

Branch `araylim-4-academic`, nothing pushed or deployed. How it works for students and teachers: [CLIP_LAB.md](CLIP_LAB.md#for-students-and-for-scheduling). Screenshots: `docs/screenshots/phase6/clips-tab-*.png`, `clip-dashboard-card.png`.

## What was built
- **Clips page** (`clips.html`): the existing "Clips" item in the bottom bar now opens it. Cards for every clip assigned through a lesson, with level, kind and grammar filters (only values that exist are offered), a To do / Done switch, due dates from the lesson schedule, stars, and a "Coming up" list for locked clips (title and lock date only; the clip itself is not read until it opens).
- **Completion record** per clip: finishing a clip now saves stars (best kept, a bad retry never removes stars), score, attempts, time on the clip (seconds with the page in view), and up to eight weak transcript lines. New database rules bound every field.
- **Teacher card** "Clip Lab" on the dashboard: finished count, stars, score, attempts, minutes on the clip, words saved from the clip, and the text of the lines the student found hard.
- **Lesson link:** lessons that have a clip show "Open the clip" on the vocabulary and first grammar stages; the clip page offers "Back to the lesson".

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 321 pass (9 new catalog tests: joins, filters and facets, locked clips, sorting, descriptions without colour, completion record bounds, weak lines, teacher rows) |
| `npm run test:rules` | ✅ 38 pass (new: clip records are own-progress only, teachers read but cannot write, stars 1 to 3, bounded time, at most eight weak lines, no extra fields) |
| `npm run test:clips-tab-e2e` | ✅ list order with due date first, locked clip separated, filters narrow and combine and explain an empty result, stars appear live, Done / To do switch, the nav tab is marked current, axe clean, 390 px layout, lesson link and back link, teacher card with stars, attempts, time, saved words and the hard line; no console errors |
| `npm run test:clips-e2e`, `lesson-games`, `games`, `ladder`, `clock` e2es, layout gate | ✅ all still pass; the clip e2e also checks the saved completion record |

## Not done / honest limits
- ❌ **The Phase 2 lesson clock does not count clip time.** The clock is teacher-controlled and per lesson section; the clip page records its own active time instead, and the dashboard shows that. Making the clock include it needs a decision on which section the time belongs to.
- ❌ Clips inside a lesson are a link, not an embedded player on the page (the video and the stage content do not share a screen).
- ❌ No dedicated "assign this clip" screen: clips are assigned through the lesson and the manifest, as before.
- ❌ Collectible clips and a clip streak were not built (stars and the existing XP, badges and streak cover rewards).
- ❌ Clip details for the Clips page are read from each clip's protected record (one read per open clip); a lesson list with many clips would be better served by storing a small summary at import time.
- ⚠ The dashboard lists clips from the teacher's lesson records, so a clip assigned only in the student's own record (not the teacher's) does not appear there.
- ⚠ The seven shipped clips still have unverified timing and show "Text and activities" on their cards.

## Decisions needed
Should clip time count in the lesson clock (and in which section), or stay separate? Then: Phase 7 (Manga reader)?
