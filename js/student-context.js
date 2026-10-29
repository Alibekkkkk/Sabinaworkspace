function getAuthUser(auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = auth.onAuthStateChanged(
      user => {
        unsubscribe();
        resolve(user);
      },
      error => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

async function ensureSignedIn(auth) {
  const user = await getAuthUser(auth);
  if (user) return user;
  const credential = await auth.signInAnonymously();
  if (!credential.user) throw new Error("Anonymous sign-in did not return a user.");
  return credential.user;
}

export async function bindStudentCode({ auth, db, code } = {}) {
  if (!auth || !db) throw new Error("Firebase Auth and Database are required.");
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(normalizedCode)) throw new Error("A valid student code is required.");
  const user = await ensureSignedIn(auth);
  const studentRef = db.ref(`students/${normalizedCode}`);
  const studentSnapshot = await studentRef.once("value");
  const student = studentSnapshot.val();
  if (!student || typeof student !== "object" || (student.uid && student.uid !== user.uid)) {
    throw new Error("Student code is invalid or already linked to another account.");
  }

  const uidRef = db.ref(`studentByUid/${user.uid}`);
  const existingCode = await uidRef.once("value");
  if (existingCode.exists() && existingCode.val() !== normalizedCode) {
    throw new Error("This sign-in is already linked to another student code.");
  }
  const uidResult = await uidRef.transaction(current => {
    if (current === null) return normalizedCode;
    return current === normalizedCode ? current : undefined;
  });
  if (!uidResult.committed) throw new Error("This sign-in is already linked to another student code.");

  let result;
  try {
    result = await studentRef.transaction(current => {
      if (!current || typeof current !== "object" || (current.uid && current.uid !== user.uid)) return;
      return { ...current, uid: user.uid };
    });
  } catch (error) {
    await rollbackUidBinding(uidRef, normalizedCode, error);
    throw error;
  }
  if (!result.committed || !result.snapshot.exists()) {
    await rollbackUidBinding(uidRef, normalizedCode);
    throw new Error("Student code is invalid or already linked to another account.");
  }
  return { code: normalizedCode, uid: user.uid, student: result.snapshot.val() };
}

async function rollbackUidBinding(uidRef, code, cause) {
  try {
    await uidRef.transaction(current => current === code ? null : undefined);
  } catch (rollbackError) {
    const message = "Student binding failed and the UID mapping could not be rolled back.";
    if (cause) throw new AggregateError([cause, rollbackError], message);
    throw new Error(`${message} ${rollbackError.message}`);
  }
}

function codeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const remembered = localStorage.getItem("nd_remember_student") === "true";
  const storage = remembered ? localStorage : sessionStorage;
  return (params.get("code") || storage.getItem("nd_student_code") || "")
    .trim()
    .toUpperCase();
}

export async function resolveStudentContext({ auth, db, lessonId, contentId } = {}) {
  if (!auth || !db) throw new Error("Firebase Auth and Database are required.");

  const code = codeFromLocation();
  const bound = await bindStudentCode({ auth, db, code });
  const { student, uid } = bound;
  if (student.uid !== uid) throw new Error("Student account verification failed.");

  const previousCode = sessionStorage.getItem("nd_student_code");
  if (previousCode && previousCode !== code) {
    sessionStorage.removeItem("nd_student_name");
    sessionStorage.removeItem("nd_student_code");
  }
  sessionStorage.setItem("nd_student_code", code);
  sessionStorage.setItem("nd_student_name", String(student.name || "Student"));

  const resolvedLessonId = lessonId || new URLSearchParams(window.location.search).get("lesson");
  if (!resolvedLessonId) throw new Error("A lesson must be selected.");

  return Object.freeze({
    code,
    uid,
    name: String(student.name || "Student"),
    lessonId: resolvedLessonId,
    contentId: contentId || new URLSearchParams(window.location.search).get("content") || resolvedLessonId,
    storageNamespace: `nd:v2:${code}:${resolvedLessonId}`
  });
}
