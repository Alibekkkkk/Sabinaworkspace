# Deploying

Checked against production on 2026-11-10 (read-only queries with the Firebase CLI, signed in as the project owner).

## What production looks like today
- **Website:** GitHub Pages from `main`, which is at `c57679a` ("Phase 1"). This branch (`araylim-4-academic`) is 74 commits ahead: everything from Phase 0b to Phase 8.
- **Database rules:** the old rules that recognise the teacher by e-mail address (8 KB). The new rules (about 70 KB) recognise the teacher **only** by `admins/<uid>: true`.
- **`/admins` is empty.** If the new rules are published before that node is filled, the teacher loses access to the dashboard, curriculum and protected content at once.
- `protectedContent` holds 19 lesson and homework records from the earlier import; it does not yet have the new fields (sections v2, clip v2, manga v2) or manga answer keys. `studentProgress`, `studentFeatures` and the other new nodes are empty.
- The Firebase CLI on this computer is signed in with the owner account and can deploy rules and hosting.

## Done so far
- 2026-11-10: the site is published to Firebase Hosting at `https://sabina-s-workspace.web.app`. Checked live: the security headers are on every page, the microphone is allowed only on clip, lesson, listening, manga and practice, `sw.js` and the manifest are `no-cache`, and tests, scripts, docs, rules and package files return 404. The portal loads with no console errors and the service worker registers. (`firebase.json` header order was fixed so the general `*.js` caching rule no longer overrides `sw.js`.)
- 2026-11-10: steps 1 to 3 done. Backups of the old rules and the whole database are in `C:\Users\Alibek\Documents\Sabina-backups\2026-11-10\` (outside the repository). `admins` holds the UIDs of alibek.alpysbayev@gmail.com and aalpysbayev2@gmail.com (checked against the Auth user list). The new rules are published (67 KB); anonymous reads of admins, students, protectedContent, sessions, clientErrors, studentFeatures and curriculum return 401.
- 2026-11-10: the teacher signed in on the live dashboard and it loads (step 3 checked).
- 2026-11-10: the screenshot fixes deployed: the dashboard preview frame, clickable section cards, no extra-tab warning for teachers, and a preview timeout.
- 2026-11-10: Phase 9 deployed (rules backed up first to `rules-before-phase9.json`): lesson sections v3, rules allowing sections up to 40. Content snapshots now return 404.
- 2026-11-10: Phase 10 deployed, and the new classwork written into the six live lessons from the command line: `lesson_1` (Gaziz), `lesson_1_sabina`, `lesson_1792346167287` (George), `lesson_1792367783670` (Araylim 1), `lesson_1792450067420` (Abay) and `lesson_1792583845397` (Araylim 3).
  - Every live copy was first checked: each matched an earlier version of its file exactly, so no teacher edits were overwritten.
  - Backup: `protectedContent-before-phase10.json`.
  - Note: **Import content** in the tool only writes a lesson that has no copy yet, so it cannot update an existing lesson. Phase 13 adds an update button.
- 2026-11-10: Phase 11 deployed (rules backed up to `rules-before-phase11.json`): listening sets from a recording. Checked live: the tool page has its own policy and loads the speech library; student pages keep the strict policy.
- 2026-11-11: Phase 12 deployed (Lime Night / Lime Light design). Checked live: the portal shows the new theme, icons and sprite, with no console errors. On the first visit after an update, a page can show the new layout with the previous scripts until it is reloaded once; the "New version available" banner does this.
- **Still to do:** switch Manga reader on for Gaziz (step 5); smoke test on a phone (step 6). Re-importing content brings the v3 grammar topics into the protected copies. Until then, lessons borrow them from the published files. The old GitHub Pages site now also runs against the new rules.

## Order (each step depends on the previous one)
1. **Teacher accounts in `admins`.** For each teacher account: Firebase console > Authentication > Users > copy the UID; Realtime Database > Data > add `admins/<UID>` = `true`. (Clients cannot write this node.)
2. **Back up**: Realtime Database > Data > ⋮ > Export JSON; copy the current rules text. Keep both outside the repository.
3. **Publish the rules**: `npx firebase deploy --only database --project sabina-s-workspace`. Then sign in as the teacher on the dashboard and check that students, lessons and the clock load.
4. **Publish the site** (one of):
   - **Firebase Hosting** (sends the security headers): `npx firebase deploy --only hosting --project sabina-s-workspace` → `https://sabina-s-workspace.web.app`. Then run the `curl` checks in `docs/SECURITY.md`. Students and the teacher need the new address.
   - **GitHub Pages** (no headers): merge this branch into `main` and push. Same address as today.
5. **Import content again** as the teacher: `tools/import-content.html` > Import content, Save Clip Lab changes, Save Manga Reader changes (with the answer keys from `docs/manga/gaziz-demo.answers.json` for the demo). Switch **Manga reader** on for Gaziz in the dashboard **Feature flags** card.
6. **Smoke test** with a real student code on a phone: sign in, open a lesson, the clock, a game, a clip, the whiteboard; the teacher dashboard; an offline reload.

## Rollback
- Rules: paste the saved rules back in the console (Realtime Database > Rules > Publish).
- Hosting: Firebase console > Hosting > release history > Roll back; or for Pages, revert the merge on `main`.
- Data: Import JSON at the node you need, from the export in step 2.

## Not blocking, but decide
- Russian and Kazakh are machine drafts and the language picker is visible to students (`locales/`).
- Lesson JSON under `content/` stays public on a static host until it is removed after step 5 is verified (`docs/SECURITY.md`).
- Known limits: `docs/KNOWN-LIMITATIONS.md`.
