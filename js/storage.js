import { safeLocal, safeSession } from "./safe-storage.js";
function keyFor(context, name) {
  if (!context || !context.code || !context.lessonId) {
    throw new Error("Verified student context is required for storage access.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid storage key name.");
  return `${context.storageNamespace}:${name}`;
}

export function readStudentValue(context, name) {
  const key = keyFor(context, name);
  const value = safeLocal.getItem(key);
  return value === null ? null : JSON.parse(value);
}

export function writeStudentValue(context, name, value) {
  safeLocal.setItem(keyFor(context, name), JSON.stringify(value));
}

export function removeStudentValue(context, name) {
  safeLocal.removeItem(keyFor(context, name));
}

export function migrateLegacyValue(context, name, legacyKey, verifiedOwnerCode) {
  if (verifiedOwnerCode !== context.code) return false;
  const key = keyFor(context, name);
  if (safeLocal.getItem(key) !== null || safeLocal.getItem(`${key}:migrated`) === "true") return false;
  const legacyValue = safeLocal.getItem(legacyKey);
  if (legacyValue === null) return false;
  safeLocal.setItem(key, legacyValue);
  safeLocal.setItem(`${key}:migrated`, "true");
  safeLocal.removeItem(legacyKey);
  safeLocal.removeItem("nd_state_owner_code");
  return true;
}

export function clearStudentStorage() {
  for (let index = safeLocal.length - 1; index >= 0; index -= 1) {
    const key = safeLocal.key(index);
    if (key && key.startsWith("nd:")) safeLocal.removeItem(key);
  }
  for (let index = safeSession.length - 1; index >= 0; index -= 1) {
    const key = safeSession.key(index);
    if (key && key.startsWith("nd_")) safeSession.removeItem(key);
  }
  for (let index = safeLocal.length - 1; index >= 0; index -= 1) {
    const key = safeLocal.key(index);
    if (key && key.startsWith("nd_")) safeLocal.removeItem(key);
  }
}
