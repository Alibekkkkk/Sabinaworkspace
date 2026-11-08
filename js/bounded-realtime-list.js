const ENTRY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function appendBoundedRealtimeRecord(reference, record, limit = 100) {
  if (!reference || typeof reference.transaction !== "function" ||
      typeof reference.push !== "function") {
    throw new Error("A Realtime Database list reference is required.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("The bounded list limit must be between 1 and 100.");
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("A record object is required.");
  }

  const key = reference.push().key;
  if (!key || !ENTRY_KEY_PATTERN.test(key)) throw new Error("Could not create a valid record key.");
  const value = { ...record, ts: Number(record.ts) || Date.now() };
  const result = await reference.transaction(current => {
    const sortedEntries = current && typeof current === "object" && !Array.isArray(current)
      ? Object.entries(current)
        .filter(([entryKey, entry]) => ENTRY_KEY_PATTERN.test(entryKey) &&
          entry && typeof entry === "object" && Number.isFinite(Number(entry.ts)))
        .sort((a, b) => Number(a[1].ts) - Number(b[1].ts))
      : [];
    const entries = limit === 1 ? [] : sortedEntries.slice(-(limit - 1));
    return { ...Object.fromEntries(entries), [key]: value };
  });
  if (!result.committed) throw new Error("Could not append the bounded database record.");
  return result.snapshot;
}
