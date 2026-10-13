# Teacher dashboard setup

The site files in this folder share the existing Firebase project, `sabina-s-workspace`. Keep `dashboard.html`, `portal.html`, `lesson.html`, `lesson_gaziz.html`, and `homework.html` together on the same website host so the teacher links, student portal, classwork, and separate homework pages work together.

## Turn on teacher sign-in

1. In Firebase Console, open the `sabina-s-workspace` project.
2. Open **Authentication** and click **Get started** if Firebase offers it. Then go to **Authentication → Sign-in method** and enable **Google** and **Email/Password**. The dashboard accepts either method for these three addresses:
   - `alibek.alpysbayev@gmail.com`
   - `alibek.alpysbayev@nu.edu.kz`
   - `aalpysbayev2@gmail.com`
3. Under **Authentication → Users**, make sure those accounts exist. If an account is Google-only, use **Continue with Google** on the dashboard. For an email/password account, use the email and password form.
4. Under **Authentication → Settings → Authorized domains**, ensure `alibekkkkk.github.io` is listed. Add it if needed so Google sign-in works on the published site.
5. Go to **Realtime Database → Rules**, replace the current rules with the contents of [`database.rules.json`](database.rules.json), and click **Publish**. The rules let students continue reading the curriculum and using code-based lessons, while only those three authenticated teacher emails can edit curriculum or existing student records. New student codes can still be registered by the portal.

## Put the changes on the website

Upload the changed HTML files, including the new `homework.html`, and `database.rules.json` to the folder used by the current website host. Do not create a second site. If you want to preview the pages on this computer first, open PowerShell in this folder and run:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/dashboard.html`. If Firebase blocks sign-in locally, add `localhost` under **Authentication → Settings → Authorized domains**. Stop the preview server with Ctrl+C.

## Assign the Sustainable Cities homework

The first class topic is **Sustainable Cities**. Gaziz’s homework uses a separate Rivergate case, a different common-word set, and 16 questions. Sabina’s homework follows the same topic and key classwork facts, with a separate 16-question set using different response formats. Both practise present perfect and past simple in active voice.

Sign in to the teacher dashboard, open **Lessons**, then click **Assign Gaziz homework** and **Assign Sabina homework** when you want to assign each one. Each button also shares the Sustainable Cities classwork with that student. The buttons find the existing students by name and add separate homework cards to their portals, due before the next class. Students can resume saved answers; completion and score appear in the student portal and teacher dashboard. If a student is missing, add them first.

## Edit classwork and add vocabulary pictures

On the teacher dashboard’s **Lessons** tab, choose **Open lesson**. The lesson opens in teacher preview when the page is opened with one of the approved accounts. It does not attach to the student’s live session. In the vocabulary section, click a card and use **Custom image** beside **Listen** and **Reveal**. Paste a public `https://` image URL; leave it blank to remove the custom image. Students see the saved image on the card.

In Gaziz’s Sustainable Cities lesson, teacher preview adds **Edit question** controls to the reading, comprehension, grammar, and sentence questions. Update the wording, options, answer key, or explanation in the prompts; these edits are saved to Firebase and appear for students. Use the visible Homework link nested under Lesson 1 in the classwork sidebar to open the assigned separate homework page. Homework pages have a **Light theme** / **Dark theme** toggle.

The dashboard’s **Reset student progress** clears the saved score, stages, notes, and activity feed. The dashboard’s **Undo** can restore the reset if it is the most recent teacher change.
