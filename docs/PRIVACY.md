# Privacy and data inventory

This describes what the portal stores about students, where, for how long, and how the teacher exports or deletes it. It is a technical description, not legal advice: the students include children, and the rules on consent and retention depend on where you and the families live, so check them with a qualified person.

## Who sees what
- **The student** sees only their own data (the database rules check this; tests in `tests/rules.test.mjs`).
- **The teacher** (an account listed under `admins/<uid>`) can read every student's data and write the teacher-owned nodes. Teachers cannot write a student's progress.
- **Other students** see nothing of each other except an optional leaderboard nickname and weekly XP (opt-in, a nickname the teacher can rename or remove).
- Parents have no accounts; the weekly summary is a text the teacher copies out.

## What is stored in the database (Firebase Realtime Database)
| Node | What it holds | Who writes it | Kept until |
| --- | --- | --- | --- |
| `students/<code>` | Student name, code, sign-in link, class, sign-up and last-login time, optional e-mail | Student (own record) and teacher | Teacher deletes the student |
| `studentByUid/<uid>` | Link from the sign-in account to the code | Student, teacher | Teacher deletes |
| `pendingStudents` | A signed-in person waiting for approval (name, e-mail) | The visitor | Teacher approves or rejects |
| `sessions/<code>` | Live lesson: state, draft answers, history of actions, notes, review queue (written answers sent to the teacher), commands, homework | Student; teacher for commands and notes | Teacher deletes |
| `sessionSummary/<code>` | Compact summary of the current lesson (score, stage, streak, time) | Student | Teacher deletes |
| `studentProgress/<code>` | XP, level, badges, streak, attempts, review list, saved vocabulary, clip, manga and listening records, placement result, avatar | Student (bounded values); never the teacher | Teacher deletes |
| `studentCurriculum/<code>` | Lessons assigned to the student, with schedule and feature markers | Teacher | Teacher deletes |
| `studentFeatures/<code>` | Feature switches (manga, Clip Lab, whiteboard, listening) | Teacher | Teacher deletes |
| `mangaAssignments/<code>` | Manga chapters assigned, with due dates | Teacher | Teacher deletes |
| `whiteboards/<code>` | Whiteboard drawings, presence, teacher snapshots (images of the board) | Student and teacher | Teacher deletes |
| `clientErrors/<code>` | Up to 50 small error reports sent by the student's browser: time, diagnostic code, page name, a short message and the first lines of the stack, and the browser name. No answers or personal text | Student (own code); teacher can clear | Teacher deletes |
| `lessonClock/<code>`, `lessonClockLog/<code>` | Lesson time totals; the log of timer events (who pressed what, when; no student writing) | Teacher | Clock: teacher deletes. **Log: append-only by design; remove in the Firebase console if you must** |
| `leaderboard/<class>` | Nickname and weekly XP, only if the student opted in | Student, teacher | Student opts out, or teacher removes or deletes |
| `curriculum` | The teacher's own lesson list | Teacher | Not student data |
| `protectedContent/<lesson>` | Lesson content and answer keys | Teacher | Not student data |
| `admins/<uid>` | Which accounts are teachers | Firebase console only | Not student data |

There is no automatic expiry: data stays until the teacher deletes it. Suggested practice: delete a student's data when they leave, and review old students once a year.

## What stays on the student's device (browser storage)
Preferences (theme, reading size, calm-play settings, manga reading position and aids), the remembered student code and name when "remember me" is ticked (`nd_student_code`, `nd_student_name`, `nd_remember_student`), a listening-consent flag, and a cache for offline use (pages, scripts, lesson data files, audio, images). The Manga Reader also keeps the story it opened, including its answer keys, so a chapter can be read offline; it is deleted when the teacher switches the flag off. Clearing the browser's site data removes all of this.

## Microphone and speech (consent)
- Speaking exercises (shadowing in the listening trainer, pronunciation in games and clips) are **optional**. Before the first use the page shows a consent message and the microphone is not touched until the student agrees (`js/listening/speaking.js`, stored as a local flag).
- The portal never records or uploads audio. It uses the browser's own speech recognition; in Chrome and Edge that service sends the audio to the browser vendor's servers. Say so to families before enabling speaking.
- Hosting headers allow the microphone only on the pages whose code can use it (`docs/SECURITY.md`).

## Third parties
- **Firebase (Google):** sign-in and the database. Data is held in the project's Firebase region.
- **Google's CDN** serves the Firebase SDK to every page load, so Google sees the student's IP address.
- **YouTube** (privacy-enhanced `youtube-nocookie.com` embeds) only on Clip Lab pages, and only after the student presses Load video.
- No analytics, advertising, or tracking scripts. No fonts are loaded from third parties.
- Text-to-speech audio for listening is generated by the teacher in advance (`scripts/generate-listening-audio.mjs`, keys in an untracked `.env`) and served as files from this site.

## Minors
The students are children. Before use: get the consent of a parent or guardian in the form the local rules require, keep the data in this inventory to what is needed for teaching, do not put real full names where a first name or nickname will do, and tell families about the microphone and third-party points above. The leaderboard shows nicknames only and is off until a student opts in.

## Export and delete (teacher tool)
On the dashboard, select a student, card **Student data and privacy**:
- **Download all data (JSON)** collects everything above for that student into one file (`student-<code>-export-<date>.json`).
- **Delete all data for this student** removes every path above in one step after you type the student's code. It cannot be undone, so download a copy first if you may need it. The lesson clock log is left in place (append-only); the card says so.
- The older **Delete** button on the student header removes only the profile and the live session, with an undo; use the privacy card to remove everything.

The list of paths lives in `js/privacy/student-data.js`; `tests/privacy.test.mjs` keeps it, this table and the database rules in step.

## Known gaps
- No automatic retention limit.
- Deleting a student does not delete the student's Firebase sign-in account (it holds only the sign-in identity); remove it under Authentication in the Firebase console if needed.
- Backups: Firebase may keep backups outside the portal's control; follow the project's own backup policy.
