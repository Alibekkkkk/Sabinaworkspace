
    import { firebaseConfig } from "../config.js";
    import { isTeacher } from "../auth.js";
    import { addProtectedClipAnswers, validateClip } from "../clips/schema.js";
    import { addProtectedMangaAnswers, validateManga } from "../manga/schema.js";

    const status = document.getElementById("status");
    const signInButton = document.getElementById("signInButton");
    const importButton = document.getElementById("importButton");
    const updateClipsButton = document.getElementById("updateClipsButton");
    const clipDraft = document.getElementById("clipDraft");
    const clipAnswerKeys = document.getElementById("clipAnswerKeys");
    const validateClipButton = document.getElementById("validateClipButton");
    const downloadClipButton = document.getElementById("downloadClipButton");
    const clipAuthorStatus = document.getElementById("clipAuthorStatus");
    const updateMangaButton = document.getElementById("updateMangaButton");
    const mangaDraft = document.getElementById("mangaDraft");
    const mangaAnswerKeys = document.getElementById("mangaAnswerKeys");
    const validateMangaButton = document.getElementById("validateMangaButton");
    const downloadMangaButton = document.getElementById("downloadMangaButton");
    const mangaAuthorStatus = document.getElementById("mangaAuthorStatus");
    let database;
    let auth;
    let teacherAllowed = false;

    function setStatus(message) {
      status.textContent = message;
    }

    function safeClipFileName(value) {
      if (typeof value !== "string") return null;
      const fileName = value.replace(/^content\//, "");
      return /^clips\/[a-z0-9_-]+\.json$/i.test(fileName) ? fileName : null;
    }

    function safeMangaFileName(value) {
      if (typeof value !== "string") return null;
      const fileName = value.replace(/^content\//, "");
      return /^manga\/[a-z0-9_-]+\.json$/i.test(fileName) ? fileName : null;
    }

    async function readClipFile(fileName) {
      const file = safeClipFileName(fileName);
      if (!file) throw new Error(`Invalid clip filename: ${String(fileName)}`);
      const response = await fetch(`../content/${file.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read ../content/${file} (${response.status}).`);
      const content = await response.json();
      validateClip(content, { requireAnswers: false });
      return { file, content };
    }

    async function readMangaFile(fileName) {
      const file = safeMangaFileName(fileName);
      if (!file) throw new Error(`Invalid manga filename: ${String(fileName)}`);
      const response = await fetch(`../content/${file.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read ../content/${file} (${response.status}).`);
      const content = await response.json();
      validateManga(content, { requireAnswers: false });
      return { file, content };
    }

    function answerKeysFromEditor() {
      if (!clipAnswerKeys.value.trim()) return {};
      const answerKeys = JSON.parse(clipAnswerKeys.value);
      if (!answerKeys || typeof answerKeys !== "object" || Array.isArray(answerKeys)) {
        throw new Error("Clip answer keys must be a JSON object.");
      }
      return answerKeys;
    }

    function mangaAnswerKeysFromEditor() {
      if (!mangaAnswerKeys.value.trim()) return {};
      const answerKeys = JSON.parse(mangaAnswerKeys.value);
      if (!answerKeys || typeof answerKeys !== "object" || Array.isArray(answerKeys)) {
        throw new Error("Manga answer keys must be a JSON object.");
      }
      return answerKeys;
    }

    function safeFileName(value) {
      if (typeof value !== "string") return null;
      const fileName = value.replace(/^content\//, "");
      return /^[a-z0-9_-]+\.json$/i.test(fileName) ? fileName : null;
    }

    function assignedCodes(assignment) {
      if (assignment && typeof assignment.assignedTo === "string") return [assignment.assignedTo];
      if (Array.isArray(assignment && assignment.assignedTo)) {
        return assignment.assignedTo.filter(value => typeof value === "string");
      }
      if (assignment && assignment.assignedTo && typeof assignment.assignedTo === "object") {
        return Object.keys(assignment.assignedTo).filter(code => assignment.assignedTo[code] === true);
      }
      return [];
    }

    function studentView(lessonId, assignment, classworkFile, homeworkFile, student) {
      const fields = [
        "title", "description", "sub", "eyebrow", "headline", "intro", "stages", "maxScore",
        "year", "month", "order", "homework", "homeworkDue", "customUrl",
        "contentUrl", "classworkContentUrl", "homeworkContentUrl", "parentId",
        "published", "icon", "audience", "flashcardImages", "clipId", "features", "mangaId",
        "availableFrom", "dueAt", "closesAt"
      ];
      const view = { id: lessonId };
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(assignment, field)) view[field] = assignment[field];
      }
      if (view.features && view.features.mangaReader === true) {
        const target = String(assignment.mangaFeatureFor || "").trim().toLocaleLowerCase();
        const studentName = String(student && student.name || "").trim().toLocaleLowerCase().split(/\s+/)[0];
        if (!target || target !== studentName) {
          view.features = { ...view.features, mangaReader: false };
          delete view.mangaId;
        }
      }
      if (classworkFile) view.classworkContentUrl = `content/${classworkFile}`;
      if (homeworkFile) view.homeworkContentUrl = `content/${homeworkFile}`;
      // update() ignores missing keys, so clear schedule fields the teacher removed.
      for (const field of ["availableFrom", "dueAt", "closesAt"]) {
        if (!Number.isFinite(Number(view[field])) || view[field] === null || view[field] === "") view[field] = null;
      }
      if (view.published === undefined) view.published = true;
      return view;
    }

    async function readContentFile(fileName) {
      const file = safeFileName(fileName);
      if (!file) throw new Error(`Invalid content filename: ${String(fileName)}`);
      const response = await fetch(`../content/${encodeURIComponent(file)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read ../content/${file} (${response.status}).`);
      const content = await response.json();
      if (!content || typeof content !== "object") throw new Error(`${file} does not contain a JSON object.`);
      return { file, content };
    }

    async function writeIfMissing(path, value) {
      const result = await database.ref(path).transaction(current => current === null ? value : undefined);
      return result.committed;
    }

    async function importContent() {
      if (!await isTeacher(auth.currentUser, database)) throw new Error("An authorized teacher account is required.");
      importButton.disabled = true;
      setStatus("Reading manifest and current curriculum assignments…");

      const [manifestResponse, curriculumSnapshot, studentsSnapshot, existingViewsSnapshot] = await Promise.all([
        fetch("../content/manifest.json", { cache: "no-store" }),
        database.ref("curriculum").once("value"),
        database.ref("students").once("value"),
        database.ref("studentCurriculum").once("value")
      ]);
      if (!manifestResponse.ok) throw new Error(`Could not load content manifest (${manifestResponse.status}).`);
      const manifest = await manifestResponse.json();
      const answerKeys = answerKeysFromEditor();
      const mangaAnswers = mangaAnswerKeysFromEditor();
      const curriculum = curriculumSnapshot.val() || {};
      const students = studentsSnapshot.val() || {};
      const existingViews = existingViewsSnapshot.val() || {};
      let imported = 0;
      let preserved = 0;
      let studentViews = 0;
      const lessonIds = new Set([...Object.keys(manifest), ...Object.keys(curriculum)]);

      for (const lessonId of lessonIds) {
        const entry = manifest[lessonId] || {};
        if (!/^[a-zA-Z0-9_-]+$/.test(lessonId) || typeof entry !== "object") {
          throw new Error(`Invalid manifest entry: ${lessonId}`);
        }
        const assignment = curriculum[lessonId] || {};
        const contentUrl = String(assignment.contentUrl || "").replace(/^content\//, "");
        const classworkUrl = assignment.classworkContentUrl ||
          (/^homework_[a-z0-9_-]+\.json$/i.test(contentUrl) ? null : assignment.contentUrl);
        const classworkName = safeFileName(classworkUrl || entry.classworkFile);
        const homeworkCandidate = assignment.homeworkContentUrl ||
          (/^homework_[a-z0-9_-]+\.json$/i.test(String(assignment.contentUrl || "").replace(/^content\//, ""))
            ? assignment.contentUrl
            : entry.homeworkFile);

        for (const [kind, name] of [["classwork", classworkName], ["homework", homeworkCandidate]]) {
          if (!name) continue;
          const record = await readContentFile(name);
          const inserted = await writeIfMissing(`protectedContent/${lessonId}/${kind}`, {
            sourceFile: record.file,
            content: record.content,
            importedAt: new Date().toISOString()
          });
          if (inserted) imported += 1;
          else preserved += 1;
        }

        const clipName = safeClipFileName(entry.clipFile);
        if (entry.clipFile !== undefined && !clipName) {
          throw new Error(`Invalid clip filename for ${lessonId}: ${String(entry.clipFile)}`);
        }
        if (clipName) {
          const clipRecord = await readClipFile(clipName);
          if (entry.clipId !== clipRecord.content.id) {
            throw new Error(`Clip ID in the manifest does not match ${clipName}.`);
          }
          const protectedClip = addProtectedClipAnswers(clipRecord.content, answerKeys[clipRecord.content.id]);
          const inserted = await writeIfMissing(`protectedContent/${lessonId}/clip`, {
            sourceFile: clipRecord.file,
            content: protectedClip,
            importedAt: new Date().toISOString()
          });
          if (inserted) imported += 1;
          else preserved += 1;
        }

        const mangaName = safeMangaFileName(entry.mangaFile);
        if (entry.mangaFile !== undefined && !mangaName) {
          throw new Error(`Invalid manga filename for ${lessonId}: ${String(entry.mangaFile)}`);
        }
        if (mangaName) {
          const mangaRecord = await readMangaFile(mangaName);
          if (entry.mangaId !== mangaRecord.content.id) {
            throw new Error(`Manga ID in the manifest does not match ${mangaName}.`);
          }
          const protectedManga = addProtectedMangaAnswers(
            mangaRecord.content,
            mangaAnswers[mangaRecord.content.id]
          );
          const inserted = await writeIfMissing(`protectedContent/${lessonId}/manga`, {
            sourceFile: mangaRecord.file,
            content: protectedManga,
            importedAt: new Date().toISOString()
          });
          if (inserted) imported += 1;
          else preserved += 1;
        }

        if (!curriculum[lessonId]) continue;
        const assigned = assignment.published === false ? [] : assignment.audience === "all"
          ? Object.keys(students)
          : assignedCodes(assignment);
        const assignedSet = new Set(assigned);
        for (const code of Object.keys(existingViews)) {
          if (existingViews[code] && existingViews[code][lessonId] && !assignedSet.has(code)) {
            await database.ref(`studentCurriculum/${code}/${lessonId}`).update({ published: false });
          }
        }
        for (const code of assigned) {
          if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error(`Invalid assigned student code for ${lessonId}.`);
          if (!students[code]) throw new Error(`Student record is missing for assigned code ${code}.`);
          const studentAssignment = {
            ...entry,
            ...assignment,
            features: { ...(entry.features || {}), ...(assignment.features || {}) }
          };
          await database.ref(`studentCurriculum/${code}/${lessonId}`).update(studentView(
            lessonId,
            studentAssignment,
            classworkName,
            safeFileName(homeworkCandidate),
            students[code]
          ));
          studentViews += 1;
        }
      }

      for (const [code, views] of Object.entries(existingViews)) {
        for (const lessonId of Object.keys(views || {})) {
          if (!lessonIds.has(lessonId)) {
            await database.ref(`studentCurriculum/${code}/${lessonId}`).update({ published: false });
          }
        }
      }

      setStatus(`Migration finished.\nNew protected records: ${imported}\nExisting protected records preserved: ${preserved}\nStudent lesson views created or refreshed: ${studentViews}\n\nVerify assigned content in the student portal before removing any public JSON files.`);
      clipAnswerKeys.value = "";
      mangaAnswerKeys.value = "";
      importButton.disabled = false;
    }

    async function updateClips() {
      if (!await isTeacher(auth.currentUser, database)) throw new Error("An authorized teacher account is required.");
      updateClipsButton.disabled = true;
      const response = await fetch("../content/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load content manifest (${response.status}).`);
      const manifest = await response.json();
      const answerKeys = answerKeysFromEditor();
      let updated = 0;
      for (const [lessonId, entry] of Object.entries(manifest)) {
        if (!entry || !entry.clipFile) continue;
        if (!/^[a-zA-Z0-9_-]+$/.test(lessonId)) throw new Error(`Invalid lesson ID: ${lessonId}`);
        const clipName = safeClipFileName(entry.clipFile);
        if (!clipName) throw new Error(`Invalid clip filename for ${lessonId}.`);
        const record = await readClipFile(clipName);
        if (entry.clipId !== record.content.id) throw new Error(`Clip ID does not match ${clipName}.`);
        const content = addProtectedClipAnswers(record.content, answerKeys[record.content.id]);
        await database.ref(`protectedContent/${lessonId}/clip`).set({
          sourceFile: record.file,
          content,
          updatedAt: new Date().toISOString()
        });
        updated += 1;
      }
      clipAnswerKeys.value = "";
      setStatus(`Saved ${updated} Clip Lab record(s). Classwork, homework and student assignments were not changed.`);
      updateClipsButton.disabled = false;
    }

    async function updateManga() {
      if (!await isTeacher(auth.currentUser, database)) throw new Error("An authorized teacher account is required.");
      updateMangaButton.disabled = true;
      const response = await fetch("../content/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load content manifest (${response.status}).`);
      const manifest = await response.json();
      const answerKeys = mangaAnswerKeysFromEditor();
      let updated = 0;
      for (const [lessonId, entry] of Object.entries(manifest)) {
        if (!entry || !entry.mangaFile) continue;
        if (!/^[a-zA-Z0-9_-]+$/.test(lessonId)) throw new Error(`Invalid lesson ID: ${lessonId}`);
        const mangaName = safeMangaFileName(entry.mangaFile);
        if (!mangaName) throw new Error(`Invalid manga filename for ${lessonId}.`);
        const record = await readMangaFile(mangaName);
        if (entry.mangaId !== record.content.id) throw new Error(`Manga ID does not match ${mangaName}.`);
        const content = addProtectedMangaAnswers(record.content, answerKeys[record.content.id]);
        await database.ref(`protectedContent/${lessonId}/manga`).set({
          sourceFile: record.file,
          content,
          updatedAt: new Date().toISOString()
        });
        updated += 1;
      }
      mangaAnswerKeys.value = "";
      setStatus(`Saved ${updated} Manga Reader record(s). Classwork, homework and assignments were not changed.`);
      updateMangaButton.disabled = false;
    }

    async function signInAsTeacher() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithPopup(provider);
      } catch (error) {
        if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
          await auth.signInWithRedirect(provider);
          return;
        }
        throw error;
      }
    }

    try {
      firebase.initializeApp(firebaseConfig);
      database = firebase.database();
      auth = firebase.auth();
      await auth.getRedirectResult();
      auth.onAuthStateChanged(async user => {
        try {
          teacherAllowed = await isTeacher(user, database);
          importButton.disabled = !teacherAllowed;
          updateClipsButton.disabled = !teacherAllowed;
          updateMangaButton.disabled = !teacherAllowed;
          signInButton.disabled = teacherAllowed;
          setStatus(teacherAllowed ? `Signed in as ${user.email}.` : "Sign in with an authorized teacher account.");
        } catch (error) {
          teacherAllowed = false;
          importButton.disabled = true;
          updateClipsButton.disabled = true;
          updateMangaButton.disabled = true;
          signInButton.disabled = false;
          setStatus(`Teacher authorization check failed: ${error.message}`);
        }
      });
    } catch (error) {
      setStatus(`Firebase initialization failed: ${error.message}`);
    }

    signInButton.addEventListener("click", () => {
      signInAsTeacher().catch(error => setStatus(`Teacher sign-in failed: ${error.message}`));
    });
    importButton.addEventListener("click", () => {
      if (!confirm("Import only missing protected content and copy assignment links? Existing protected content and curriculum records will not be overwritten.")) return;
      importContent().catch(error => {
        importButton.disabled = !teacherAllowed;
        setStatus(`Import failed: ${error.message}`);
      });
    });
    updateClipsButton.addEventListener("click", () => {
      if (!confirm("Replace the protected Clip Lab records for the clips listed in the manifest? This does not change classwork, homework, or assignments.")) return;
      updateClips().catch(error => {
        updateClipsButton.disabled = !teacherAllowed;
        setStatus(`Clip update failed: ${error.message}`);
      });
      updateMangaButton.addEventListener("click", () => {
        if (!confirm("Replace the protected Manga Reader records listed in the manifest? This does not change classwork, homework, or assignments.")) return;
        updateManga().catch(error => {
          updateMangaButton.disabled = !teacherAllowed;
          setStatus(`Manga update failed: ${error.message}`);
        });
      });
    });

    validateClipButton.addEventListener("click", () => {
      try {
        const draft = JSON.parse(clipDraft.value);
        validateClip(draft, { requireAnswers: false });
        downloadClipButton.disabled = false;
        clipAuthorStatus.textContent = `Valid draft: ${draft.id}. Correct answers are intentionally not stored here.`;
      } catch (error) {
        downloadClipButton.disabled = true;
        clipAuthorStatus.textContent = `Draft invalid: ${error.message}`;
      }
    });

    downloadClipButton.addEventListener("click", () => {
      try {
        const draft = JSON.parse(clipDraft.value);
        validateClip(draft, { requireAnswers: false });
        const blob = new Blob([JSON.stringify(draft, null, 2) + "\n"], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${draft.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        downloadClipButton.disabled = true;
        clipAuthorStatus.textContent = `Could not download draft: ${error.message}`;
      }
    });

    validateMangaButton.addEventListener("click", () => {
      try {
        const draft = JSON.parse(mangaDraft.value);
        validateManga(draft, { requireAnswers: false });
        downloadMangaButton.disabled = false;
        mangaAuthorStatus.textContent = `Valid manga draft: ${draft.id}. Correct answers are intentionally not stored here.`;
      } catch (error) {
        downloadMangaButton.disabled = true;
        mangaAuthorStatus.textContent = `Manga draft invalid: ${error.message}`;
      }
    });

    downloadMangaButton.addEventListener("click", () => {
      try {
        const draft = JSON.parse(mangaDraft.value);
        validateManga(draft, { requireAnswers: false });
        const blob = new Blob([JSON.stringify(draft, null, 2) + "\n"], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${draft.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        downloadMangaButton.disabled = true;
        mangaAuthorStatus.textContent = `Could not download manga draft: ${error.message}`;
      }
    });
  

if (typeof setStatus === "function") globalThis["setStatus"] = setStatus;
if (typeof safeClipFileName === "function") globalThis["safeClipFileName"] = safeClipFileName;
if (typeof safeMangaFileName === "function") globalThis["safeMangaFileName"] = safeMangaFileName;
if (typeof isTeacher === "function") globalThis["isTeacher"] = isTeacher;
if (typeof readClipFile === "function") globalThis["readClipFile"] = readClipFile;
if (typeof readMangaFile === "function") globalThis["readMangaFile"] = readMangaFile;
if (typeof answerKeysFromEditor === "function") globalThis["answerKeysFromEditor"] = answerKeysFromEditor;
if (typeof mangaAnswerKeysFromEditor === "function") globalThis["mangaAnswerKeysFromEditor"] = mangaAnswerKeysFromEditor;
if (typeof safeFileName === "function") globalThis["safeFileName"] = safeFileName;
if (typeof assignedCodes === "function") globalThis["assignedCodes"] = assignedCodes;
if (typeof studentView === "function") globalThis["studentView"] = studentView;
if (typeof readContentFile === "function") globalThis["readContentFile"] = readContentFile;
if (typeof writeIfMissing === "function") globalThis["writeIfMissing"] = writeIfMissing;
if (typeof importContent === "function") globalThis["importContent"] = importContent;
if (typeof updateClips === "function") globalThis["updateClips"] = updateClips;
if (typeof updateManga === "function") globalThis["updateManga"] = updateManga;
if (typeof signInAsTeacher === "function") globalThis["signInAsTeacher"] = signInAsTeacher;
