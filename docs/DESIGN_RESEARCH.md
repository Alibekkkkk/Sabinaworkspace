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
