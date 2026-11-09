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
- **Not done yet:** steps 1 to 3 (teacher UIDs in `admins`, backup, new rules). Until the rules are published, the new site runs against the old rules, so the new features that write to new database nodes (feature flags, manga, error reports, progress) are refused. The old GitHub Pages site is unchanged.

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
