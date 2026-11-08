# Phase 1 report: lesson, dashboard and homework

What changed, how it was checked, and what is **not** done. Commands to repeat each check are in the right-hand column.

## What changed

| Area | Change |
| --- | --- |
| Design research | `docs/DESIGN_RESEARCH.md` (appended): 10 products, 2 adopted / 1 avoided each, and the decisions taken. |
| Tokens | `css/design-system.css`: neutral/brand/status scales in light and dark, fluid type scale, 4-point spacing, radii, elevation, motion, z-index layers, `.ds-theme-light/.ds-theme-dark` containers, Calm mode (`html[data-calm]`). 54 text/background pairs checked in `docs/DESIGN_TOKENS.md`. |
| Components | `css/components/{controls,surfaces,progress,feedback,page-aliases}.css`: buttons, icon buttons, inputs, segmented control, tabs, card, chip/badge, banner, toast, tooltip, modal, sheet, drawer, empty state, skeleton, avatar, toolbar, progress bar and ring, stat tile, learning path, tab bar, feedback sheet, reading text, chart styles. |
| Style guide | `styleguide.html` (noindex, not linked) renders every component in light and dark side by side. |
| Illustrations | `assets/illustrations/{mascot,empty,celebrate}.svg`, original, under 1 kB each. |
| Fonts | Google Fonts removed from lesson, homework, dashboard and the portal (and from their CSP). System rounded stack for the UI, a serif stack for reading. See "Not done" for self-hosting. |
| Legacy shim | `css/legacy-pages.css` deleted. The three page stylesheets and page scripts contain no raw colours (enforced by `tests/theme.test.mjs`); legacy variable names alias tokens in `page-aliases.css`. |
| Shell | `js/shell.js`: mobile tab bar (Home, Lesson, Practice, Clips, Homework, Me; Manga only when flagged), offline banner, error page with retry and a diagnostic code, loading skeleton. Mounted on lesson and homework. |
| Lesson | Stage path states (current / done / mastered / not started) from the lesson's own stage list with icon + words + `aria-current`; reading settings (size, line spacing, font incl. an easy-read option, Calm mode) saved per device; 68ch measure; feedback boxes are live regions with border + text, not colour alone; shared motion-safe confetti; reserved lesson-bar slot for the Phase 2 timer. |
| Dashboard | "Today" strip (online, idle, might need help, overdue homework) with an attention list; status dots now carry words; weak-topic bars and a progress-over-time line as inline SVG (`js/charts.js`). |
| Homework | Autosave indicator with retry; submit confirmation modal listing unanswered questions; result banner with XP and a link back; reading-passage region is keyboard focusable. |
| Redirects | `lesson_abay.html` / `lesson_gaziz.html` stay as documented compatibility redirects into `lesson.html` (covered by `tests/pwa.test.mjs`). |

## Bugs found and fixed on the way

- Opening a lesson after signing in failed with `permission_denied` (the page re-wrote an already-linked student record).
- The homework result banner never appeared (`submittedAt` was undefined, so submission threw after saving).
- `showToast` was undefined on the homework page.
- Phone-width overflow: homework was 516px wide in a 390px viewport (a long unbreakable file path in the identity banner), dashboard tabs overflowed at 320px.

## Evidence

| Check | Result | How to repeat |
| --- | --- | --- |
| Unit tests | 135 pass | `npm test` |
| Rules tests | 23 pass | `npm run test:rules` |
| Token contrast | 54/54 pairs meet AA (text 4.5:1, focus and borders 3:1) | `npm run tokens:contrast` |
| No horizontal scroll, clipped text or overlapping controls | 0 problems across lesson, homework, dashboard x light/dark x 320/390/768/1440 px; 24 screenshots in `docs/screenshots/phase1/` | `npm run dev`, then `npm run check:visual` |
| axe on the three pages, signed in, 390px | 0 serious or critical. Remaining moderate: one heading-order item on the lesson, and Firebase's own emulator warning bar (dev only) | `npm run audit:signed-in` |
| Lighthouse accessibility (mobile) | lesson 98, homework 100, dashboard 100 (target 95) | `docs/LIGHTHOUSE-SIGNED-IN.md` |
| Lighthouse performance (mobile) | lesson **61**, homework 72, dashboard 95. **Target of 85 for the lesson is not met.** | `docs/LIGHTHOUSE-SIGNED-IN.md` |

Manual click-throughs on the seeded demo site (real emulator sign-in): student login; lesson opens with its stage path; reading settings change size and font and persist; homework autosave shows Saving then Saved; submit with blanks opens the modal listing "Question 2, Question 3, ..."; submitting records the score, XP and the dashboard summary; teacher dashboard shows the Today strip, status words, placement, schedule, leaderboard and charts for a selected student.

## Not done (be aware)

- **Lesson performance target.** Mobile score is 61, not 85. Lighthouse points to style/layout and main-thread work after the lesson renders (about 3.7 s style and layout under 4x CPU throttling) and 99 kB of `lesson.js` that is unused at load (the file is 157 kB and still loads all nine stage renderers up front). Next steps: split `lesson.js` so each stage loads on demand, load the Firebase SDK only after the page shell paints, and find the forced layouts in the render path.
- **Three-column lesson layout.** The stage path lives in the existing curriculum sidebar. There is a notes drawer but no right-hand panel with saved words or teacher messages, and feedback still appears under each question instead of a bottom sheet.
- **Shell on desktop.** There is no desktop sidebar navigation and no header XP/level chip. Only the mobile tab bar, banners and error/skeleton states exist.
- **Dashboard layout.** The command panel was not moved into a right-hand column, destructive actions do not all have an undo toast, and the Today strip has no "pending review flags" count (that would need a new summary field written by the student client).
- **Self-hosted fonts.** The system font stack replaced Google Fonts; no woff2 files were added, to avoid shipping fonts without a licence review.
- **Keyboard walkthrough test.** There is no automated keyboard-only run of a whole lesson (and the browser automation here is Puppeteer, not Playwright). The controls are native buttons/inputs with visible focus rings.
- **Lesson stage renderers** still map stage index to a fixed renderer; the lesson's own stage list drives labels and states, not which activity runs.
