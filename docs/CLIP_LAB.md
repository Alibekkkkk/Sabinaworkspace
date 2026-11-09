# Clip Lab: learning English from video, legally

Clip Lab plays a short moment from a video that someone else published, and teaches from it with **text you write**. It never downloads, copies, re-hosts or records video, and it never imports captions.

## The rules (non-negotiable)
1. **Play only what you may play.** Allowed sources, recorded in the clip's `source.rights`:
   - `official-embed`: the owner's own channel allows embedding (YouTube's embed player). Prefer the studio's, broadcaster's or organisation's official channel, trailers and official clips.
   - `owned`: your own video.
   - `CC-BY` or `public-domain`: openly licensed video (Wikimedia Commons, Internet Archive public domain, Creative Commons). A `licence` field with the licence name and URL is **required**, and `source.attribution` must credit the author.
2. **Never copy captions or lyrics.** `transcriptType` says what the text is:
   - `original` (best): your own paraphrase or summary of the scene, written for learners.
   - `excerpt`: a short quotation used for teaching (a line or two, not the scene).
   - `licensed`: text you may copy under a licence you can show.
   The validator rejects `verbatim-captions` unless a licence field is present.
3. **If it cannot be embedded, link out.** Use `source.provider: "link"` with the address and a `where` note such as "Scene at 12:30 to 13:10 on the studio's channel". Write your questions around the scene; the learner opens the video themselves. The page shows an "Open the video" link for every clip.
4. **Privacy.** The player uses `youtube-nocookie.com`, never autoplays, and loads only after the learner presses Load video.
5. **Check before you share.** Re-check the rights every year (the validator warns after 12 months), and when YouTube says a video cannot be played, replace it.

## Choosing a clip
10 to 90 seconds, clear speech, one idea, level-appropriate. For anime, cartoons, films and series use the official trailer or clip on the rights holder's channel; if there is none, use a link-out clip. Check the video's title and channel with `npm run check:clips` (asks YouTube whether it exists and may be embedded, and compares the channel and title).

## Writing a legal exercise
Write the study text yourself (8 or more lines for a 60 second clip), stamp each line's start and end while the video plays, then let the maker suggest exercises from your lines. Never put the original script in the transcript. Questions that need an answer key (gist, order the lines, grammar spotter) keep their key in a separate private file; the others are worked out from your lines.

## Making a clip without code
Open `tools/import-content.html`, section "Make a Clip Lab clip":
1. Paste the video address and press **Look up the video** (channel and title are filled in; YouTube says no if embedding is off).
2. In the embedded player find the scene; press **Mark start here** and **Mark end here**.
3. For each line: type it, press **Stamp start now** when it begins and **Stamp end now and add the line** when it finishes. Times can be edited in the table; problems are listed in words.
4. Add vocabulary and one gist question, tick "I watched the clip and the line times match", press **Check the clip**, then **Download**.
5. Put the clip in `content/clips/`, add `clipFile` and `clipId` to the student's manifest entry, and import with the private answer keys as before (TEACHER_SETUP.md).

## Format (schema version 2)
`schemaVersion, id, title, level (A1 to C2), genre[], grammarPoints[], source{provider, videoId|url, channel, videoTitle, rights, licence?, attribution, sourceUrl, reviewedAt}, startSeconds, endSeconds, transcriptType, transcriptNote, timingVerified, transcript[{id, start, end, text, translation?, speaker?}], vocabulary[{word, meaning, translation?, example?, lineId?}], exercises[]`.
Line times must sit inside the window and not overlap; every exercise must point at real line ids. Version 1 clips still work and are upgraded in memory.

Exercise types: `before-watch`, `gist`, `line-gap`, `dictation`, `order-lines`, `who-said`, `shadowing` (coaching only, never marked), `grammar-spotter`, `production` (sent to the teacher's review queue). A full example: `docs/clips/sample-clip.json` and its answer keys.

## What `timingVerified` means
`false` (the default for every clip until a person checks): the learner sees the study text and the activities, but lines are not highlighted or loopable and "play this line" uses the device voice, because wrong timing teaches the wrong thing. `true` only when the teacher watched the clip and the stamped times match.

## For students and for scheduling
- **Clips tab:** the Clips item in the bottom bar opens `clips.html`: every clip assigned through a lesson, with level, kind of video and grammar filters, a To do / Done switch, due dates, and stars earned. A clip that opens later is listed under "Coming up" with its lock date and no start button.
- **Assigning and scheduling:** a clip is attached to a lesson (`clipFile` and `clipId` in the manifest), so the usual schedule applies: available from, due and closes dates set on the lesson in the dashboard.
- **In the lesson:** a lesson that has a clip offers "Open the clip" on its vocabulary and first grammar stages; the clip page has a "Back to the lesson" link.
- **Results for the teacher:** the dashboard card "Clip Lab" shows, per clip, finished or not, stars and score, attempts, time on the clip (seconds with the page in view), the words saved from it, and the transcript lines the student found hard. The record is `studentProgress/<code>/clips/<clipId>`.
