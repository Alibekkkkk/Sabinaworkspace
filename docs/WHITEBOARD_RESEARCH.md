# Whiteboard research (one page)

Tools compared from their public feature lists: Miro, Excalidraw, tldraw, Microsoft Whiteboard, Google Jamboard (retired in 2024, used as history), Zoom Whiteboard, Explain Everything, Lucidspark, and the "online whiteboard for teaching" family (Classroomscreen, Whiteboard.fi, Padlet-style boards). Nothing was copied; this is a feature survey for a one-to-one English class.

| Feature | Seen in | Priority | Why it matters in our class |
|---|---|---|---|
| Pen with smoothing and pressure | all | **Must** | Fast handwriting for spelling and sentence practice; stylus on a tablet |
| Highlighter (translucent, multiply) | Jamboard, Explain Everything, MS Whiteboard | **Must** | Highlight a word in a reading text without hiding it |
| Stroke eraser and part-of-stroke eraser | Excalidraw (stroke), MS Whiteboard (both) | **Must** | Underline then remove a mistake; fix one letter without redrawing |
| Laser pointer, visible to the other person | Miro, Zoom, Explain Everything | **Must** | "Look at this word" with nothing left on the board |
| Line, arrow, rectangle, ellipse, triangle | all | **Must** | Circle errors, timelines, arrows between words |
| Text and sticky notes | Miro, Jamboard, Lucidspark | **Must** | Sentence building: move word notes around into order |
| Select, move, resize, rotate, duplicate, copy/paste, delete | all | **Must** | Rearranging sentence parts |
| Undo/redo per person | all | **Must** | Students will make mistakes and need to take them back safely |
| Zoom and pan, large canvas, fit to content | Miro, tldraw, Excalidraw | **Must** | Long timelines and mind maps; phones need zoom |
| Pages with thumbnails | Jamboard, MS Whiteboard | **Must** | One page per task in a lesson |
| Backgrounds: grid, dots, lined | Jamboard, Excalidraw (grid) | **Must** | Lined paper for handwriting |
| English templates (tense timeline, T-chart, sentence builder, mind map, Venn, word-family tree) | Miro/Lucidspark template galleries, generic | **Must** | Saves the teacher setup time in class |
| Live cursors, live strokes, permission modes | Miro, Excalidraw collab, Zoom | **Must** | Teacher decides when the student may draw |
| Autosave per lesson, export PNG/SVG/PDF | all | **Must** | Student reviews after class; teacher attaches to feedback |
| Pictures (paste/upload) with alt text | Miro, MS Whiteboard | **Must** | Picture prompts; alt text for screen readers |
| Text outline for screen readers, keyboard-only editing | rare (Excalidraw partial) | **Must** | Accessibility requirement; none of the tools above do this well |
| Lasso select, snap to grid, lock, z-order | Miro, tldraw | Should | Tidy sentence-building tables |
| Shape recognition (rough circle becomes a circle) | Jamboard, MS Whiteboard | Should (built, off by default) | Neater circled errors |
| Stickers / stamps (tick, cross, star) | Jamboard, Classroomscreen | Should (not yet built) | Quick feedback marks |
| Bold / underline text | Miro | Should | Marking stress and endings |
| Raise-hand button | Zoom | Should (not yet built) | Little needed one-to-one |
| Embedded video, handwriting-to-text, AI helpers | Miro, Lucidspark, MS Whiteboard | Later | Out of scope for this phase |
| Infinite canvas | Miro, tldraw | Later | An 8000 x 6000 board is enough and keeps stored data bounded |

Findings that shaped the design: every tool saves a picture-like or large JSON board, so we store **vector objects with delta-encoded points** (about 75 characters for a short stroke) and cap sizes; Jamboard's retirement is a reminder to keep **export** first-class (PNG, SVG, PDF); and no tool pairs a drawing canvas with a **text outline and keyboard path**, so those are built in.
