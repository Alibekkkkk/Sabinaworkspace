function keyFor(context, name) {
  if (!context || !context.code || !context.lessonId) {
    throw new Error("Verified student context is required for storage access.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid storage key name.");
  return `${context.storageNamespace}:${name}`;
}

export function readStudentValue(context, name) {
  const key = keyFor(context, name);
  const value = localStorage.getItem(key);
  return value === null ? null : JSON.parse(value);
}

export function writeStudentValue(context, name, value) {
  localStorage.setItem(keyFor(context, name), JSON.stringify(value));
}

export function removeStudentValue(context, name) {
  localStorage.removeItem(keyFor(context, name));
}

export function migrateLegacyValue(context, name, legacyKey, verifiedOwnerCode) {
  if (verifiedOwnerCode !== context.code) return false;
  const key = keyFor(context, name);
  if (localStorage.getItem(key) !== null || localStorage.getItem(`${key}:migrated`) === "true") return false;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue === null) return false;
  localStorage.setItem(key, legacyValue);
  localStorage.setItem(`${key}:migrated`, "true");
  localStorage.removeItem(legacyKey);
  localStorage.removeItem("nd_state_owner_code");
  return true;
}

export function clearStudentStorage() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith("nd:")) localStorage.removeItem(key);
  }
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key && key.startsWith("nd_")) sessionStorage.removeItem(key);
  }
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith("nd_")) localStorage.removeItem(key);
  }
}
