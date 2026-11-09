# Phase 6 report: Clip Lab (first part)

Branch `araylim-4-academic`, nothing pushed or deployed. Rules and how to make a clip: [CLIP_LAB.md](CLIP_LAB.md). Verification of the shipped clips: [CLIP_REPORT.md](CLIP_REPORT.md). Screenshots: `docs/screenshots/phase6/`.

## What was built
- **Verification script** `npm run check:clips` (oEmbed existence, embeddability, channel and title match; no network means "unverified", never "fine"). All 7 shipped clips: exist, embeddable, channel and title match.
- **Schema v2** (`js/clips/schema-v2.js`): source rights (official embed, owned, CC-BY, public domain, link-out), original/excerpt/licensed transcripts (`verbatim-captions` refused without a licence), 10 to 90 second windows, line times inside the window and not overlapping, vocabulary, nine exercise types, warnings for old reviews, thin transcripts and few exercise types. Version 1 clips still validate and import; the seven shipped files were migrated (`scripts/migrate-clips.mjs`) and are flagged `timingVerified: false`.
- **Player** (`js/clips/player.js`): official IFrame API on the privacy domain, no autoplay, play/pause, previous/next line, loop a line, speeds 0.5/0.75/1, stops at the end of the window, 4 Hz line tracking, plain messages for blocked, removed or refused videos. The page CSP now allows the player script (it was blocked before, so the old page never got the API).
- **Interactive transcript** (`js/pages/clip.js`): active line highlighted, click a time to seek, EN / translation / reveal-as-you-go / hidden modes, clickable vocabulary with Save word, keys (Space, arrows, L), video left and transcript right on desktop, pinned player on phones. If the video cannot play, the transcript and activities still work and "Open the video" is always shown.
- **Nine exercise types**, graded with the shared grader: before you watch, gist, gap fill on a line, dictation of a line (the video line loops, or the device voice when timing is unchecked), order the lines (Move up/down buttons, no drag-only), who said it, shadowing (Phase 3 consent and coaching, never marked), grammar spotter, and written production sent to the teacher's review queue. Results give XP, stars ("scene mastered"), and misses go to spaced review.
- **Clip maker** in `tools/import-content.html`: paste a link, look up channel and title, mark start and end on the embedded player, stamp lines while it plays, live timing checks, suggested exercises from the lines, validated download with the private answer keys in a separate file.

## Evidence
| Item | Result |
|---|---|
| `npm test` | ✅ 312 pass (28 new: validator good/bad fixtures, line-time and sync maths, player with a fake YouTube player, exercise grading, authoring helpers, migration, old-format compatibility) |
| `npm run check:clips` | ✅ 7 of 7 exist, embeddable, channel and title match (run here with network) |
| `npm run test:clips-e2e` (run twice, both green) | ✅ with a fake player: highlight follows time, Space/arrows/L, loop, speed, end-of-window stop, subtitle modes, word saving, all nine exercise types, review queue, XP and stars; failure paths (owner blocks the video, player script blocked, unverified clip); the clip maker end to end (lookup, mark window, stamp eight lines, overlap flagged, download valid v2 clip with no answers in it); axe clean; 390 px layout; no console errors |

## Not done / honest limits
- ❌ **None of the real videos was watched**, and no real YouTube player ran in the tests (a fake player was used). So no clip's line timing or window is verified, the shipped clips have one line and fewer than 4 exercise types, and the acceptance rule "at least 8 verified lines or hidden from students" is **not met**: they are shown in text-and-activity mode (the owner's decision, 2026-11-09, see CLIP_REPORT.md).
- ❌ Step 5 integration is not built: portal Clips tab with filters, embedding a clip in the lesson, assigning a clip with a due date, the lesson clock counting clip time, dashboard clip completion and weak lines, collectible clips and clip streaks.
- ❌ "Student cannot read answers before submitting" is not true by design: an assigned student receives the protected clip including answer keys (as before). Only the public repo file is answer-free. Server-side grading would need a different design.
- ❌ `sw.js` caches the clip pages and scripts but not clip JSON, because clips come from the protected database, not static files.
- ❌ Vimeo is not supported (YouTube embeds and link-outs only). Real microphone coaching and real device speech were not tested. Link-out clips (`provider: link`) validate and show "Open the video" but were not driven in a browser.

## Decisions needed
1. ~~Hide unverified clips from students?~~ Decided: keep them visible in text-and-activity mode (see CLIP_REPORT.md).
2. Who watches and stamps the seven clips (about 8 lines each with the clip maker)?
3. Should the portal Clips tab and dashboard completion come next, or the Manga reader (Phase 7)?
