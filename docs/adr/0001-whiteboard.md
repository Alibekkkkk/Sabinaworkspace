# ADR 0001: Whiteboard

Status: accepted (Phase 4). Date: 2026-11-09.

## Context
The portal is plain HTML, CSS and ES modules with no build step, a strict Content Security Policy (no inline script or style, no `unsafe-inline`), Firebase Realtime Database for data and static hosting. The whiteboard must work for the teacher and student live, for the student alone, on phones and tablets, with keyboard and screen-reader paths.

## Options
**A. Embed tldraw or Excalidraw.** Both are MIT licensed and feature rich. Both are React applications that need a bundler. That means adding a build step to a site that has none, a large bundle (Excalidraw alone is several MB before fonts and locales; tldraw is similar), third-party scripts that would need pinned versions, SRI hashes and CSP entries, and a sync layer written anyway because neither speaks Realtime Database. Their accessibility for keyboard-only and screen-reader use is limited, and the data model (their own JSON) would be an upgrade liability for stored lessons.

**B. A small custom module on `<canvas>`** with a vector object model, Pointer Events and a command history, about 2,500 lines in `js/whiteboard/`, no dependencies.

## Decision
Option B. A measured-feature comparison was not needed to decide: A cannot be added without a build step and a CSP change, which this phase is not allowed to justify away. B gives exactly the feature list in the brief, keeps the page's JavaScript small (measured: 169 kB unminified, 46 kB gzipped for all whiteboard modules together, loaded only when the board is opened; well under the 150 kB gzip budget), keeps the data model in our hands, and lets accessibility be designed in.

Trade-offs accepted: we maintain the editor ourselves; no handwriting recognition, embeds or infinite canvas; text editing is a simple textarea over the canvas (no rich text beyond bold/underline).

## Data model
```
whiteboards/<code>/<lessonId>/
  mode                         "view" | "draw" | "teacher-only"        teacher writes
  presence/<uid>               name, colour, cursor, laser trail        each person writes their own
  snapshots/<id>               JPEG per page, saved at class stop       teacher writes, student reads
  boards/<scope>/index/<pageId>                title, bg, paper, order
  boards/<scope>/pages/<pageId>/meta | objects/<id> | images/<id> | live/<uid>
```
`scope` is `shared` (class board) or `personal` (the student's own board). The brief wrote `whiteboards/$code/$lessonId/$pageId`; the extra levels keep `mode`, presence and snapshots from colliding with page ids and let one rule block cover both boards.

An object is `{ t: stroke|shape|text|sticky|image, k, z, x, y, w, h, r, s:{c,w,o,f,fs,b,u}, p, tx, im, alt, lk, by, at }`. Strokes store `p`, points relative to the object, delta-encoded in base 36 at half-unit precision with a pressure digit. A move only changes `x,y`. Deleting writes a tombstone `{t, by, at, del:true}`; a cleared page removes the node.

## Behaviour decisions
- **Simplification and size:** strokes are thinned (Ramer-Douglas-Peucker, epsilon 0.5) and rendered smoothed through quadratic midpoints. A stroke longer than 5,600 characters of points is split into several objects. Per-object limits are enforced by the field caps in the rules (strokes 5,600 + text 1,500 + fixed fields is below 8 kB); the client also refuses writes over 8 kB. The 1.5 MB per page cap is enforced on the client only, because Realtime Database rules cannot sum children. A writer who bypasses the client could exceed it; per-node caps still bound each write.
- **Live strokes:** the in-progress stroke is sent to `live/<uid>` at most every 50 ms (20 Hz) and removed on commit. Committed objects are written on pointer-up.
- **Undo/redo:** per person, in memory, 100 steps, inverse commands. If someone else changed an object after your edit, that object is skipped and the person is told.
- **Conflicts:** last writer wins per object. Students may only change objects they authored (rules and client); the teacher may change anything.
- **Images:** stored as re-encoded data URLs (max side 1,024 px, at most 250,000 characters, PNG/JPEG/WebP by file signature, SVG refused) in `images/<id>`, separate from objects so the object stream stays light. Firebase Storage is not configured in this project and would need a new bucket, rules and CORS; the database keeps one deployment and one rule set. The cost is database size, bounded by the page cap and the 12-page limit.
- **Rendering:** committed objects are drawn into an offscreen cache that is blitted each frame; only overlays (live strokes, selection, cursors, laser) redraw per frame. Zooming scales the cached bitmap and rebuilds after the gesture settles. This replaces dirty-rectangle redraw.
- **Modes:** `view` (student watches and can use the laser), `draw`, `teacher-only` (the shared board is unreadable for the student; the rules enforce it). A student's personal board is readable by that student and by teachers, writable only by the student.
- **Security:** everything read from the database passes `sanitizeObject` (types, ranges, colour whitelist, id pattern); text is drawn to canvas or set with `textContent`; exported SVG escapes all text and embeds only validated image data URLs.

## Consequences
No build step, no new third-party script, no CSP change beyond `'self'`. We own the editor's bugs and its accessibility. A later move to a library would need a converter from this object model.
