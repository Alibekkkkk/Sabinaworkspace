# Clip report: verification of the shipped clips

Checked on 2026-11-09 with `npm run check:clips` (YouTube's oEmbed endpoint; raw results in `docs/clip-check.json`).

| Clip | Video | Real channel | Real title | Exists and embeddable | Channel and title match the file |
|---|---|---|---|---|---|
| abay-gerund-infinitive | LfDWCcbIjDg | BBC Learning English | Gerund or infinitive? Ask BBC Learning English | yes (200) | yes |
| araylim-1-memory | TUoJc0NPajQ | BBC Earth Science | How does your memory work? \| Head Squeeze | yes (200) | yes |
| araylim-2-space-tourism | I69Cz4zJJes | NASA | The Second All-Private Astronaut Mission to the Space Station on This Week @NASA, May 26, 2023 | yes (200) | yes (the file shortens the title) |
| araylim-3-ai | q6VDPqRQo90 | Learn With NASA | From Earth to Mars: How NASA Uses AI | yes (200) | yes |
| gaziz-sustainable-development | 7V8oFI4GYMY | FN-sambandet Norge | What is sustainable development? | yes (200) | yes |
| george-daily-routines | yaLiJwRIe1Q | My English Center Online | Present simple - Daily Routine Verbs - English ESL | yes (200) | yes |
| sabina-floods | 4PXj7bOD7IY | National Geographic | Floods 101 \| National Geographic | yes (200) | yes |

## What the check cannot tell
- A 200 from oEmbed means the video exists and the owner allows embedding (YouTube answers 401 when embedding is switched off). It does not prove the player will work on every network or in every country.
- **Nobody can check from here that the start and end times contain the scene the text describes, or that the lines are timed right.** All seven clips have one practice line and a placeholder window of 0 to 30 seconds. They are therefore migrated to schema v2 with `timingVerified: false`.

## Result for each clip, and what it means for students
- All seven stay **available to students in text-and-activity mode**: study text, vocabulary and activities work, but the lines are not highlighted or loopable and the page tells the learner the teacher is still checking the timing. The brief asks for clips with fewer than 8 verified lines to be hidden; they were **not hidden** so students do not lose the feature, and that is a decision for the teacher (below).
- None has 8 transcript lines or four kinds of exercise yet. Use the clip maker to watch each one, stamp at least 8 lines and tick "timing matches".
- Rights: all are on the rights holder's own channel (BBC Learning English, BBC Earth Science, NASA, Learn With NASA, FN-sambandet Norge, National Geographic) or an English-teaching channel (My English Center Online) as official embeds. Whether each channel's terms allow classroom embedding beyond the embed switch was not assessed.

## Decision (2026-11-09)
The owner chose to **keep the seven clips visible** to students in text-and-activity mode until a teacher has stamped and verified each one. Nothing is hidden; each clip shows the plain "your teacher is still checking the timing" notice. A clip leaves this mode when its file has `timingVerified: true`, which the clip maker sets only when the teacher ticks "I watched the clip and the line times match".
