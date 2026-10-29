# Security and privacy

## What is and is not private

GitHub Pages serves published files publicly. `robots.txt` and `noindex` do not restrict access. Until the lesson and homework JSON files have been removed from the published site, anyone who knows their URLs may download them.

Making the GitHub repository private does not necessarily make its Pages site private. Check the repository's Pages settings and your GitHub plan separately. Making a repository private also does not erase copies already downloaded, cached, or cloned, and does not remove files from public Git history. Do not rewrite history without a separate, coordinated decision.

The Firebase web configuration in `js/config.js` is public client configuration, not a secret. Firebase Realtime Database Rules must enforce access.

## Migration runbook

Follow these steps in order. Do not delete the source JSON files or start the next application phase until all acceptance checks below pass.

### 1. Protect the repository and decide how to handle the public site

1. In GitHub, open the repository's **Settings → General → Danger Zone → Change repository visibility** and make the repository private, if that is still the chosen decision.
2. Check **Settings → Pages** and confirm whether the published site is still publicly accessible. Do not assume changing repository visibility made the site private.
3. If the public lesson/homework files must stop being accessible immediately, unpublish or restrict the site while migration is in progress. This may temporarily take the student site offline. Otherwise, recognize that the files remain public until step 7 is complete.
4. Do not force-push or rewrite Git history as part of this runbook. If old public commits need removal, plan that separately with everyone who uses the repository.

### 2. Prepare and run the local checks

Use a JDK version 21 or later, Node.js, and npm. From PowerShell, in the repository root:

```powershell
java -version
npm ci
npm test
npm run test:rules
```

Confirm `java -version` reports 21 or later and both test commands pass. `npm test` runs the focused unit tests; `npm run test:rules` starts the Realtime Database emulator and tests `database.rules.json`.

If `npm run test:rules` fails, stop and resolve the failure before deploying anything. Do not weaken rules or enable public access to make tests pass.

### 3. Confirm the Firebase project and back up existing data/rules

1. Sign in to Firebase Console and confirm the intended project is **sabina-s-workspace**, matching `projectId` in `js/config.js`. Confirm you have selected that exact project before making changes.
2. In Firebase Console, open **Realtime Database → Data** and export/download a JSON backup to a secure location outside the repository. Do not commit or publicly share the backup; it contains student data.
3. Open **Realtime Database → Rules** and save a separate copy of the currently deployed rules outside the repository.
4. Review the existing `curriculum` assignments and student records. Check how assignments represent `assignedTo`, `audience`, and content URLs. Stop if records use a shape or custom content URL the importer does not handle; investigate and update the migration before proceeding.

### 4. Check Firebase Authentication and hosting

1. In Firebase Console, confirm Google sign-in is enabled under **Authentication → Sign-in method**.
2. Under **Authentication → Settings → Authorized domains**, ensure the domain you will use for the migration tool and student site is authorized.
3. Use a verified Google account whose email is in `TEACHER_EMAILS` in `js/config.js`. The importer will not enable its import button for an unverified or non-allowlisted account.
4. Confirm the site deployment and rollback method. Do not deploy application changes to the student site until the local rules tests pass.

### 5. Deploy and verify the Realtime Database Rules

The rules are not deployed automatically. After completing steps 2–4, publish only the database rules:

```powershell
npx firebase login
npx firebase projects:list
npx firebase deploy --only database --project sabina-s-workspace
```

Before the deploy command, verify that the listed project is the intended project. In Firebase Console, confirm the published rules match `database.rules.json`.

If deployment fails or legitimate teacher/student flows are denied, restore the saved rules through Firebase Console and investigate. Do not continue to import content until the rules are correct.

### 6. Run the additive content import

1. Deploy the application with the source files in `content/` still present. The importer fetches those files, so do not remove or rename them yet.
2. Open the deployed site's **Import Content** page (linked from the teacher dashboard), sign in with the verified teacher account, and confirm the displayed email is correct.
3. Select **Import content** and confirm the prompt. The importer creates only missing `protectedContent` records, refreshes student curriculum views using current assignments, and marks stale views unpublished. It does not overwrite existing protected content or delete existing curriculum/student records.
4. Save the completion message and investigate any reported error. Stop if the imported lesson IDs, source files, assignment counts, or student codes do not match expectations. Do not rerun repeatedly to work around an error without understanding it.
5. In Firebase Console, inspect representative `protectedContent/<lessonId>` and `studentCurriculum/<studentCode>/<lessonId>` records. Confirm the expected content was imported and only intended students have published views.

### 7. Test access as a teacher and as students

Use separate browser profiles or devices for the teacher and student accounts. Test at least:

- A student assigned a lesson can sign in, see that lesson, and load its classwork and homework.
- A student with no assignment does not see the lesson and cannot read its protected content.
- Student A cannot read Student B's curriculum view, session, or homework data.
- A student cannot read the full `curriculum` or list `students`.
- The teacher can still open the dashboard and manage assignments.
- Missing or inaccessible content produces an error; it does not display another student's or a fallback lesson.

Verify denied reads using the actual deployed application/accounts and, where possible, inspect Firebase client errors/network results. A hidden lesson link by itself is not proof of authorization. If any check fails, stop. Fix the issue, rerun the emulator tests, and retest before removing files.

### 8. Remove public lesson/homework JSON only after verification

Once every check in step 7 passes:

1. Remove the lesson and homework JSON files that contain protected student content from `content/` and from the deployed site. Keep `content/manifest.json` only if it is still needed as migration/source mapping metadata; it does not contain lesson answers.
2. Check all remaining HTML, scripts, manifests, and curriculum views for URLs that still point to removed `content/*.json` files. Update those references to use the protected Firebase reads.
3. Deploy the removal and verify the old public file URLs return not found, and that assigned students still load their lessons and homework successfully.
4. Check that unassigned students still cannot read protected Firebase records. Removing static files does not replace or relax database authorization.

Do not remove the files if any student flow still depends on them. Keep a secure backup outside the public site and repository.

## Acceptance checklist

Phase 1 is ready for acceptance only when all are true:

- The repository visibility decision is completed and Pages visibility has been checked.
- Unit tests and Firebase Rules emulator tests pass.
- The intended project's deployed rules have been reviewed.
- Existing Firebase data and rules have secure backups.
- The additive import has completed and representative imported records are correct.
- Assigned, unassigned, cross-student, and teacher access checks pass against the deployed project.
- Public content file URLs no longer serve the protected lesson/homework JSON.
- Student lesson/homework flows still work after removal.

Record which project was tested and the date/results of these checks before preparing the Phase 1 commit. Do not begin Phase 2 until the checklist passes.

## Grading and student identity notes

New work is graded in the browser. Each submission stores raw answers, score, denominator, submission time, student identity, content filename/hash, and schema version in `sessions/<code>`. Historical submissions are immutable to students under `database.rules.json`. A teacher-controlled re-grade should be an explicit operation that creates a new attempt/audit record rather than silently overwriting the original score.

Client-side grading cannot hide answer keys from a student who can download the content. Trusted server-side grading requires a server component, such as a Cloud Function, and may require Firebase Blaze billing.

Student codes are short bearer identifiers and can be guessed or shared. New registration generates a random 7-character code and claims only `students/<code>` with a Realtime Database transaction. A code is bound to the first authenticated UID; current code-based accounts use anonymous Firebase Auth unless the student signs in with Google. This first claim does not prove that the claimant is the intended student. Deliver codes privately and bind pre-existing accounts under teacher supervision.

By default the portal uses tab-scoped session identity. “Remember me on this device” opts into persistent browser storage. Signing out or switching students clears legacy and namespaced `nd_*` keys in that browser. Browser-local drafts without a verified owner code are intentionally not migrated based on a guessed identity.

## Rules and hosting constraints

`database.rules.json` denies root reads/writes, prevents listing `students/`, scopes session access to the UID bound at `students/<code>/uid`, restricts curriculum and protected content to authorized teachers/student assignments, and validates homework score bounds and write-once submission state. Emulator coverage is in `tests/rules.test.mjs`.

GitHub Pages serves files publicly. Any answer key, student name, static lesson, or homework JSON committed in the repository can be downloaded from a public site. Database Rules protect Firebase paths only; they cannot protect static files.
