# Plan v2: the teacher's ten requests (2026-11-10)

Decisions taken: listening transcription runs **in the browser** (free, Whisper model on the teacher's computer); pictures are **original illustrations plus an open-licence icon set** (Lucide, MIT); the **whiteboard is a tool on every section**; bug fixes are deployed now, the rest in phases.

## Done and live (2026-11-10)
| # | Request | What changed |
| --- | --- | --- |
| 1 | Lesson not shown in the dashboard preview | The page policies blocked same-site frames. `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, `frame-src 'self'` in the header and the dashboard's own policy. Test: `tests/dashboard-frames.test.mjs`. |
| 2 | Section cards not clickable | The teacher clicks Vocabulary / Grammar / Reading to time that section. Checked in `clock-e2e.mjs`. |
| 4 | "Open in another tab" warning | Not shown in teacher previews (they do not save student work). Still shown to students. |
| 5 | Sabina's lesson stuck loading | Each step of the teacher preview is named and time-limited: after 20 s an error card names the step and offers Retry. The cause of the stall itself was not reproduced; the card will say where it stops if it happens again. |

After a deploy, an open site keeps the old version until the **"New version available → Reload"** banner is pressed or all its tabs are closed.

## Phases
**Phase 9: lesson structure (requests 3 and 6).**
- Fixed section order in every classwork: Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N, Test Your Knowledge. Close Reading is removed.
- Grammar sections come from the lesson content (`grammar: [{ topic, tasks }]`), one per topic, named after it ("Grammar I: Present Perfect"), so the count varies by student.
- Games and Listening Training open inside the lesson rather than on their own pages; their pages stay for practice outside class.
- Whiteboard: a toolbar button on every section opens it beside the content (shared with the student as today).
- Manga stays off by default and is switched on per student by the teacher.
- The section names come from the content, not one fixed list, so they always match. The lesson clock sections follow the same list.
- A migration script converts today's content (fixed slots `g6`, `g7`, `sbPp`, `sbPs`, `g10`) by topic.

**Phase 10: content review (request 8).** All seven students' classwork, homework, listening and clips:
- the grammar regrouped by topic;
- the answer keys, levels, typos and inline colour styles checked;
- weak items rewritten and missing listening sets added.

A per-student change list goes in `docs/CONTENT-REVIEW.md`, then the content is re-imported.

**Phase 11: listening from an audio link (request 7).**
- In the listening tool, paste a direct audio link (or choose a file).
- Whisper runs in the browser and returns sentences with times.
- The tool proposes easy, medium and hard gaps; the teacher edits and saves.
- Students hear each sentence from the recording itself.

Limits:
- Page links (YouTube, Google Drive) cannot be read by a browser. Only direct audio links whose server allows it, or a file.
- A file needs somewhere to be stored for students to play it. To be settled in the phase: Firebase Storage needs the paid plan, so the likely answer is a small audio folder published with the site.

**Phase 12: new interface (request 9).**
- First, two or three neon design directions as a page you can look at, and you pick one.
- Then new design tokens (dark neon by default, with a light theme) and the Lucide icons in place of emojis.
- Original illustrations for sections and topics.
- Applied to the portal, lesson, dashboard, practice, clips, manga and tools, with the visual checks at phone and desktop sizes.

**Phase 13: improvement sweep (request 10).**
- A full review pass, with fixes for what it finds.
- The three flaky browser scripts.
- A final list of everything changed, then a deploy.
