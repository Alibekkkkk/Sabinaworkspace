# Phase 8: hardening, performance, offline, docs, final audit

Branch `araylim-4-academic`, nothing pushed or deployed. Commits: `phase8.1` (PWA and offline), `phase8.2` (performance), `phase8.3` (security and privacy), `phase8.4` and `phase8.5` (robustness, languages, tests, CI, docs).

## 1. Executive summary
The product is installable, works offline for what has been opened, is covered by 400+ unit tests, 48 database-rule tests, a one-command browser suite and a CI workflow, and has a strict header policy, a privacy inventory with export and delete, an error boundary and three interface languages (two of them drafts). It is **not ready to deploy as is**: two of the 17 browser scripts (whiteboard shapes, games by keyboard) currently fail and are not diagnosed; security headers were never observed on a live server; mobile LCP is over 2.5 s on five pages; most page text is not yet translated; Russian and Kazakh need a native review; and the "final acceptance" is scripted, not a recorded manual pass. Decisions you need to make are in section 5.

## 2. Evidence for the Phase 8 items
| Item | Result |
| --- | --- |
| Step 1 PWA: manifest with PNG 192/512, maskable, shortcuts | ✅ `tests/pwa-offline.test.mjs` (icon sizes, shortcut targets) |
| Step 1 service worker: versioned caches, strategies, offline page, update flow | ✅ unit tests (rules of `sw.js`, banner and Reload), `scripts/offline-e2e.mjs` (installs, shell precached, visited pages open with the network off, honest banner) |
| Step 1 generated precache list and a test that nothing referenced is missing | ✅ `scripts/build-sw-manifest.mjs`, test "every file a page or script points at…" |
| Step 1 never cache auth or protected content | ✅ decision recorded in `docs/SECURITY.md`; test and offline script check no Firebase or Google URL is cached |
| Step 1 queued writes and sync status | ⚠ connection banner on every student page; the SDK queues writes in memory, so they survive only while the page stays open (documented) |
| Step 2 budgets, `lighthouserc.json`, `npm run perf:budgets`, JS ≤ 150 kB per page | ✅ all pages under (largest 98 kB gz); ❌ LCP over 2.5 s on clip, manga, lesson, homework, dashboard; lesson and dashboard performance 88 |
| Step 2 profile lesson and whiteboard, fix 3 hot spots | ⚠ three changes measured (blocking SDK scripts, connection setup, module waterfall); the lesson page's ~600 ms first layout pass was traced but its cause was not found |
| Step 2 modular Firebase SDK, WebP/AVIF, font subsetting | ❌ not done (SDK rewrite not attempted; no raster images or web fonts exist) |
| Step 3 XSS gates, secrets scan, `npm audit` | ✅ gates are tests; no secrets in 274 commits (pattern scan); 47 advisories, all dev tooling |
| Step 3 headers via `firebase.json`, verified with curl | ✅ block and tests; ❌ not observed on a server (emulator ignored it): run the curl commands in `docs/SECURITY.md` after a deploy |
| Step 3 rules re-verified against the threat list | ✅ threat-list tests; rules extended only for teacher delete, whiteboard read, client errors |
| Step 3 privacy doc, teacher export and delete | ✅ `docs/PRIVACY.md`, dashboard card, `scripts/privacy-e2e.mjs` |
| Step 4 error boundary, `clientErrors` capped and validated | ✅ unit tests, rules test (50 slots, bounded fields), `scripts/robustness-e2e.mjs` |
| Step 4 disconnect, auth expiry, two tabs, clock skew, storage quota and blocked storage | ✅ banner, "sign-in may have expired" message, second-tab and clock notices, safe storage, sign-in with blocked storage (all in `robustness-e2e.mjs`); ⚠ auth expiry is a message on a permission error, not a re-sign-in flow |
| Step 4 i18n en/ru/kk, `t()`, persisted switch, Intl | ⚠ done for the shared shell, notices, errors and not-enabled page; **page text is still English**; ru and kk are drafts |
| Step 5 `npm test` includes unit, rules, content lint, schema | ⚠ `npm test` is the unit tests; rules and lint are separate commands (rules need the emulator). CI runs all of them |
| Step 5 Playwright suite | ❌ replaced by puppeteer-core scripts (your decision): `npm run test:e2e` runs all 17 |
| Step 5 CI workflow, coverage report | ✅ `.github/workflows/ci.yml` (written, **never run on GitHub**); `npm run coverage` |
| Step 6 README, TEACHER_SETUP, ARCHITECTURE, GAMES, CLIP_LAB, MANGA, PRIVACY, ADRs, changelog, limitations | ✅ all present; ⚠ TEACHER_SETUP has no new screenshots (it points at the existing ones); one ADR only (whiteboard) |
| Step 7 acceptance walk-through as each role | ⚠ scripted, see `docs/ACCEPTANCE.md`; registration, the placement questions and homework submit are not driven in a browser; no recording |

## 3. Metrics
| Metric | Before | After |
| --- | --- | --- |
| HTML written from strings (`innerHTML` etc.) | 128 (project start) | 2 files (the sanitizing helpers); a test blocks others |
| Inline event handlers | about 161 | 0; tested |
| `unsafe-inline` in a page policy | present | 0 pages; tested |
| `target="_blank"` without `noopener` | 4 | 0; tested |
| Unit tests | 45 (project start) | 405 |
| Rules tests | 0 at project start | 48 |
| Browser scripts | 0 | 17 (`npm run test:e2e`) |
| Coverage of `js/` (unit tests only) | not measured | 82% lines; 97% on the 58 logic modules; 45% on the 24 browser-facing modules (covered by the scripts) |
| Script size per page (gzipped, own code) | not measured | 1 to 98 kB, budget 150 kB (tested) |
| Mobile Lighthouse | see `docs/PERFORMANCE.md` | performance 88 to 100, accessibility 95 to 100, best practices 93 to 96; LCP 1.1 to 3.7 s |

## 4. Open issues and risks, ranked
1. **Headers not verified, nothing deployed.** The hosting config may behave differently in production; the site is still on GitHub Pages without headers.
2. **Protected lesson JSON is still public** until content files are removed after the Firebase import is verified (existing runbook).
3. **LCP over budget** on the heavier pages (SDK download plus sign-in check); fix is a larger rewrite.
4. **Translations unreviewed**, and page text untranslated.
5. **CI never executed** on GitHub; the browser job needs a Chrome path and emulators that I could only test on this Windows machine.
6. **Offline writes** are lost if the page is closed while offline.
7. **No automatic data retention**; deleting a student keeps their Firebase sign-in account.
8. **`npm audit`** advisories in tooling (47).
9. **Browser scripts depend on timing** and on the machine's Chrome or Edge; one run in this session (whiteboard shapes) failed once and is listed below.

## 5. Decisions you must make and content you must supply
- Deploy where? If Firebase Hosting, then deploy and run the curl checks; if GitHub Pages, accept that headers cannot be sent.
- Do you want the modular Firebase SDK rewrite (the way to meet LCP)?
- Who reviews the Russian and Kazakh texts, and which page text should be translated next?
- Real manga art and stories (original art, decided); clip timings for the seven clips; the Error Hunt sentences for Sabina; full game mode as default.
- Retention policy for student data, and the consent wording for families (microphone, third parties).

## 6. Recommended next steps
- Run the CI workflow once on GitHub and fix what differs from this machine.
- Deploy to Firebase Hosting (or a header-capable host) and verify headers with the curl commands.
- Translate page text in priority order: portal, lesson, practice; have ru and kk reviewed.
- Move to the modular Firebase SDK, page by page, starting with `portal` and `lesson`.
- Remove the public lesson JSON after the protected import is verified.
- Draw or commission the first real manga chapter and time the seven clips.
- Add browser scripts for registration, the level check and homework submit.
- Record a manual acceptance pass for each role.

## Evidence: last full run
See the section below, filled in from the final `npm run test:e2e`, `npm test`, `npm run test:rules` and `npm run coverage` runs.

### Last runs (2026-11-10, Windows, Edge, demo emulators)
| Check | Result |
| --- | --- |
| `npm test` | ✅ 405 pass |
| `npm run test:rules` | ✅ 48 pass |
| `npm run coverage` | ✅ js/ 82.0% lines; logic modules 97.2% (58 files); browser-facing modules 45.3% (24 files) |
| `npm run test:e2e` (all 17 scripts, first full run) | ⚠ 11 passed, 6 failed |
| Reruns of the six that failed | listening ✅, games ✅, manga ✅ (the first failures were an emulator-only console message that three scripts did not ignore, and timing); clip page ✅ after the language picker was narrowed (it had caused sideways scroll at 390 px); **whiteboard shapes ❌ and games by keyboard (Pronunciation Challenge step) ❌ still fail** |
| Scripts that passed in the full run | clock, ladder, word family, reading, dashboard listening, whiteboard on devices, lesson stages and game mode, clips tab, offline, privacy, robustness |

**The two remaining failures are real and not diagnosed.** Both passed before step 4, so the likely cause is the shared shell changes in step 4 (language picker beside the theme button, the notice host, the error boundary) interacting with those scripts: the whiteboard script draws at fixed pixel positions, and the keyboard script counts focus order. They are not caused by anything in steps 1 to 3 that I can see. Treat `npm run test:e2e` as **not green** until these two are fixed.
