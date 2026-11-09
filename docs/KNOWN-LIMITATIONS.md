# Known limitations

Honest list as of the end of Phase 8, most important first. Details and evidence are in the phase reports (`docs/PHASE*-REPORT.md`) and [PHASE8-REPORT.md](PHASE8-REPORT.md).

## Needs your decision or action
1. **Nothing is deployed.** The site is on GitHub Pages, which cannot send security headers. `firebase.json` has a hosting block with strict headers, but it has not been deployed, and the header rules were not observed on a running server (the Hosting emulator ignored them). Run the `curl` checks in [SECURITY.md](SECURITY.md) after a deploy.
2. **Protected lesson JSON is still public on a static host** until the files under `content/` are removed after the Firebase import is verified (runbook in SECURITY.md).
3. **Russian and Kazakh text is machine-drafted.** A native speaker must check `locales/ru.json` and `locales/kk.json` before students see them. The language picker is on.
4. **Real manga stories and art do not exist yet.** The demo is original placeholder art; the decision is original art (PHASE7-REPORT.md).
5. **Clip timing is unverified** for the seven shipped clips (shown as "Text and activities").
6. **Families and the microphone:** speech recognition in Chrome and Edge sends audio to the browser vendor. Tell families (PRIVACY.md).

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
