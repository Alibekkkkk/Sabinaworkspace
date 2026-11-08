# PHASE 6 — Clip Lab: learn English from video (P3)

## Goal
Short video moments from cartoons, anime, films, series and documentaries used as interactive English lessons — legally and reliably.

## Current state (verify)
`clip.html`, `js/clips/schema.js` (`validateClip`, `addProtectedClipAnswers`, `clipEmbedUrl`), 7 files in `content/clips/` each with a YouTube `videoId`, `startSeconds/endSeconds`, and **a single transcript line** with a note that its timing is unverified; exercise structure minimal; `protectedContent/.../clip` is served via rules; manifest links `clipFile`/`clipId` per student. YouTube IFrame API is loaded from `https://www.youtube.com/iframe_api` (CSP entry needed).

## Legal and safety design (non-negotiable)
- Never download, re-host, rip, or screen-record video. Never paste verbatim captions or lyrics. Use only: official embeddable players (YouTube/Vimeo with embedding allowed), content the teacher owns, or openly licensed/public-domain video (Wikimedia Commons, Internet Archive PD, Creative Commons — record licence + attribution).
- Transcripts are **original teacher-style paraphrase/summary or short fair-use excerpts** used for teaching, clearly marked `transcriptType: "original" | "excerpt" | "licensed"`; the schema rejects `transcriptType: "verbatim-captions"` unless a `licence` field is present.
- For anime/cartoons/movies/series: prefer official trailers/clips on the studio's own channel, or write original comprehension tasks around a *link out* ("watch scene at 12:30–13:10 on <service>") when embedding isn't allowed. State this in the docs and UI ("Open the video").
- Document: `docs/CLIP_LAB.md` explaining copyright rules, how to choose a clip, and how to write a legal exercise.

## Step 1 — Verify and repair existing clips
For each of the 7 clip files: check the video exists, embedding is allowed (oEmbed endpoint returns 200; do this with a script `scripts/check-clips.mjs` — network access may be limited; if you cannot verify, mark `verified:false` and surface a teacher warning), the channel/title/attribution match the actual video, and the start/end window contains the described scene. Remove or replace any clip you cannot verify (ask me for replacements). Write results to `docs/CLIP_REPORT.md`.

## Step 2 — Schema v2 + authoring
```
{ schemaVersion: 2, id, title, level: "A2|B1|…", genre: ["anime","cartoon","film","series","documentary"],
  source: { provider, videoId|url, channel, videoTitle, rights: "official-embed|owned|CC-BY|public-domain", licence?, attribution, reviewedAt },
  startSeconds, endSeconds,                 // 10–90 s windows
  transcriptType, transcript: [ { id, start, end, text, translation?, speaker?, notes? } ],   // ≥ 8 lines for a 60 s clip
  vocabulary: [ { word, meaning, example, lineId } ], grammarPoints: [..], cultural: [..],
  exercises: [ …see Step 4… ] }
```
- Validator rules: line times inside window and monotonic; no overlaps; every exercise references existing line ids; `answers` kept in protected content only; `reviewedAt` within 12 months else warn.
- Authoring tool in `tools/import-content.html`: paste URL → fetch title/channel via oEmbed → set start/end by scrubbing the embedded player ("Mark start/end" buttons) → add lines while the video plays ("Tap to stamp time") → preview → export validated JSON.

## Step 3 — Player and interactive transcript
- YouTube IFrame API wrapper `js/clips/player.js` with: play/pause, seek, **loop current line**, speed 0.5/0.75/1, keyboard shortcuts (Space, ←/→ previous/next line, L loop), automatic stop at `endSeconds`, graceful failures (blocked/removed video → clear message, link-out, and lesson remains usable with the transcript).
- Interactive transcript: active line highlight synced to `getCurrentTime()` (≈ 4 Hz), click a line to seek, subtitle modes (EN / native / none / hidden-until-reveal), clickable words → definition popover from the clip vocabulary or lesson deck; "Save word" to deck/review queue.
- Layout: video left, transcript right on desktop; stacked on mobile with sticky mini-player.
- Privacy: use `youtube-nocookie.com`; no tracking; no autoplay with sound.

## Step 4 — Exercise types (all JSON-driven, graded with the shared grader)
1. **Before-you-watch**: predict from title/thumbnail words; vocabulary pre-teach.
2. **Gist**: 2–3 MCQ after first watch.
3. **Gap-fill on subtitles**: hide key words in the line; type while the line loops.
4. **What did they say?** (dictation of one line, reusing Phase 3 gap UI; audio from the video line loop).
5. **Order the lines**: drag shuffled lines to the correct sequence.
6. **Who said it?** (matching lines to speakers).
7. **Shadowing**: student repeats the line; optional speech recognition feedback (consent as in Phase 3).
8. **Grammar spotter**: tap all examples of the target structure in the transcript.
9. **After-you-watch production**: write/say 2–3 sentences; teacher-review queue.
Gamify: XP, "scene mastered" stars, collectible clips, streak.

## Step 5 — Integration
- Portal "Clips" tab with level/genre/grammar filters; lesson Vocabulary/Grammar sections can embed a clip; assignments/scheduling (Phase 0B); the Phase 2 clock counts time on the clip; dashboard shows clip completion, weak lines, saved words.
- `sw.js`: cache clip JSON (not video).

## Tests
Schema validator (good/bad fixtures), line-time alignment utilities, transcript-sync logic with a mocked player, exercise grading, rules tests for protected clip answers (student cannot read answers before submitting).

## Acceptance criteria
- Each shipped clip has ≥ 8 verified transcript lines (or is flagged and hidden from students), exercises of ≥ 4 types, and verified embeddability; failing videos degrade gracefully.
- I can add a new clip using the authoring tool without touching code.
- No verbatim caption copying; `docs/CLIP_LAB.md` explains the rules.

## Non-goals
No video hosting, downloading, or scraping; no automatic caption import.
