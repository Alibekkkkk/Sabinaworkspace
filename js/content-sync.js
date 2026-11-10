// Comparing a lesson file with the protected copy stored in the database, for the import tool's "Check for lesson updates".
// The database stores objects with sorted keys and drops empty lists, empty objects and nulls, so both sides are brought to
// the same canonical form before they are compared. Pure functions: no DOM, no Firebase.

export function canonical(value) {
  if (Array.isArray(value)) {
    const items = value.map(canonical).filter(item => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map(key => [key, canonical(value[key])]).filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value === null || value === undefined ? undefined : value;
}

export const sameContent = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// Which classwork and homework files belong to a lesson: the curriculum assignment's own links first, then the manifest.
const SAFE_FILE = /^[a-z0-9_-]+\.json$/i;
export function lessonFiles(entry = {}, assignment = {}) {
  const strip = value => String(value || "").replace(/^content\//, "");
  const contentUrl = strip(assignment.contentUrl);
  const isHomework = name => /^homework_[a-z0-9_-]+\.json$/i.test(name);
  const classwork = strip(assignment.classworkContentUrl || (isHomework(contentUrl) ? "" : contentUrl) || entry.classworkFile);
  const homework = strip(assignment.homeworkContentUrl || (isHomework(contentUrl) ? contentUrl : "") || entry.homeworkFile);
  return { classwork: SAFE_FILE.test(classwork) ? classwork : null, homework: SAFE_FILE.test(homework) ? homework : null };
}

// One row per lesson copy: "new" (no copy yet), "changed" (the file differs) or "same".
export function compareCopy(lessonId, kind, file, fileContent, record) {
  const status = !record || !record.content ? "new" : sameContent(fileContent, record.content) ? "same" : "changed";
  return { lessonId, kind, file, status };
}
