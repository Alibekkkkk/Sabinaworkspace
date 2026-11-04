# Teacher dashboard setup

The site files in this folder share the existing Firebase project, `sabina-s-workspace`. Keep `dashboard.html`, `portal.html`, `lesson.html`, `lesson_gaziz.html`, and `homework.html` together on the same website host so the teacher links, student portal, classwork, and separate homework pages work together.

## Turn on teacher sign-in

1. In Firebase Console, open the `sabina-s-workspace` project.
2. Open **Authentication** and click **Get started** if Firebase offers it. Then go to **Authentication → Sign-in method** and enable **Google** and **Email/Password**. The dashboard accepts either method for these three addresses:
   - `alibek.alpysbayev@gmail.com`
   - `alibek.alpysbayev@nu.edu.kz`
   - `aalpysbayev2@gmail.com`
3. Under **Authentication → Users**, make sure those accounts exist. If an account is Google-only, use **Continue with Google** on the dashboard. For an email/password account, use the email and password form.
4. Under **Authentication → Settings → Authorized domains**, ensure `alibekkkkk.github.io` is listed. Add it if needed so Google sign-in works on the published site.
5. Go to **Realtime Database → Rules**, replace the current rules with the contents of [`database.rules.json`](database.rules.json), and click **Publish**. The rules let students continue reading the curriculum and using code-based lessons, while only those three authenticated teacher emails can edit curriculum or existing student records. New student codes can still be registered by the portal.

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

## Practice games

The Practice page builds game variations from protected classwork data:

- `matchData` entries (`word`, `meaning`) power matching, memory cards, vocabulary crosswords and word searches, flashcards, hangman, word scramble, dictation and pronunciation practice. Crossword words use alphabetic entries of 3–12 letters; word-search words use 3–12 letters, and both are capped at eight entries.
- `testMcq` entries (`q`, `options`, `correct`) power timed quizzes and unit boss rounds.
- `testComplete` entries (`p` or `prompt`, `a` or `answer`) power gap-fill.
- `sbPp` and `sbPs` groups with `prompt` and `correct` word arrays power sentence building.
- Optional `storyChoices` entries use `scene`, `choices`, and `correctChoice` for story-choice practice.

Keep answers in the protected classwork workflow. Static `content/*.json` files are public on the website until the security migration's removal checks pass. The current reader supports up to ten items per generated round (eight memory pairs). Crosswords and word searches are generated from the existing vocabulary; they do not need a separate schema.

Practice, Clip Lab, and Manga Reader share a saved light/dark preference. Their theme controls work with keyboard input and follow the system preference until the learner selects a theme.

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
