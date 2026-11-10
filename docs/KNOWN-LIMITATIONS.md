# Known limitations

Honest list as of the end of Phase 13 (2026-11-11), most important first. Phase details are in [PLAN-v2.md](PLAN-v2.md) and the list of changes in [IMPROVEMENTS.md](IMPROVEMENTS.md).

## Needs your decision or action
1. **Check one lesson as a student on a phone**, and switch **Manga reader** on for Gaziz (dashboard > Feature flags). Signed-in pages were tested locally and with automated browsers, not by a person on the live site.
2. **Russian and Kazakh text is machine-drafted.** A native speaker must check `locales/ru.json` and `locales/kk.json`; the language picker is visible to students.
3. **Lesson JSON under `content/` is public** on the static host (it includes answers). Students read the protected copies, so the files could be removed from hosting once the import is verified (runbook in SECURITY.md).
4. **Real manga stories and art do not exist yet** (the demo is original placeholder art).
5. **Clip timing is unverified** for the seven shipped clips (shown as "Text and activities").
6. **Microphone:** speech recognition in Chrome and Edge sends audio to the browser vendor; tell families (PRIVACY.md). Listening from a recording transcribes on the teacher's computer and sends nothing.
7. **Flashcards show each word's emoji** as its picture; use **Set image** for real pictures.
8. **CI has never run on GitHub** (`.github/workflows/ci.yml`); it runs the same commands as above.

## Performance
- LCP is over 2.5 s on `clip`, `manga`, `lesson`, `homework` and `dashboard` in the mobile lab test, and `lesson` and `dashboard` score 88 (target 90). Cause: the Firebase compat SDK from the CDN plus the sign-in check; the fix is the modular SDK, which means rewriting every page's Firebase calls ([PERFORMANCE.md](PERFORMANCE.md)).
- INP is not measured (lab TBT stands in).

## Robustness and languages
- Only the shared shell, notices, error and not-enabled texts are translated. Lesson, homework, portal, practice, clip, manga and dashboard page text is still English, as are the "Due in 2 days" labels from `schedule.js`.
- Offline: a lesson that is already open keeps working and queued writes are sent when the connection returns, but only while the page stays open (the database SDK keeps the queue in memory). Closing the page offline loses those writes. Protected content is not cached offline (by design), except the manga story, which keeps its answer keys on the device.
- Error reports are limited by the page (five per page load, none within three seconds of another) and by the rules (50 slots); a hostile client could still overwrite them.

## Security and privacy
- No automatic data retention; deleting a student does not delete their Firebase sign-in account; the lesson clock log is append-only and is not removed by the delete tool.
- `npm audit` reports 47 advisories, all in development tooling (no runtime dependencies).
- The secrets scan of the git history was a pattern scan (no `gitleaks` or `trufflehog` available).

## Testing
- The end-to-end suite uses puppeteer-core with a locally installed Chrome or Edge, not Playwright (decided with you). It needs the emulators running (`npm run dev` or CI's `firebase emulators:exec`).
- The final acceptance walk-through is covered by the scripts listed in [ACCEPTANCE.md](ACCEPTANCE.md); a screen-recorded manual walk-through was not made.
- The visual editor and CSV import of the manga tools are tested by unit tests, not driven in a browser.

## Content and product
- Whiteboard, clips and manga each have their own limits; see PHASE4/6/7 reports (for example clips inside a lesson are a link, not an embedded player).
- The legacy lesson, homework and dashboard pages share the design tokens but are not fully redesigned.
