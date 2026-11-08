# PHASE 4 — Whiteboard (P2)

## Goal
A full online whiteboard inside the portal — draw, erase, write, shapes, sticky notes, images, undo/redo, zoom/pan — usable by teacher and student in class (real-time shared) and by the student alone (personal board), saved per lesson.

## Research first (write `docs/WHITEBOARD_RESEARCH.md`, ≤ 1 page)
Compare feature sets of Miro, Excalidraw, tldraw, Microsoft Whiteboard, Google Jamboard (retired – use its feature list as history), Zoom Whiteboard, Explain Everything, Lucidspark and "Online Whiteboard for teaching" tools. Produce a table: feature → must / should / later, with the reason for a one-to-one English class (e.g. fast handwriting for spelling, underline/circle errors, sentence-building with sticky notes, annotate a reading text, laser pointer, templates for tenses).

## Feature scope
**Must**
- Tools: pen (smooth, pressure-aware), highlighter (multiply blend, translucent), eraser (stroke eraser + area/pixel eraser), laser pointer (temporary trail, visible to the other person), line, arrow, rectangle, ellipse, triangle, text, sticky note, select (click, marquee, shift-multi), move, resize, rotate, delete, duplicate, copy/paste, undo/redo (Ctrl/Cmd+Z/Shift+Z), clear board (confirm; teacher-controlled on the shared board).
- Style: colour palette + custom colour picker (AA-aware defaults), stroke width (4–5 presets + slider), opacity, fill on/off, font size for text.
- Canvas: infinite or large (e.g. 8000×6000) pannable canvas; zoom 25–400 % (wheel/pinch/buttons); fit-to-content; multiple pages with thumbnails; backgrounds: blank, grid, dots, ruled (lined for handwriting), and **English templates** (tense timeline, T-chart, sentence-builder table, mind map, Venn, word-family tree).
- Input: mouse, touch (two-finger pan/pinch), stylus (pressure, tilt optional, palm rejection by pointer type), `touch-action: none`, Pointer Events with `getCoalescedEvents`. Large target UI on tablets.
- Real-time collaboration: shared presence (coloured named cursors), live strokes visible within ~200 ms, permission modes set by the teacher: `view` / `draw` / `teacher-only`; student's personal board is private.
- Persistence: autosave per `lesson` and per `student` (`whiteboards/$code/$lessonId/$pageId`), restored on reload; version snapshot at class stop (Phase 2 hook); export PNG, SVG, PDF (client-side) and "attach snapshot to homework feedback".
- Images: paste/upload (≤ 2 MB, downscaled, type-sniffed png/jpeg/webp only, no SVG upload), stored as data URL in Storage or compressed in DB with a cap — choose and justify.
- Accessibility: every toolbar button labelled with tooltip + keyboard shortcut; full keyboard alternatives for select/move/delete/undo; high-contrast toolbar; `aria-live` announcements for mode and tool changes; an "alt text" field per image and a text-only "board contents" outline (screen-reader view listing text/sticky objects).
**Should**: lasso select, snap-to-grid/align guides, lock objects, layers/z-order, emoji/stamp/sticker set (✓ ✗ ★ ? with accessible names), shape recognition (rough circle → circle), ruler/protractor not needed, text formatting (bold/underline), voice-free "raise hand" button.
**Later**: embedding video, handwriting-to-text, AI features.

## Architecture decisions (record as `docs/adr/0001-whiteboard.md`)
Constraints: static hosting, no build step today, strict CSP (Phase 0A), Firebase RTDB.
- Option A: embed tldraw or Excalidraw. Both are React-based and need a bundler; adding a build step must be justified, SRI-pinned, and CSP-compatible, and bundle size reported.
- Option B: custom, dependency-free module using `<canvas>` (or SVG) with a vector object model, Pointer Events, and a small command history. Recommended unless A is clearly superior after measuring.
- Decide, document the trade-offs (maintenance, size, features, licence — both candidates are MIT), then implement.
Data model (vector, not bitmap), e.g.
```
board = { id, pageId, rev, objects: { [objId]: { t:"stroke|shape|text|sticky|image", z, x,y,w,h,rot, style:{…}, pts:"<delta-encoded simplified path>", by: uid, at: ts } } }
```
- Simplify strokes (Ramer–Douglas–Peucker / Catmull-Rom smoothing); delta-encode points; batch live-stroke updates at ≤ 20 Hz to `…/live/$uid`; commit to `objects` on pointer-up. Undo/redo is per-user and operates on own objects using inverse commands; conflict policy: last-writer-wins per object, deletes tombstoned.
- Size guard: per-object ≤ 8 kB, per-page ≤ 1.5 MB; compress and prune old pages; show a friendly "board is full" message.
- Rendering: requestAnimationFrame, dirty-rect redraw, offscreen canvas cache for committed layers; 60 fps with 2 000 strokes on a mid phone (measure and report).

## Rules (test all)
- `whiteboards/$code/$lessonId/$pageId`: read: owner student + teachers; write: teacher always; student only when `mode` is `draw` or when it is their personal board; `.validate` for object shapes/types/size caps; presence node writable only by self; `mode` node writable by teachers only.
- Deny cross-student read/write; deny oversize; deny unknown object types.

## UI placement
- A "Whiteboard" tab/drawer in `lesson.html` (side-by-side with the lesson on ≥ 1280 px; full-screen on mobile with an easy "back to lesson") and a standalone `whiteboard.html`. Teacher dashboard shows a live thumbnail of the student's board and a "Take control / Give control" button. Floating toolbar (bottom-centre on mobile, left rail on desktop), minimal chrome, dark/light backgrounds, colour presets that stay readable in both themes.

## Tests
- Unit: stroke simplification, serialisation round-trip, undo/redo stack, hit-testing, transform math, export.
- Rules tests (above). Browser tests: draw with synthetic pointer events, erase, undo, refresh → persisted; two browser contexts see each other's strokes; permission toggle works; performance trace recorded.

## Acceptance criteria
I can draw/erase/type/add shapes and sticky notes, zoom and pan, undo/redo, export a PNG, reload and see my board, and (with the teacher in another browser) see each other's drawing live; the teacher can switch student drawing on/off; all of it works on a tablet-sized viewport with touch; keyboard and screen-reader paths exist; no CSP violations.

## Non-goals
No video/voice calling, no AI features.
