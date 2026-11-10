# Sabinaworkspace

A static, mobile-first English-learning portal backed by Firebase Realtime Database. Student lesson content is read through the protected-content flow; Firebase rules remain the authorization boundary.

## Quick start

```powershell
npm install
npm run dev        # emulators + demo data + the site at http://127.0.0.1:5050/ (needs Java 21+)
npm test           # unit tests (400+), generated-file checks, security gates
npm run test:rules # database rules against the emulator (stop `npm run dev` first: same ports)
npm run test:e2e   # every browser script, one summary (needs `npm run dev` running and Chrome or Edge)
```

Students sign in on `portal.html` with `DEMOA001`, `DEMOB002` or `DEMOC003`; the teacher opens `dashboard.html` (e-mail and password are printed by `npm run dev`). After adding or removing files run `npm run build` (module preload hints, then the service worker's file list). Architecture, data paths and conventions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). What is not finished: [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md). History: [CHANGELOG.md](CHANGELOG.md).

## Page map

| Page | Who | What it is |
| --- | --- | --- |
| `index.html`, `offline.html` | everyone | Landing page; offline fallback |
| `portal.html` | student | Sign in with a code, register, lessons, practice entry, level check result, leaderboard opt-in |
| `placement.html` | student | Adaptive English level check |
| `lesson.html` (`lesson_*.html` redirect) | student, teacher | Live lesson: stages, clock, whiteboard drawer, game layer |
| `homework.html` | student, teacher | Homework with saved answers and review |
| `practice.html` | student | Games and review queue |
| `listening.html` | student | Dictation trainer |
| `clips.html`, `clip.html` | student | Clip Lab list and a clip |
| `manga.html` | student with the flag | Shelf and reader |
| `whiteboard.html` | student, teacher | Full-screen whiteboard |
| `dashboard.html` | teacher | Students, lessons, clock, whiteboard, mastery, clips, manga, feature flags, errors, privacy |
| `tools/import-content.html` | teacher | Import content and answer keys; make clips, manga, listening packs |
| `styleguide.html` | developer | Components in light and dark (not linked) |

## Local checks

```powershell
npm test
npm run test:rules
npm run audit:web
npm run check:budgets   # script size per page
npm run perf:budgets    # mobile Lighthouse against the budgets, writes docs/PERFORMANCE.md
npm run coverage        # unit-test coverage of js/
```

`npm run audit:web` runs Lighthouse (mobile and desktop) and axe-core against every page and rewrites [docs/LIGHTHOUSE.md](docs/LIGHTHOUSE.md). It needs Chrome or Edge (set `CHROME_PATH` if yours is somewhere unusual). Add page names to run a subset, for example `npm run audit:web -- portal.html placement.html` (the report then lists only those pages).

The rules test command requires Java 21 or later for the Firebase emulator. See [Teacher setup](TEACHER_SETUP.md) and the [security migration runbook](docs/SECURITY.md) before deploying rules or importing content.

## Design system

Tokens live in `css/design-system.css` (the only file with raw colours) and components in `css/components/`. Open `styleguide.html` (not linked from the app) to see every component in light and dark. `npm run tokens:contrast` regenerates the contrast table in [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md). Phase 1 results and what is still open: [docs/PHASE1-REPORT.md](docs/PHASE1-REPORT.md). `lesson_abay.html` and `lesson_gaziz.html` are kept as documented redirects into `lesson.html`.

With `npm run dev` running, `npm run check:visual` screenshots lesson, homework and dashboard in both themes at 320/390/768/1440 px and fails on horizontal scroll, clipped text or overlapping controls; `npm run audit:signed-in` runs Lighthouse and axe on those pages while signed in as the demo users.

## Look and themes

The site has two themes:
- **Lime Night** (dark), the default: deep navy with electric-lime highlights and violet accents.
- **Lime Light**: the same design on a light page.

One theme button anywhere switches the whole site and is remembered (`js/theme.js`). All colours come from `css/design-system.css`; run `npm run tokens:contrast` after changing them.

Interface icons are original line drawings in `assets/icons.svg`: write the emoji in a label and `js/icons.js` shows the matching icon. Section illustrations are in `assets/illustrations/`.

## Lesson clock and sections

Every classwork lesson has the same sections, in this order: **Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N, Test Your Knowledge** (content schema v3, `js/lesson-plan.js`). The grammar sections come from the lesson's `grammar` list: one per topic, named after it ("Grammar II: Past Passive"), with its rule and the exercises it uses, so the number of grammar sections varies by student. Games and Listening Training run inside the lesson; the whiteboard is a button on every section; the Manga reader stays off until the teacher switches it on for a student.

The teacher starts, pauses, resumes and stops a class clock from the dashboard (Lesson clock card) or the floating panel on the lesson page, and clicks a section card at the top of the lesson to time that section. The student sees the same time live, and the saved duration appears in the portal, history, weekly summary and a CSV export. The clock cards are Vocabulary, Reading Comprehension, Games, Listening Training, Grammar and Test Your Knowledge, with planned, actual and remaining time always visible. See [docs/PHASE2-REPORT.md](docs/PHASE2-REPORT.md).

- `npm run migrate:sections` (add `-- --dry-run` first) moves lesson files to schema v3, taking grammar topics from `scripts/data/grammar-v3.json`; `npm run lint:content` checks them.
- With `npm run dev` running, `npm run test:lesson-sections-e2e` checks the section order, a grammar section, games and listening inside the lesson, the teacher preview and the dashboard's preview frame.
- With `npm run dev` running, `npm run test:clock-e2e` runs a teacher and a student in separate browser sessions (the student's device clock 10 minutes fast) through start, pause, refresh, resume and stop.
- After migrating lesson files, run **Import Content** so each student's protected copy gets the new fields.

## Try it locally with demo data

```powershell
npm run dev
```

This starts the Firebase Realtime Database and Auth emulators (needs Java 21+), fills them with demo data ([scripts/seed-emulator.mjs](scripts/seed-emulator.mjs)) and serves the site at `http://127.0.0.1:5050/`. Nothing touches your real Firebase project.

- **Students:** open `portal.html` and sign in with the code `DEMOA001`, `DEMOB002` or `DEMOC003`. Anna has a saved placement result, an open lesson and homework due in two days; Boris's lesson is overdue; Chen's lesson is locked for three days (try opening it to see the server-side gate).
- **Teacher:** open `dashboard.html` and sign in with the e-mail and password shown in the terminal / `scripts/seed-emulator.mjs`. The account is already marked as an admin.
- The dev server rewrites the Content-Security-Policy and `js/config.js` in memory so the browser can reach the emulators; the files on disk are unchanged. Stop everything with Ctrl+C.
- `npm run seed` re-seeds a running emulator. The seed script refuses to talk to anything that is not on localhost.

## Current learning features

- **Listening trainer** (`listening.html`): a British-voice character says a sentence, some words are hidden as stars, the student types them in place and gets per-word feedback with the differing letters marked. Levels Easy, Medium, Hard and Expert adapt (3 right in a row up, 2 wrong in a row down). Rounds of up to 10 sentences end with accuracy, stars, hardest words and a Practise-mistakes round. Tapping a word offers Look up and Save to my words; missed words go to the practice review queue. Optional speaking practice needs a one-time consent. Packs live in `content/listening/` and are checked by `npm run lint:listening`; see [Teacher setup](TEACHER_SETUP.md) and `docs/PHASE3-REPORT.md`.
- Shared design tokens and a student portal with a learning path and practice entry points.
- Protected practice games include word matching, memory cards, crosswords, word searches, timed quizzes, fill-in-the-gap, sentence building, hangman, word scramble, flashcards, listening dictation, pronunciation fallback, boss rounds, and teacher-authored story choices. Progress and the spaced-review queue are student-scoped.
- Clip Lab uses official video embeds and protected Firebase clip records. Its current sample study text is teacher-created and explicitly not a verified transcript.
- The Manga Reader (off until the teacher switches it on for a student; `docs/MANGA.md`) reads original pages with a bottom sheet, three reading modes and a learning loop; its public story files contain no answer keys.
- The installable PWA caches the public app shell, content data, audio and images as used (`sw.js`, list generated by `npm run build:sw`). Sign-in, protected lessons and progress need a connection and are not cached; a page that is already open keeps its changes and sends them when the connection returns. Language: English, Russian and Kazakh for the shared interface (`locales/`, drafts need review).
- Practice, Clip Lab, and Manga Reader support a saved light/dark theme preference; the shared controls are keyboard accessible and respect reduced-motion settings.
- Teachers can generate and download a seven-day student progress summary from existing game, homework, and activity records; no parent login or automatic sharing is enabled.
- An adaptive English level check (about 18 to 30 questions: multiple choice, gap typing, sentence ordering and a spoken listening item) estimates A1-C1 and builds a practice path. Signed-in students' results are saved (one retake a week unless the teacher resets it), shown in the portal and on the teacher dashboard, where the teacher can override the level. It is a rough guide, not an exam, and never changes assignments. The item bank is `content/placement/items.json` (validated by `js/placement.js`).
- An opt-in class leaderboard: students are opted out by default, choose a nickname, and classmates see only nicknames and weekly XP. The teacher can rename, remove or assign classes.
- Assignment scheduling: lessons and homework can have an available-from, due and closing time. Students see "Due in 2 days", "Overdue" or "Locked until...", the database refuses to serve locked content early, and the teacher has a per-student schedule list with "duplicate to next week". After changing dates, run Import Content so each student's view is refreshed.
- The legacy lesson, homework, and teacher dashboard pages now share responsive spacing, visible focus states, reduced-motion handling, and touch-friendly controls. `lesson_abay.html` and `lesson_gaziz.html` are compatibility redirects into the shared data-driven `lesson.html` renderer, not separate lesson implementations.

Clip metadata and study prompts in `content/clips/` are public static files, so they must not contain answer keys. Add correct answers in the teacher-only answer-key field in `tools/import-content.html`; the importer stores them only in `protectedContent/<lessonId>/clip`. See the authoring instructions in [Teacher setup](TEACHER_SETUP.md).

The full visual redesign of the legacy lesson/homework/dashboard pages is not implemented yet. The weekly summary is teacher-only; parent accounts or automatic report sharing are not provided. Production deployment is paused while protected static lesson content is migrated and Firebase access is verified; see the [security migration runbook](docs/SECURITY.md) before republishing Pages. See [Teacher setup](TEACHER_SETUP.md) for current authoring limitations.


## Whiteboard

A drawing board for class and for practice on your own: pen, highlighter, erasers, laser pointer, shapes, text, sticky notes, pictures, English templates, pages, zoom and pan, undo and redo, export to PNG, SVG and PDF. Open it from the pen button in a lesson, from `whiteboard.html?lesson=<id>` (students) or `whiteboard.html?code=<STUDENTCODE>&lesson=<id>` (teacher). Code is in `js/whiteboard/`, no dependencies, no build step. Design notes: `docs/adr/0001-whiteboard.md`, research: `docs/WHITEBOARD_RESEARCH.md`, evidence: `docs/PHASE4-REPORT.md`.

Checks: `npm test` (unit), `npm run test:rules` (database rules), with `npm run dev` running: `npm run test:whiteboard-e2e` and `npm run test:whiteboard-devices-e2e`.


## Clip Lab

Short official video moments with interactive study text and nine kinds of exercise. Rules and how to make a clip: `docs/CLIP_LAB.md`; checking clips: `npm run check:clips`; with `npm run dev` running: `npm run test:clips-e2e`.
