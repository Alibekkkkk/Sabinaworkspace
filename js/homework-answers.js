// Answers are stored under the question's stable id (never its position), so reordering or
// inserting questions cannot attach a student's answer to the wrong question. Realtime Database
// keys cannot contain ".", so the id is mapped onto the [A-Za-z0-9_-] alphabet the rules allow.
export function answerKey(question, index) {
  const id = question && typeof question.id === "string"
    ? question.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)
    : "";
  return id || `q${index}`;
}

// Records written before stable keys stored answers under the question index ("0", "1", ...).
// Returns a new object keyed by answerKey(); never mutates the stored record.
export function migrateLegacyAnswerKeys(stored, questions) {
  const migrated = { ...(stored || {}) };
  questions.forEach((question, index) => {
    const key = answerKey(question, index);
    const legacy = String(index);
    if (migrated[key] === undefined && migrated[legacy] !== undefined) migrated[key] = migrated[legacy];
    if (key !== legacy) delete migrated[legacy];
  });
  return migrated;
}
