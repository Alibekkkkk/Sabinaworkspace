// Which listening set belongs to a lesson. The manifest is keyed by content name (sabina, george …) and by some lesson ids,
// but most lessons in the database have generated ids (lesson_1792346167287). So: the lesson id's own entry if it names a
// set; otherwise the entry whose classwork file is the lesson's content file (from the protected copy or the curriculum).
const fileName = value => String(value || "").replace(/^.*\//, "");

export function listeningEntryFor(manifest, lessonId, contentFile = "") {
  if (!manifest || typeof manifest !== "object") return null;
  const own = manifest[lessonId];
  if (own && own.listeningFile) return own;
  const file = fileName(contentFile);
  if (!file) return null;
  return Object.values(manifest).find(entry => entry && entry.listeningFile && fileName(entry.classworkFile) === file) || null;
}
