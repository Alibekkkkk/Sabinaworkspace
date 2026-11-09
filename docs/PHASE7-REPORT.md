# Phase 7: Manga reader

Branch `araylim-4-academic`, nothing pushed or deployed. How it works: [MANGA.md](MANGA.md). Screenshots: `docs/screenshots/phase7/`.

## Blocker answered first: which content?
The prompt asks that real content is chosen before more than infrastructure is built. **No decision has been given yet**, so this phase ships infrastructure and one original demo story only (teacher-style text, placeholder art drawn by `scripts/make-manga-art.mjs`, rights `original`). Nothing was taken from any site. `npm run check:manga` lists every file under `assets/manga`, its rights and its size.

✅ **Decided (2026-11-09): real stories use original art**, made or commissioned with the right to reuse, with the rights stated in each story's credits (`rights: "original"`). Other sources stay possible in the format (`CC-BY`, `public-domain`, `licensed-link`) but are not planned. Until real art exists, stories use teacher-written scripts with placeholder art, as the demo does.

## What was built
- **Feature flags per student** (`studentFeatures/<code>`): manga reader, Clip Lab, whiteboard, listening trainer. Dashboard card "Feature flags" (switch, source shown, Use default). Database rules deny the manga story without the flag. Manga tab, portal links, and the Clip Lab, whiteboard and listening pages follow the flags with a friendly "not switched on" page.
- **Content format v2:** credits and rights, reading direction, chapters, pages with panel and bubble boxes, vocabulary, questions, boss, retell. Validator with plain messages (alt text, boxes inside image and panel, unique ids, references, local images only, no answers in public drafts). Version 1 stories still load. Demo story migrated: 2 chapters, 5 pages, 21 bubbles.
- **Reader:** scroll, page flip and panel by panel; left to right and right to left; remembered place per chapter; keyboard and swipe; bubble hotspot buttons; bottom sheet with original, simpler English, translation (off by default), grammar, read aloud, save sentence; tap-a-word with save; aids (size, contrast, hide text, translation); lazy images; offline copy; dark and light themes.
- **Learning loop:** words first, one question after each page (fill the bubble, who said it, what happens next), chapter questions of four kinds, boss fight (Phase 5 module), retell and written answers to the teacher's review queue, XP and streak through the normal reward path, stars, shelf badges, chapters shelf with due dates, adaptation selector (documented and tested).
- **Teacher:** Manga card (pages, minutes, words, accuracy, boss, answers waiting) and Assign chapter with a due date.
- **Authoring:** on the tools page, a script format, CSV import and a visual editor (drag boxes, or type numbers).

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 360 pass (new: flags; validator fixtures; geometry and hotspot percentages; position persistence; mode switching and direction; learning loop; record bounds; adaptation; shelf; teacher rows; authoring) |
| `npm run test:rules` | ✅ 42 pass (new: flags, manga chapter record shape, assignments, a student without the flag cannot read the story by its address) |
| `npm run test:manga-e2e` | ✅ not-enabled page and denied read; teacher switches the flag on from the dashboard; shelf; words first; page flip, panel and scroll; keyboard; swipe; right to left; bottom sheet, translation, grammar, word and sentence saving; aids; remembered place; page and chapter questions; boss; written answers in the review queue; record and XP saved; offline copy; Manga card; assign with due date; flags off again; 390 px layout; axe clean on shelf, page and sheet; no console errors |
| `npm run check:manga` | ✅ all images local and under 250 kB; sources listed |
| Other e2e scripts (clips, clips tab, listening, whiteboard, games, lesson games) | see the line below |

## Not done / honest limits
- ❌ **Real story content and art**: the source is decided (original art), but none has been made yet.
- ❌ The visual editor and the CSV and script import were checked by unit tests (parsing, box geometry, problem lists) but **not driven in a browser**.
- ⚠ Placeholder art is simple shapes. Bubble text on a phone shows an icon and the text opens in the sheet, because phone-width pages cannot hold readable printed text.
- ⚠ The offline copy contains the answer keys (answers are checked on the device). It is deleted when the database refuses access, but a student who stays offline keeps it.
- ⚠ Page questions (fill the bubble, who said it) and rubric keywords are in the public story file; they are low stakes and answerable from the bubble text.
- ⚠ Read aloud uses the browser's voice unless a bubble has a recorded `audio` file; no recorded audio exists yet.
- ⚠ Reading position is remembered on the device, not across devices. Progress and time are saved to the database.
- ⚠ The boss re-asks chapter questions, so those answers earn XP twice (once as chapter answers, once in the fight). The daily XP cap still applies.
- ⚠ Not built: a separate teacher screen to assign a whole story (assignment is by lesson, as before); adaptation only changes defaults, it does not pick or generate stories.

## Decisions
Real stories use original art (decided 2026-11-09). Next: commissioning or drawing the first real chapter, then Phase 8 if there is one.
