const CONTENT_KINDS = new Set(["classwork", "homework"]);

export async function loadProtectedContent(db, lessonId, kind) {
  if (!db) throw new Error("Firebase Database is required.");
  if (!/^[A-Za-z0-9_-]+$/.test(String(lessonId || ""))) {
    throw new Error("A valid lesson ID is required.");
  }
  if (!CONTENT_KINDS.has(kind)) throw new Error("Invalid protected content type.");

  const snapshot = await db.ref(`protectedContent/${lessonId}/${kind}`).once("value");
  if (!snapshot.exists()) {
    throw new Error(`Protected ${kind} content has not been imported for this lesson.`);
  }
  const record = snapshot.val();
  if (!record || typeof record !== "object" || !record.content || typeof record.content !== "object") {
    throw new Error("Protected content record is invalid.");
  }
  return record;
}
