# Learning portal design research

Reviewed 2026-11-04. This is a pattern study, not an endorsement or an attempt to reproduce any product's branding or assets. The recommendations are adapted for a small, teacher-managed English-learning portal.

| Product | Observed pattern | What to adopt and why |
|---|---|---|
| [Duolingo](https://blog.duolingo.com/ways-to-practice-in-duolingo/) | A visible learning path combines new lessons with varied review, including practice based on mistakes. | Make the next useful activity obvious, show progress through a unit, and vary practice. Keep streaks supportive rather than punitive, and do not make a public leaderboard the default. |
| [Busuu](https://help.busuu.com/hc/en-us/articles/15936615354641-What-is-Busuu) | Short lessons cover reading, writing, listening, and speaking; courses are organized around CEFR levels. | Tag authored activities by level and skill, and make the learning path show balanced skill practice. |
| [Memrise](https://www.memrise.com/en-us/) | Video-led practice follows a hear, understand, and repeat progression, using natural speech. | Use that sequence in Clip Lab: listen first, make meaning visible, then offer a repeat/shadowing task. Keep video as an approved embed or licensed asset; do not copy it into the repository. |
| [Quizlet](https://quizlet.com/features/learn) | Flashcard sets can become varied, targeted practice based on what a learner finds difficult. | Build games from the existing teacher-authored vocabulary and question data, and let mistakes inform later review instead of creating duplicate content. |
| [Kahoot!](https://kahoot.com/schools/how-it-works/) | Timed live or self-paced quizzes provide immediate participation and teacher-facing reports; timers can be optional. | Offer speed rounds as one mode, not the only mode. Preserve untimed and keyboard-accessible play, and make class comparisons opt-in. |
| [LingQ](https://www.lingq.com/how-to-use-lingq/) | Learners interact with words in context, save hints, and revisit reading and audio. | Make transcript words selectable, save vocabulary to a personal deck, and connect reading with replayable audio. Keep excerpts and source metadata separate from hosted media. |
| [Khan Academy](https://www.khanacademy.org/khan-for-educators/indiacourse/xb6e0f5a42f01e035:get-started-with-khan-academy-eng/xb6e0f5a42f01e035:advanced-introduction-to-mastery-learning/a/using-khan-academy-s-mastery-progress-reports) | Mastery is built through sequenced skills, learner-paced practice, and teacher progress reports. | Show a learner-paced skill path and expose class-level mastery/weak-topic summaries to the teacher without exposing other students' records to students. |

## Design implications

- Prefer one clear next step, short sessions, and visible mastery over a dense dashboard of competing counters.
- Combine retrieval practice with varied input: text, audio, images, and approved video embeds.
- Keep timers optional; respect reduced motion, keyboard use, and learners who need more time.
- Keep streaks, rewards, and any class leaderboard encouraging and non-punitive. Leaderboards must be opt-in and class-only.
- Make the student's own progress private. Teacher analytics should use the existing teacher authorization boundary and must not weaken Firebase rules.
- Use patterns, not third-party illustrations, mascots, course text, video files, or other proprietary assets.
- Reuse the current JSON content shape where possible. New game, clip, or panel data must be additive, validated, and covered by tests before existing content is migrated.

## Clip sourcing boundary

Clip Lab should store source metadata and teacher-authored exercises, not downloaded film, television, anime, or cartoon files. A clip can use an official embeddable player with start/end times, or a teacher-supplied asset whose license permits this use. Initially proposed clips must be checked for topic and learner-level fit, embed availability, and reuse/embedding terms before they are added. Source URLs and timestamps remain editable by the teacher.

## Phase 1 research: lesson, dashboard and homework

Written from general knowledge of how these products behave, not from copied assets or text. Each entry lists what we adopt, what we avoid, and why it suits **one-to-one and small-group tutoring** where a teacher is usually watching the same screen.

| Product | Adopt | Avoid | Why it fits |
| --- | --- | --- | --- |
| **Duolingo** | A single focused activity per screen with a slim progress bar; a bottom *feedback sheet* that names the right answer and the reason after every check. | Hearts that block progress and streak-loss guilt. | A tutor wants steady flow, not punishment; a wrong answer should become a teaching moment the teacher can discuss. |
| **Busuu** | A visible learning path with a clear "you are here" and a finish-line summary; short review prompts at the end. | Upsell banners inside the lesson. | The nine stages already form a path; students should always know what is next. |
| **Kahoot** | Bold, high-contrast answer buttons with large touch targets and shapes/icons as well as colour. | Countdown pressure on every question and public ranking by speed. | Shape + label feedback helps colour-blind learners; speed pressure hurts anxious learners (the timer arrives only in the final test, Phase 2). |
| **Quizlet** | Flashcards with an obvious flip, a hear-it button and a "still learning / got it" split. | Auto-advancing cards that move before the learner is ready. | Vocabulary is stage 1 of every lesson; the student controls the pace while the teacher sees the review flags. |
| **LingQ / Language Reactor** | Reader mode: comfortable measure, adjustable size, click-to-save words, side panel for saved words. | Dense, tiny popups that cover the text. | The reading stage is the longest text on screen; readability settings matter more than ornament. |
| **Webtoon** | Vertical, full-width panels with generous spacing; progress shown by position. | Autoplay and endless scroll into unrelated content. | Reused later for the manga reader; keeps attention on one chapter. |
| **Khan Academy** | Mastery language ("practising → familiar → mastered") instead of raw percentages. | Locking later skills behind rigid mastery gates. | Gentle states (locked / current / done / mastered) motivate without blocking a teacher who wants to jump ahead. |
| **Google Classroom / Teams for Education** | Teacher "stream" thinking: a top strip with what needs attention today, then per-student detail. | Deep nesting of assignment pages. | A teacher mid-lesson needs "who is stuck" in one glance, not five clicks. |
| **Zoom** | Persistent control bar with clear state (live, muted) and a destructive action that always asks first. | Hidden controls that appear only on hover. | Teacher commands (go to stage, reset) must be reachable and unmistakable, and resets must confirm. |
| **tldraw / Miro** | Compact vertical toolbar with grouped tools and tooltips; the canvas gets the space. | Floating palettes that cover the work. | Reserved now for the Phase 4 whiteboard: the lesson layout keeps a right drawer that a toolbar can reuse. |

### Decisions

1. **One calm palette, tokens only.** Brand, success, warning, danger and neutral scales exist in light and dark (documented with contrast ratios in `docs/DESIGN_TOKENS.md`). Page CSS may not contain hex colours.
2. **Feedback is never colour alone.** Every correct/incorrect state carries an icon *and* words ("Correct", "Not quite"), and the feedback sheet states the right answer and a short reason.
3. **Calm mode.** `prefers-reduced-motion` disables confetti, pulses and bounces; a "Calm mode" reading preference also removes decorative motion and raises spacing.
4. **Reading comfort.** Reading text uses a 62-70ch measure, 18-20px base size, adjustable size and line spacing, and an optional dyslexia-friendly mode (wider spacing, system sans-serif, no justified text). Preferences persist per device.
5. **Teacher density.** The dashboard prioritises scanning: a Today strip, status dots (online / idle / stuck), and a command panel with 44px targets; destructive actions confirm and, where the data model allows, offer undo.
6. **Fonts.** No third-party font requests. The UI uses a rounded-friendly system stack (`ui-rounded`, then Segoe UI/Inter-like system faces) for the interface and a serif system stack for long reading text. This removes the Google Fonts dependency and its CSP allowance without shipping font files that would need licence review; self-hosted woff2 files can replace the stack later by changing two tokens.
