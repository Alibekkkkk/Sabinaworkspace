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

## Phase 9: done (2026-11-10)
- **Sections:** every classwork lesson lists Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N and Test Your Knowledge (content schema v3, `js/lesson-plan.js`). Close Reading is gone.
- **Grammar:** the grammar sections come from each lesson's `grammar` list, named after the topic: Sabina has three, Araylim 1 has five. The per-student titles hard-coded in the lesson page are removed; they had been wrong for Araylim 2 and George.
- **Games and Listening Training** run inside the lesson. In the teacher preview they are read-only, and a finished round marks the section done.
- **Whiteboard:** a labelled **Whiteboard** button on every section.
- **Clock:** cards for Vocabulary, Reading, Games, Listening, Grammar and Test.
- **Dashboard:** section names in the student list and the "send to section" buttons.
- **Rules:** sections up to 40.
- **Old imports:** lessons imported before v3 take their grammar topics from the published lesson file, so names are right before re-importing.
- **Security:** old content snapshots, which held earlier answer keys, are no longer published.
- **Tests:** browser test `scripts/lesson-sections-e2e.mjs`.
- **Known gaps for Phase 10:**
  - Only Sabina has a listening set, and it is still a draft.
  - The linter flags reading passages that miss target words or the grammar structure (Sabina: 18 words and no present perfect; Gaziz: 13 words).
  - Gaziz's "Local volunteers ___ (clean) the riverbank every spring" expects "have cleaned".
- Still flaky, as before, for Phase 13: `whiteboard-devices-e2e` (stylus/palm, pressure).

## Phase 10: done (2026-11-10)
- **All seven lessons reviewed and fixed:** see [CONTENT_REVIEW.md](CONTENT_REVIEW.md), "Phase 10".
- **Biggest fixes:**
  - Sabina's test asked about events her reading never mentioned.
  - Araylim 2's lesson was half-size.
  - Two of Gaziz's answer keys were wrong.
  - Inline styles that production ignores have been removed.
- **Listening:** every student has an approved listening set.
- **New checker:** `npm run review:content`, enforced by `tests/content-review.test.mjs`.
- **Deployed and imported** into the six live lessons (2026-11-10).
- **Phase 13:** the import tool cannot update an existing lesson copy; add an update button.
- **Flaky, for Phase 13:** `listening-e2e` still sometimes misses the auto-advance to the next gap.

## Phase 11: done (2026-11-10)
- **Tool:** `tools/listening-recording.html`, linked from the dashboard as 🎧 Listening from audio.
  - Paste an audio link (Drive, Dropbox and OneDrive share links are converted; YouTube is refused with a reason).
  - Or choose the file, or paste a transcript.
  - Whisper (Transformers.js 3.0.2, tiny.en or base.en) transcribes in the browser. The sentences come with start and end times, and you edit them, play each one, then save.
- **Storage:** sets are saved to `protectedContent/<lesson>/listening`. Rules: teacher writes, that lesson's students read. Students get them at once, with no deploy.
- **Student side:** the listening page prefers this set to the lesson's file set, and the portal link appears for it. Each sentence plays its own stretch of the real recording; Slow plays it at 75%.
- **Checked:**
  - in the browser with the public-domain JFK clip from OpenAI's Whisper repository: about 10 s to transcribe 11 s, then one sentence with its times;
  - unit tests in `tests/listening-recording.test.mjs`;
  - a rules test;
  - the browser test `scripts/listening-recording-e2e.mjs`: link, transcript, edit, save, the student hears "Recording", remove.
- **Limits:**
  - The first use downloads the model (40 or 80 MB).
  - A link must allow reading from other sites for transcription; otherwise the teacher chooses the file.
  - Servers that cannot seek play from the start.
  - Transcripts of unclear speech need correcting by hand.

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
