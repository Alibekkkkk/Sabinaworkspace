# Teacher dashboard setup

The site files in this folder share the existing Firebase project, `sabina-s-workspace`. Keep `dashboard.html`, `portal.html`, `lesson.html`, and `lesson_gaziz.html` together on the same website host so the teacher links, student portal, and lesson URLs work together.

## Turn on teacher sign-in

1. In Firebase Console, open the `sabina-s-workspace` project.
2. Go to **Authentication → Sign-in method**. Enable **Google** and **Email/Password**. The dashboard accepts either method for these three addresses:
   - `alibek.alpysbayev@gmail.com`
   - `alibek.alpysbayev@nu.edu.kz`
   - `aalpysbayev2@gmail.com`
3. Under **Authentication → Users**, make sure those accounts exist. If an account is Google-only, use **Continue with Google** on the dashboard. For an email/password account, use the email and password form.
4. Go to **Realtime Database → Rules**, replace the current rules with the contents of [`database.rules.json`](database.rules.json), and click **Publish**. The rules let students continue reading the curriculum and using code-based lessons, while only those three authenticated teacher emails can edit curriculum or existing student records. New student codes can still be registered by the portal.

## Put the changes on the website

Upload the changed HTML files and `database.rules.json` to the folder used by the current website host. Do not create a second site. If you want to preview the pages on this computer first, open PowerShell in this folder and run:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/dashboard.html`. If Firebase blocks sign-in locally, add `localhost` under **Authentication → Settings → Authorized domains**. Stop the preview server with Ctrl+C.

## Assign Gaziz’s first homework

Sign in to the teacher dashboard, open **Lessons**, and select **Assign Gaziz Lesson 1 homework**. The dashboard finds the student whose name is Gaziz and assigns the existing Gaziz lesson URL (or creates a dedicated Lesson 1 card if no such curriculum item exists). It appears in Gaziz’s portal with the due note “Before our next class.” If Gaziz is not listed yet, add him first and then click the assignment button.

## Add vocabulary pictures

On any lesson tile, choose **Flashcard images**, enter a vocabulary word exactly as it appears in that lesson, paste a direct public image URL, and save. Students see the image on the card and when they open it. To remove a picture, remove its row and save. Only use image URLs that are publicly viewable by students.

The dashboard edits lesson assignment, homework, title/description, visibility, and flashcard images. To change the wording of an exercise in a custom lesson, edit that lesson’s HTML source file and upload it with the other site files.
