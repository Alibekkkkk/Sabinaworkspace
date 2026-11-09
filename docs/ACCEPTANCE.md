# Final acceptance walk-through

How to repeat it: `npm run dev`, then `npm run test:e2e` (every script below, one summary), plus `npm test` and, with `npm run dev` stopped, `npm run test:rules`. Each row says which script drives that part of the journey as a real browser (Chrome or Edge, headless), what it checks, and where the screenshots are.

**Honest scope.** The walk-through is covered by scripted browser runs against the emulators with demo data, not by a person filming each role. A manual, screen-recorded pass has not been done. Parts of the prompt's list that no script drives are marked.

## 1. New visitor to portal
| Step | Evidence |
| --- | --- |
| Open the portal, sign in with a code (binds the code to the browser's account), see lessons | `clock-e2e.mjs`, `robustness-e2e.mjs` (also with browser storage blocked), `manga-e2e.mjs` |
| Register a new account and claim a code | unit tests (`student-context`) and rules tests; **no browser script drives the registration form** |
| Placement (level check) and the learning path | `tests/placement.test.mjs`, rules test for placement results; **no browser script drives the 18 to 30 questions** |

## 2. Student: live lesson
| Step | Evidence |
| --- | --- |
| Lesson with the timer running, sections with estimates, summary shows total time | `clock-e2e.mjs` (teacher and student in separate sessions; device clock 10 minutes fast) |
| Grammar ladder, word families, reading questions | `ladder-e2e.mjs`, `word-family-e2e.mjs`, `reading-tasks-e2e.mjs` |
| Listening trainer round | `listening-e2e.mjs` |
| Whiteboard draw and persist, modes, phones and tablets | `whiteboard-e2e.mjs`, `whiteboard-devices-e2e.mjs` |
| Game mode and lesson stages, games and rewards, keyboard only | `lesson-games-e2e.mjs`, `games-e2e.mjs`, `games-keyboard-e2e.mjs` |
| Clip page and the Clips tab | `clips-e2e.mjs`, `clips-tab-e2e.mjs` |
| Homework submit | rules tests (write-once, score bound), `tests/homework-answers.test.mjs`; **no browser script submits homework** |

## 3. Teacher: dashboard
| Step | Evidence |
| --- | --- |
| Start, pause, stop the timer; send commands; live progress | `clock-e2e.mjs` |
| Review flags and written answers | `manga-e2e.mjs` (review queue), `clips-tab-e2e.mjs`, `dashboard-listening-e2e.mjs` |
| Assign with a schedule | rules test (locked content is refused early), `tests/schedule.test.mjs`; the manga card assignment in `manga-e2e.mjs` |
| Weekly report and mastery analytics | `games-e2e.mjs` (mastery card), `tests/weekly-summary.test.mjs` |
| Toggle feature flags | `manga-e2e.mjs`, `robustness-e2e.mjs` |
| Export and delete a student's data, see error reports | `privacy-e2e.mjs`, `robustness-e2e.mjs` |

## 4. Gaziz (manga) and another student
`manga-e2e.mjs`: a student without the flag sees "not switched on", has no Manga tab, and the database refuses the story by its address (also in the rules tests); the student with the flag reads in three modes with keyboard and swipe, saves words, finishes a chapter (record, XP, boss, review queue). Screenshots: `docs/screenshots/phase7/`.

## 5. Offline, themes, devices, keyboard
| Step | Evidence |
| --- | --- |
| Offline reload | `offline-e2e.mjs`: service worker installs, shell precached, a visited page opens with the network off, cached content served, honest offline banner |
| Dark and light | `npm run check:visual` (lesson, homework, dashboard at 320, 390, 768, 1440 px in both themes); `docs/screenshots/phase1/` |
| Mobile and desktop | the 390 px checks inside the scripts above; `check:visual` |
| Keyboard only | `games-keyboard-e2e.mjs`, the keyboard steps in `manga-e2e.mjs` and `whiteboard-e2e.mjs` |
| Accessibility | axe checks inside `manga-e2e.mjs`, `clips-tab-e2e.mjs`, `games-e2e.mjs`; Lighthouse accessibility 95 to 100 in `docs/PERFORMANCE.md` |

## Result of the last run
See [PHASE8-REPORT.md](PHASE8-REPORT.md), section "Evidence".
