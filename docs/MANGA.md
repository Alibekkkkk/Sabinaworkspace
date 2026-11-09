# Manga Reader

A reading mode for students whose teacher switches it on (today: Gaziz). Students read a story page by page, tap bubbles for help, learn words, answer questions and fight a chapter boss. Teachers see what was read, how it went, and what is waiting for review.

## Rights: what may be used

Only these sources are allowed. The credits block of every story must say which one applies, and the reader shows it.

| `credits.rights` | Meaning | Also needed |
|---|---|---|
| `original` | Text and art made for this course (by the teacher, or commissioned with the right to reuse) | licence text |
| `CC-BY` | Openly licensed (CC BY, CC BY-SA, CC0) with the licence kept | `credits.sourceUrl` (https) |
| `public-domain` | Out of copyright | `credits.sourceUrl` |
| `licensed-link` | The story stays on an official reader; we only link to it | `credits.sourceUrl` |

**Never** commercial scans, fan scans or anything taken from a site without a licence that allows it. Images are local files in `assets/manga/` (no remote hosts; `ALLOWED_IMAGE_HOSTS` in `js/manga/schema-v2.js` is empty on purpose). Each page image must be 250 kB or smaller; the unit tests check this for the shipped story.

The demo story "The Garden Above the City" is original: teacher-style text and simple placeholder art drawn by `scripts/make-manga-art.mjs` (CC0). Real art can replace the placeholders without changing the JSON, as long as the page size and the panel and bubble boxes still match.

## Feature flags

`studentFeatures/<code>/<flag>` (teacher-written, readable by that student): `mangaReader`, `clipLab`, `whiteboard`, `listeningTrainer`. `js/features.js` decides: an explicit true or false wins; otherwise the lesson's own `features` marker (the older way); otherwise the default (manga off, the others on). Switch them on the dashboard, card **Feature flags**; **Use default** removes the override.

- The database rules deny the manga story to a student whose flag is not on, whatever the address (`protectedContent/<lesson>/manga`). This is the real protection; the pages only add a friendly "not switched on" message.
- The Manga tab and the portal link appear only when the flag is on. Clip Lab, whiteboard and listening pages show the same friendly page when switched off.

## Content format (version 2)

`content/manga/<id>.json`, `schemaVersion: 2`. Public file: no answer keys. Validator: `js/manga/schema-v2.js` (`validateMangaV2`), reached through `js/manga/schema.js` so the import tool and reader use one entry point. Version 1 files still load (migrated on the fly).

```
credits { author, artist, licence, sourceUrl?, rights }
readingDirection  ltr | rtl | vertical
chapters[] { id, title, summary, estimatedMinutes, vocabulary[], pages[], questions[], boss?, retell? }
  pages[] { id, image, width, height, alt, panels[], quick? }
    panels[] { id, bbox [x,y,w,h], summary, bubbles[] }
      bubbles[] { id, type speech|thought|narration|sfx, speaker?, text, simplified, translation?,
                  audio?, at [x,y,w,h], grammarNote?, vocabulary[] }
  questions[] { id, type gist|vocab|detail|inference, prompt, options?, rubric?, bubbleId?, panelId? }
  boss { questionIds[] }   retell { prompt, minWords }
```

All boxes are in image pixels. The validator checks: alt text on every page, every panel inside its image, every bubble inside its panel, unique ids, that question, boss and quick-question references exist, that images are local, and that public drafts contain no answers. `mangaWarnings` adds softer advice (six to eight pre-reading words, at least three kinds of question, a boss, a retell).

**Answer keys** are kept out of the public file. `gist` and `vocab` questions have an `answer`; `detail` questions an `answers` list; `inference` questions are never auto-marked (they have a `rubric` that only nudges the student). Keys are merged into `protectedContent/<lesson>/manga` at import (`docs/manga/gaziz-demo.answers.json` shows the shape, keyed by story id). The rubric keywords and the page quick questions are in the public file: they are low stakes and the page quick questions are answerable from the bubble text.

## The reader

- **Modes:** Scroll, Page flip, Panel by panel. The last mode and place are remembered per chapter on the device. Webtoons (`vertical`) start in scroll.
- **Direction:** left to right or right to left (toggle). It changes panel order, the arrow keys (in right to left the left arrow goes forward), and the position of the Previous / Next buttons. Swiping works in the two page modes.
- **Bubbles** are real buttons placed by percentage over the page, so they stay on their bubble at every width, with an accessible name that includes the text (or not, when the student hides text). On a narrow page they show a speech icon and the text lives in the sheet.
- **Bottom sheet:** original, simpler English, a translation button (off by default), grammar note, Read aloud (a recorded file if `audio` is set, otherwise the browser voice), Save sentence. Words with a meaning are buttons that open a small dialog with Save word.
- **Aids:** text size, high contrast, hide bubble text until tapped, show translation straight away. Dark theme follows the site theme.
- **Offline:** opening a chapter keeps the story and its pictures in the `learning-studio-manga-v1` cache. If the database says no (the flag was switched off), the copy is deleted. The copy includes answer keys, because answers are checked on the device.
- Page images load lazily except the first ones.

## Learning loop

1. **Words first:** six to eight words (see the selector below) with Save buttons.
2. **After each page** one small question: *Fill the bubble*, *Who said it?* or *What happens next?* (a prediction, never wrong).
3. **Chapter questions:** main idea, vocabulary and detail questions are checked at once; a *think about it* answer goes to the teacher.
4. **Boss fight:** the Phase 5 Boss Battle over the chapter's boss questions. It is a bonus.
5. **Retell:** a short written retelling that goes to the teacher.
6. **Rewards:** finishing a chapter saves one game attempt (XP, streak, weekly goals and daily cap as for any game, no hearts), the boss saves its own attempt and counts toward the boss badge. Chapter stars follow the same 90% / 70% bands as Clip Lab and the best is kept. Reading badges (first pages, chapter finished, boss slayer, perfect reader, whole story) are worked out from the saved chapter records and shown on the shelf, so they need no extra database fields.

Written answers use the teacher's existing review queue (`sessions/<code>/reviewQueue`, question ids start `manga:<chapter>:`).

### Adaptation selector

`js/manga/adaptation.js` (`chooseAdaptation`) turns the story level, the student's level (placement, teacher level first) and the accuracy of the last three chapters into defaults. The student can always change the aids.

| Situation | Simpler English first | Pre-reading words | Next story |
|---|---|---|---|
| Story one or more levels above the student | yes | 8 | same |
| Same level, accuracy under 60% | yes | 8 | easier |
| Same level, accuracy 60 to 84% | no | 7 | same |
| Same level or below, accuracy 85% or more | no | 7 or 6 | harder |
| Story below the student | no | 6 | same or harder |
| Level or accuracy unknown | no | 7 | same |

The shelf shows the reason in one sentence. Tests: `tests/manga-v2.test.mjs`.

## Teacher tools

- **Dashboard, card Manga Reader:** per chapter, pages read, minutes, words saved, share of questions right, boss defeated, written answers waiting, and the due date. **Assign chapter** writes `mangaAssignments/<code>/<story>/<chapter>` (optional due date, end of that day); **Remove assignment** clears it. The student's shelf shows the due date and "Continue" points at the assigned chapter.
- **Tools page (`tools/import-content.html`), Make a manga draft:**
  - *Script or CSV:* a plain-text script format (the **Show an example script** button fills in a complete example) or CSV with one bubble per row (`chapter,page,image,width,height,alt,panel,panelBox,panelSummary,type,speaker,bubbleBox,text,simplified,translation,grammar,words`). Errors name the line or row.
  - *Visual editor:* load a page image, drag boxes for panels and bubbles (or add a box and type its numbers, so no mouse is needed), fill in the text, and put the page into the draft. The list of what is still missing is live.
  - Then **Validate manga draft**, download, and import with answer keys as for any content.

## Files

`js/manga/`: `schema.js`, `schema-v2.js`, `geometry.js`, `reader-state.js`, `reader-ui.js`, `learning.js`, `learning-ui.js`, `adaptation.js`, `shelf.js`, `dashboard-card.js`, `authoring.js`. Pages: `manga.html`, `js/pages/manga.js`, `js/pages/tools-manga.js`. Flags: `js/features.js`, `js/feature-gate.js`, `js/feature-card.js`.

Database: `studentFeatures`, `studentProgress/<code>/manga/<story>/<chapter>` (bounded record), `mangaAssignments`, and the manga clause of `protectedContent`.

## Checking

`npm test` (validator fixtures, geometry, position persistence, mode switching, adaptation, shelf, authoring), `npm run test:rules` (flag, progress record, assignments, denied reads), `npm run test:manga-e2e` (keyboard and touch in all three modes, left to right and right to left, 390 px layout, axe).
