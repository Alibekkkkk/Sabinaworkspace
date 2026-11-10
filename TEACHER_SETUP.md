# Teacher dashboard setup

The site files in this folder share the existing Firebase project, `sabina-s-workspace`. Keep `dashboard.html`, `portal.html`, `lesson.html`, `lesson_gaziz.html`, and `homework.html` together on the same website host so the teacher links, student portal, classwork, and separate homework pages work together.

## Turn on teacher sign-in

1. In Firebase Console, open the `sabina-s-workspace` project.
2. Open **Authentication** and click **Get started** if Firebase offers it. Then go to **Authentication → Sign-in method** and enable **Google** and **Email/Password**. The dashboard accepts either method for any account that has been marked as a teacher (next step).
3. Mark each teacher account as an admin. Under **Authentication → Users**, make sure the account exists and copy its **User UID**. Then open **Realtime Database → Data** and add a boolean `true` at `/admins/<UID>`. There is no e-mail allowlist in the code or the rules any more; the `/admins` record is the single source of teacher identity, and browsers cannot write to it. If an account is Google-only, use **Continue with Google** on the dashboard. For an email/password account, use the email and password form.
4. Under **Authentication → Settings → Authorized domains**, ensure `alibekkkkk.github.io` is listed. Add it if needed so Google sign-in works on the published site.
5. Go to **Realtime Database → Rules**, replace the current rules with the contents of [`database.rules.json`](database.rules.json), and click **Publish**. The rules let students continue reading the curriculum and using code-based lessons, while only accounts listed under `/admins` can edit curriculum or existing student records. New student codes can still be registered by the portal.

## Put the changes on the website

Upload the changed HTML files, including the new `homework.html`, and `database.rules.json` to the folder used by the current website host. Do not create a second site. If you want to preview the pages on this computer first, open PowerShell in this folder and run:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/dashboard.html`. If Firebase blocks sign-in locally, add `localhost` under **Authentication → Settings → Authorized domains**. Stop the preview server with Ctrl+C.

The site includes a PWA shell for install and offline navigation. It caches only the public app pages and static files. Student sign-in, protected lessons, and progress require a connection and are deliberately not cached; use an HTTPS host for installation.

## Assign the Sustainable Cities homework

The first class topic is **Sustainable Cities**. Gaziz’s homework uses a separate Rivergate case, a different common-word set, and 16 questions. Sabina’s homework follows the same topic and key classwork facts, with a separate 16-question set using different response formats. Both practise present perfect and past simple in active voice.

Sign in to the teacher dashboard, open **Lessons**, then click **Assign Gaziz homework** and **Assign Sabina homework** when you want to assign each one. Each button also shares the Sustainable Cities classwork with that student. The buttons find the existing students by name and add separate homework cards to their portals, due before the next class. Students can resume saved answers; completion and score appear in the student portal and teacher dashboard. If a student is missing, add them first.

## Edit classwork and add vocabulary pictures

On the teacher dashboard’s **Lessons** tab, choose **Open lesson**. The lesson opens in teacher preview when the page is opened with one of the approved accounts. It does not attach to the student’s live session. In the vocabulary section, click a card and use **Custom image** beside **Listen** and **Reveal**. Paste a public `https://` image URL; leave it blank to remove the custom image. Students see the saved image on the card.

In Gaziz’s Sustainable Cities lesson, teacher preview adds **Edit question** controls to the reading, comprehension, grammar, and sentence questions. Update the wording, options, answer key, or explanation in the prompts; these edits are saved to Firebase and appear for students. Use the visible Homework link nested under Lesson 1 in the classwork sidebar to open the assigned separate homework page. Homework pages have a **Light theme** / **Dark theme** toggle.

The dashboard’s **Reset student progress** clears the saved score, stages, notes, and activity feed. The dashboard’s **Undo** can restore the reset if it is the most recent teacher change.

On a selected student’s dashboard, use **Generate summary** to create a seven-day report from saved practice attempts, homework status, current weak topics, and recent student activity. The report remains in the teacher dashboard until you download it as a text file. Review it before sharing; it contains student-specific information. Reports are not sent automatically and do not create a parent account.

The portal offers an informal 12-question level check before sign-in. It does not save responses, certify a CEFR level, or change assignments; use it only as a conversation starter and assess students directly before changing their learning path.

## Practice games

The Practice page builds game variations from protected classwork data:

- `matchData` entries (`word`, `meaning`) power matching, memory cards, vocabulary crosswords and word searches, flashcards, hangman, word scramble, dictation and pronunciation practice. Crossword words use alphabetic entries of 3–12 letters; word-search words use 3–12 letters, and both are capped at eight entries.
- `testMcq` entries (`q`, `options`, `correct`) power timed quizzes and unit boss rounds.
- `testComplete` entries (`p` or `prompt`, `a` or `answer`) power gap-fill.
- `sbPp` and `sbPs` groups with `prompt` and `correct` word arrays power sentence building.
- Optional `storyChoices` entries use `scene`, `choices`, and `correctChoice` for story-choice practice.

Keep answers in the protected classwork workflow. Static `content/*.json` files are public on the website until the security migration's removal checks pass. The current reader supports up to ten items per generated round (eight memory pairs). Crosswords and word searches are generated from the existing vocabulary; they do not need a separate schema.

Practice, Clip Lab, and Manga Reader share a saved light/dark preference. Their theme controls work with keyboard input and follow the system preference until the learner selects a theme.

## Listening trainer (dictation)

1. Open `tools/import-content.html` and use **Listening pack helper**: paste one sentence per line (your own sentences, up to 25 words), list the lesson target words, and press *Pick gaps and preview*. Copy the JSON into `content/listening/<pack>.json`. Add `"translation": {"ru": "...", "kk": "..."}` per sentence if you want the translation line.
2. Run `npm run lint:listening`. It checks ids, gap indices, the 25-word limit, credits (must start with "original", "CC0", "CC BY" or "public domain") and that audio files exist.
3. Add `"listeningFile": "listening/<pack>.json"` to the student's entry in `content/manifest.json`. The portal then shows a "Listening" link and the lesson's Vocabulary stage a "Listen & type" button.
4. A pack with `"status": "draft"` is hidden from students ("waiting for your teacher's approval"). Open `listening.html?code=<CODE>&lesson=<lesson>&preview=1` to try it, then change the status to `"approved"`. Note that the sentences are public static files (they are practice, not graded answers).
5. **Voice.** Without audio files the page uses the device's British voice and says so on screen (quality depends on the device). For a consistent neural voice, set `TTS_PROVIDER` (`azure`, `google` or `elevenlabs`), `TTS_KEY` (and `TTS_REGION` for Azure) in your shell or an untracked `.env`, then run `node scripts/generate-listening-audio.mjs content/listening/<pack>.json`. It writes normal and slow mp3 files to `content/audio/`, estimated word timings (flagged) and the provider terms in `audioCredits`. Keys are never read from files in the repository. Check your provider's terms before publishing the audio.
6. **Speaking practice** uses the browser's speech recognition, which may send audio to the browser company. The student sees a plain-language consent first; this app never records or stores audio or the transcript, and "Type instead" is always available. Mention it to parents of younger students.

## Author and update Clip Lab content

Clip Lab uses official YouTube embeds. Do not download or host copyrighted video or manga files. Use short segments (10–60 seconds), record the official video ID and attribution, and use only teacher-created study text unless you have checked a short transcript excerpt and its timestamps against the source. The supplied examples clearly label their teacher-created text; they are not verbatim video captions.

1. Open `tools/import-content.html` while signed in as an approved teacher.
2. Paste a clip JSON draft into **Create or update a Clip Lab draft**, then validate and download it to `content/clips/`. The JSON contains source metadata, level/tags, study text, vocabulary, and question prompts; keep correct answers out of this public static file.
3. Add or update the matching `clipFile` and `clipId` fields in `content/manifest.json`. Keep the clip ID stable when changing its video link so existing student lesson links continue to work.
4. Enter the private answer map in the format `{"clip-id":{"exercise-id":"correct answer"}}`. Use **Import content** for an additive first import. For later video/text/answer changes, use **Save Clip Lab changes** and confirm the explicit replacement. It updates only protected clip records, not classwork, homework, or assignments.
5. From the student portal, open **Clip Lab** for an assigned lesson and verify the player, translations, vocabulary save, exercises, and progress before sharing it with a class.

Clip drafts in `content/clips/` and the manifest are public on a static host. They must not include answer keys or student information. See [Security and privacy](docs/SECURITY.md) before deploying or removing any content files.

## Author and update the Gaziz Manga Reader

The pilot is enabled only for Gaziz by `features.mangaReader` in the `gaziz` entry in `content/manifest.json`. The sample story uses original SVG panel art in `assets/manga/`; do not add copyrighted manga/manhwa scans. Use public-domain, openly licensed, teacher-created or original panels, and record any license/attribution before publishing.

Create a draft in the Manga Reader section of `tools/import-content.html`. Panel data must use local SVG paths, alt text, bubble text, simplified explanations, vocabulary, and chapter checks. Download the JSON into `content/manga/`, set its `mangaFile` and `mangaId` in the matching manifest entry, and provide answers only in the separate private Manga answer-key field. Use **Import content** for first-time import and **Save Manga Reader changes** for an explicit protected-content replacement. The portal displays the reader only when the student's assigned curriculum view has the manga feature flag; other students do not receive the link.

The sample is tagged A2 for its short sentences, but `content/gaziz.json` has no explicit CEFR field. Review the story difficulty with Gaziz before treating that tag as an individually assessed placement.


## Whiteboard (teacher)

- In the dashboard, open a student: the **Whiteboard** card shows live pictures of their class board and their own board (read only). **Give control** lets the student draw on the class board; **Take control** returns it to watch-only. The drop-down also has **Hidden from the student** for preparing a board in private.
- The student always sees the board only for the lessons they are assigned. Students can only change what they drew themselves; you can change or erase anything and clear a page.
- Stopping the lesson clock saves a picture of every page of the class board for that student (they find it under **Snapshots from your teacher**). **Save as, Send snapshot to student** does the same at any time.
- Students cannot add pages to the class board; you can. Each student also has a private board that only they and you can read.
- Deploy: the new database rules (`whiteboards`) must be published with the rest of `database.rules.json`.

## Switch features on or off for a student (Phase 7 and later)

On the dashboard, select a student and use the **Feature flags** card: Manga reader (off until you switch it on), Clip Lab, Whiteboard and Listening trainer. A student without a feature sees a friendly "not switched on" page, and for manga the database also refuses the story. **Use default** removes your override. Screenshot: `docs/screenshots/phase7/teacher-manga-card.png`.

## Manga Reader (current format, replaces the older notes above)

Stories use the version 2 format (`docs/MANGA.md`): pages with panel and bubble boxes, credits and rights, questions, boss and retell. Make one without writing JSON in `tools/import-content.html` > **Make a manga draft**: write a script or CSV and press **Turn it into a draft** (the **Show an example script** button fills a complete example), then draw panel and bubble boxes on each page image (or type their numbers), **Put this page in the draft**, **Validate manga draft**, download to `content/manga/`, add the answer keys (JSON keyed by story id, see `docs/manga/gaziz-demo.answers.json`) and use **Import content**. Page images go in `assets/manga/` (local files only, each under 250 kB, run `npm run check:manga`). Use only original art or openly licensed work with its licence and address in the credits; never scans. Assign a chapter with a due date from the dashboard **Manga Reader** card. Written answers and retells arrive in the review queue.

## Run a class

1. Open the student's lesson link (`lesson.html?code=<CODE>&lesson=<ID>`) with them; from the dashboard, select the student.
2. **Lesson clock** card: Start, Pause, Resume, Stop (the student sees the same time; the saved duration goes to the history, weekly summary and CSV). Sections show planned, actual and remaining time.
3. **Send command to student** moves them to a stage or resets progress; **Lesson game mode** sets how game-like the lesson is.
4. **Whiteboard** card: choose view, draw or teacher-only mode and open their board; stopping the clock saves a snapshot.
5. Written answers the student sends appear in the review queue; level check results and the weekly summary are on the same page.

## Assign with a schedule and read reports

Give a lesson or homework an available-from, due and closing time in the schedule list (and **duplicate to next week**); students see "Due in 2 days", "Overdue" or "Locked until…" and the database refuses locked content early. Run **Import content** after changing dates. Reports: **Practice games and weak topics**, **Games & mastery**, **Clip Lab**, **Manga Reader** and **Listening practice** cards, plus the weekly summary download.

## Student data: export and delete

Dashboard > student > **Student data and privacy**: **Download all data (JSON)** for a copy, or type the student's code and **Delete all data**. It cannot be undone. What is stored and for how long: `docs/PRIVACY.md`.

## Errors a student's browser reported

The **Recent errors** card lists the codes students see on screen ("Something went wrong. Code: E-XXXXXX"). Ask a student for the code, find it here, then **Clear these reports** when done.

## Languages

Students can switch the shared interface between English, Russian and Kazakh (a picker next to the theme button). The Russian and Kazakh text is a machine-made draft in `locales/ru.json` and `locales/kk.json`: have a native speaker check it. Most page text is still English.

## Backups and restore

Firebase does not give you a one-click restore for the Realtime Database by default. Before changing rules or importing content: in the Firebase console open **Realtime Database > Data > ⋮ > Export JSON** and keep the file; save the current rules text too. To restore, **Import JSON** at the node you exported (use a specific path, not the root, so you do not overwrite newer data), and paste the saved rules back. The repository holds the content files (`content/`), so protected content can be re-imported with **Import content**. Student progress exists only in the database, so a regular export is the only backup of it.

## Before the first deployment

Read `docs/SECURITY.md` (runbook, headers, offline and protected content) and `docs/KNOWN-LIMITATIONS.md`. Nothing is deployed from this repository automatically.

## Lesson sections and grammar topics

Every classwork lesson shows Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I, II, III … and Test Your Knowledge. The grammar sections are the `grammar` list at the top of the lesson file in `content/`: each entry has an `id`, a `title` (the section is called "Grammar II: <title>"), a `rule` (`formula` plus a few `points`, where `<b>` is allowed), a one-line `lead`, and the `exercises` it uses (keys such as `g6` for complete-the-sentence or `sbPp` for sentence builder). Add, remove or reorder entries to change the grammar sections for that student, run `npm run lint:content`, then **Import content** so the student gets the new version.

In the lesson, click a section card at the top (teacher preview) to time that section, and use the **Whiteboard** button to draw beside any section. Games and Listening Training open inside the lesson; in your preview they are read-only.
