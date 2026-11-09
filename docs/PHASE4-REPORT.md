# Phase 4 report: Whiteboard

Branch `araylim-4-academic`, nothing pushed or deployed. Design record: [ADR 0001](adr/0001-whiteboard.md). Research: [WHITEBOARD_RESEARCH.md](WHITEBOARD_RESEARCH.md). Screenshots: `docs/screenshots/phase4/`.

## What changed
- `js/whiteboard/`: `geometry.js` (simplify, encode, hit-test, transforms), `model.js` (limits, palette, sanitiser), `history.js` (per-person undo), `templates.js` (6 English templates), `renderer.js` (canvas, cache), `board.js` (tools, pointer/touch/stylus, keyboard), `sync.js` (database, live strokes, presence), `images.js`, `export.js` (SVG, PDF, PNG), `snapshot.js`, `app.js` (UI), `dashboard-card.js`.
- Pages: `whiteboard.html` + `js/pages/whiteboard.js`, `css/pages/whiteboard.css`; a drawer in `lesson.html` / `js/pages/lesson.js`; a Whiteboard card in `dashboard.html` / `js/pages/dashboard.js`; stop hook in `js/dashboard-clock.js`; `sw.js` (cache v8).
- `database.rules.json`: new `whiteboards` tree. Tests: `tests/whiteboard.test.mjs` (28 tests), 7 new rules tests (34 total), `scripts/whiteboard-e2e.mjs`, `scripts/whiteboard-devices-e2e.mjs`.

## Evidence
| Item | Result |
|---|---|
| Unit tests (`npm test`) | ✅ 243 pass (28 new: encoding round trip, RDP, hit tests, transforms, undo/redo and conflicts, sanitiser, templates, SVG escaping, PDF xref offsets, image sniffing, palette contrast) |
| Rules tests (`npm run test:rules`) | ✅ 34 pass: modes, teacher-only hides the class board, cross-student read/write denied, own-objects-only in draw mode, forged author denied, oversize/unknown type/bad colour/SVG image denied, presence and live strokes self-only, snapshots teacher-only |
| Part 1 e2e: student alone | ✅ draw, stroke and area eraser, undo/redo, 6 shapes, sticky and text, keyboard move/duplicate/select-next, resize and rotate handles, template, picture + alt text, fake and oversize pictures refused, zoom limits 25%-400%, pan, pages, background, PNG/SVG/PDF files verified, reload restores |
| Part 2 e2e: two browser contexts | ✅ live stroke visible while drawing; finished stroke on the other screen 27 ms after pen-up (local emulator, so not a network figure); watch mode blocks drawing; Give/Take control; student cannot delete or move the teacher's drawing; cursors and laser visible; hidden mode empties and restores; student own board readable by teacher, read only; snapshot reaches student; teacher clear; zero CSP violations |
| Devices e2e | ✅ real touch events: finger draws, two-finger pinch and pan, no stray stroke; all controls at least 44 px; stylus pressure stored (4+ levels); palm after pen ignored; axe: 0 violations at 1440 and 390 px, light and dark; no sideways scroll at 390; dashboard live thumbnail, Give/Take control, snapshot saved on clock stop |
| Speed, 2,000 strokes | ✅ pan about 57-59 fps, zoom 60 fps, on this PC in headless Edge. ❌ not measured on a phone |
| Layout gate `npm run check:visual` | ✅ no problems (dashboard and lesson screenshots regenerated) |
| Code size | ✅ 46 kB gzip for all whiteboard modules, loaded only when opened |

## Known gaps
- ❌ The lesson-page drawer was wired but not driven in a browser (the standalone page and dashboard were). Check the pen button in a lesson once.
- ❌ "Attach snapshot to homework feedback": the portal has no teacher feedback field on homework, so snapshots go to the student's board instead (Snapshots list, JPEG download). Needs your decision on where feedback should live.
- ❌ Per-page 1.5 MB cap is enforced on the client only (database rules cannot sum children); each write is still bounded by field caps.
- ❌ Not built (Should/Later): lasso, alignment guides, stickers, raise-hand, tilt. Built but without a visible switch: shape recognition. Snap to grid, lock, front/back, bold/underline exist.
- ❌ Not tested with a real screen reader or a physical tablet/stylus; touch and stylus were driven with browser touch events. The text outline, announcements and keyboard paths exist and axe is clean.
- Exported SVG wraps text with an estimated width, so line breaks can differ slightly from the screen; PDF pages are pictures, not selectable text.
- The end-of-class snapshot runs from the dashboard clock only, not from a clock stopped on the lesson page.
- Pictures are stored in the database, not file storage (reasoning in the ADR).

## Decisions needed
1. Where should teacher homework feedback live, so a snapshot can attach to it?
2. Approve publishing the new `whiteboards` rules with the next deploy.

Suggested next phase: Phase 5 (game engine).
