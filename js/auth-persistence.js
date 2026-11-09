// Chooses how long the sign-in lasts: on this device (remember me), for this tab, or, when the browser blocks storage completely,
// for this page only. Firebase throws when it cannot write to storage, which used to stop sign-in dead; now it falls back one step.
export async function applyPersistence(auth, persistent, persistence = globalThis.firebase && globalThis.firebase.auth.Auth.Persistence) {
  for (const mode of [persistent ? persistence.LOCAL : persistence.SESSION, persistence.NONE]) {
    try { await auth.setPersistence(mode); return mode; } catch (error) { /* try the next, weaker option */ }
  }
  return null;
}
