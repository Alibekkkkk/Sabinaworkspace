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

The first class topic is **Sustainable Cities**. Gaziz’s classwork uses a 20-word set and a Rivergate reading. His separate homework uses a different Rivergate planning case and supplementary words such as *retrofit*, *stormwater*, and *urban heat island*. Sabina’s homework uses the same class reading and vocabulary as classwork, presented through different activity formats. Both practise present perfect and past simple in active voice.

Sign in to the teacher dashboard, open **Lessons**, then click **Assign Gaziz homework** and **Assign Sabina homework** when you want to assign each one. Each button also shares the Sustainable Cities classwork with that student. The buttons find the existing students by name and add separate homework cards to their portals, due before the next class. Students can resume saved answers; completion and score appear in the student portal and teacher dashboard. If a student is missing, add them first.

## Add vocabulary pictures

On any lesson tile, choose **Flashcard images**, enter a vocabulary word exactly as it appears in that lesson, paste a direct public image URL, and save. Students see the image on the card and when they open it. To remove a picture, remove its row and save. Only use image URLs that are publicly viewable by students.

The dashboard edits lesson assignment, homework, title/description, visibility, and flashcard images. To change the wording of a built-in classwork or homework activity, edit its HTML source file (`lesson_gaziz.html` or `homework.html`) and upload it with the other site files.
