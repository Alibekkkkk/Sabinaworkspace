# Sabinaworkspace

A static, mobile-first English-learning portal backed by Firebase Realtime Database. Student lesson content is read through the protected-content flow; Firebase rules remain the authorization boundary.

## Local checks

```powershell
npm test
npm run test:rules
```

The rules test command requires Java 21 or later for the Firebase emulator. See [Teacher setup](TEACHER_SETUP.md) and the [security migration runbook](docs/SECURITY.md) before deploying rules or importing content.

## Current learning features

- Shared design tokens and a student portal with a learning path and practice entry points.
- Protected practice games include word matching, memory cards, crosswords, word searches, timed quizzes, fill-in-the-gap, sentence building, hangman, word scramble, flashcards, listening dictation, pronunciation fallback, boss rounds, and teacher-authored story choices. Progress and the spaced-review queue are student-scoped.
- Clip Lab uses official video embeds and protected Firebase clip records. Its current sample study text is teacher-created and explicitly not a verified transcript.
- A Gaziz-only Manga Reader pilot uses original SVG panels and protected chapter checks. Its public draft contains no answer keys.
- The installable PWA caches the public app shell and static assets. Sign-in, protected lessons, and progress still require a network connection; protected Firebase data is not cached offline.
- Practice, Clip Lab, and Manga Reader support a saved light/dark theme preference; the shared controls are keyboard accessible and respect reduced-motion settings.
- Teachers can generate and download a seven-day student progress summary from existing game, homework, and activity records; no parent login or automatic sharing is enabled.

Clip metadata and study prompts in `content/clips/` are public static files, so they must not contain answer keys. Add correct answers in the teacher-only answer-key field in `tools/import-content.html`; the importer stores them only in `protectedContent/<lessonId>/clip`. See the authoring instructions in [Teacher setup](TEACHER_SETUP.md).

The full redesign of the legacy lesson/homework/dashboard pages, placement/onboarding, class leaderboards, and assignment scheduling are not implemented yet. The weekly summary is teacher-only; parent accounts or automatic report sharing are not provided. The CSP is a defense-in-depth baseline; legacy inline scripts and dynamic HTML rendering still need a stricter XSS-hardening pass. Production deployment is paused while protected static lesson content is migrated and Firebase access is verified; see the [security migration runbook](docs/SECURITY.md) before republishing Pages. See [Teacher setup](TEACHER_SETUP.md) for current authoring limitations.
