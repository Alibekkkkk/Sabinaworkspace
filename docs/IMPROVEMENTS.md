# Improvements from the ten requests (Phases 9 to 13)

Everything below is live on https://sabina-s-workspace.web.app unless marked otherwise. Each item names the request it answers. Per-phase detail is in [PLAN-v2.md](PLAN-v2.md).

## Lessons (requests 3 and 6)
1. **The same section order in every lesson:** Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N, Test Your Knowledge. Close Reading is gone.
2. **Grammar sections named after the student's own topics** ("Grammar II: Past Passive"), as many as the lesson needs (Sabina 3, Araylim 1 5). Before, per-student titles were hard-coded in the page, and some were wrong (Araylim 2's future-tense exercises were titled "Present Tenses").
3. **Games and Listening Training run inside the lesson.** A finished round marks the section done; in the teacher preview they are read-only.
4. **A labelled Whiteboard button** on every section (before, it was an unlabelled 🖍️).
5. **Manga stays off** until the teacher switches it on for a student.
6. **Lesson clock:** the timer cards are clickable (choose the section to time), and the clock has cards for Vocabulary, Reading, Games, Listening, Grammar and Test.
7. **The dashboard** shows each student's current section by name and has buttons to send a student to any section.

## Bugs from the screenshots (requests 1, 2, 4, 5)
8. **The lesson preview in the dashboard was blank** ("this content is blocked"). The site's security settings blocked its own frames; the dashboard's own policy had blocked them since an early version.
9. **Section cards were not clickable:** fixed (see 6).
10. **The "open in another tab" warning appeared in teacher previews:** no longer shown there.
11. **A lesson stuck on its loading placeholders:** each loading step is now named and time-limited, so after 20 s an error card says where it stopped and offers Retry.

## Content (request 8)
12. **All seven lessons reviewed:**
    - Sabina's test asked about a heat wave, 200 mm of rain and a 400-hectare wildfire that her reading never mentioned. The reading is now a full article containing all of it, plus all 20 of her words.
    - Gaziz had two wrong answer keys ("every spring" with "have cleaned"), and 13 of his words were missing from his reading.
    - Araylim 2's lesson was half-size; it now has full vocabulary, questions, test and sentence builders.
    - Repeated exercise items were replaced, and every reading is at least 200 words.
13. **Abay's and Araylim 3's videos and tip boxes** used styling that the live site's security policy ignored. They now use the site's styles.
14. **A content checker** (`npm run review:content`) finds wrong answer keys, tense clashes with time words, broken sentence builders, missing options and duplicates. A test keeps every lesson passing it.
15. **Every student has a Listening Training set** of 10 original sentences with Russian translations, approved.
16. **The new content is in the six live lessons.** The live copies were backed up and checked first (none held teacher edits).

## Listening from a recording (request 7)
17. **🎧 Listening from audio** on the dashboard: paste a link to an audio file and the teacher's browser writes the transcript with Whisper. It is free, and nothing is uploaded.
    - Google Drive, Dropbox and OneDrive share links are converted; YouTube is refused with an explanation.
    - You can also choose the file, or paste the transcript.
18. **Check each sentence:** play it, correct the words and the times, remove sentences, then save to the lesson. Students get it at once and hear each sentence from the real recording; Slow plays it at 75%.

## Design (request 9)
19. **New look:** Lime Night (deep navy, electric lime, violet) by default, and Lime Light. It was chosen from five designs on a canvas you can open.
20. **One theme switch for the whole site,** remembered everywhere.
21. **Original line icons instead of emojis** in every page's buttons, tabs, sidebar and badges. Lesson content keeps its pictures.
22. **Original illustrations** for each section type beside the lesson title.
23. **Readable colours:** every text and background pairing meets WCAG AA in both themes (56 pairs). An accessibility scan of ten pages in both themes finds no violations (`npm run test:a11y`).

## Other improvements found along the way (request 10)
24. **Old answer keys were publicly downloadable:** old copies of the lesson files, answers included, were served at `content/_snapshots/`. They are no longer published.
25. **Update existing lessons from the import tool:** "Import content" could never update a lesson that already had a copy, so changes to a lesson file never reached students. **Check for lesson updates** lists what differs; **Update lessons** downloads a backup, then replaces the copies.
26. **The "Save Manga Reader changes" button did nothing** until the Clip Lab button had been pressed (its handler was set up inside the other's).
27. **Whiteboard palm rejection failed after long pen strokes:** a palm landing right after a stroke longer than 1.5 seconds drew a line. It now counts from the pen's last contact.
28. **After an update, a page could mix new and old files** until reloaded. Each version of the site now serves its own complete set, and the "New version available" banner switches over in one step.
29. **Students' devices no longer download teacher-only tools and the archived first version** (five fewer files offline).
30. **Lessons imported before these changes** borrow their grammar topics from the published files, so names were right even before the import.
31. **The phone browser bar and the installed app** use the new colours.
32. **The language menu** no longer covers buttons on the lesson, homework and portal pages.
33. **Accessibility fixes from the sweep:**
    - In the light theme, the portal's summary numbers were lime on white (1.28:1); they now pass.
    - The manga drawing area in the import tool had a label screen readers ignored; it now has a role.
34. **Every Easy listening sentence hides at least two words.** Ten sentences hid only one, and so practised less.
35. **Section titles start with words.** The icon that came from the old emoji is gone, since each lesson heading already shows the section's illustration.
36. **Tests:**
    - **Intermittent failures fixed:** all three intermittent browser tests were traced to real causes and fixed: the palm rejection (27); two tests reading the database or the page before it was ready; a listening test that could mistake one nine-word sentence for another; a keyboard test that raced the game's own focus.
    - **New tests:** browser tests for the lesson sections, listening from a recording, lesson updates, and an accessibility sweep of ten pages in both themes (`npm run test:a11y`).

## Still open
- **Your checks:** sign in on a phone and check one lesson as a student, then switch Manga reader on for Gaziz in the dashboard's Feature flags card.
- **Translations:** Russian and Kazakh interface texts are machine drafts; ask a native speaker to check `locales/ru.json` and `locales/kk.json`.
- **Flashcard pictures:** vocabulary flashcards still show each word's emoji. Use **Set image** for real pictures.
- **First use of the recording tool:** it downloads the speech model (40 or 80 MB), and links must allow other sites to read them (otherwise choose the file).
