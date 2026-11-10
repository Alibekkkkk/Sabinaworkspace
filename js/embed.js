// Pages that also run inside a lesson section (Games = practice.html, Listening Training = listening.html).
// With ?embed=1 inside a frame of this site, the page hides its own header links, theme toggle, language picker and tab bar,
// and tells the lesson when a round is finished so the lesson can mark the section done.
// With ?teacher=1 the page opens as a read-only teacher preview: it never writes the student's progress.
import { isTeacher } from "./auth.js";
import { resolveStudentContext } from "./student-context.js";

const query = new URLSearchParams(location.search);
let inFrame = false;
try { inFrame = window.parent !== window && window.parent.location.origin === location.origin; } catch (error) { inFrame = false; }

export const EMBEDDED = query.get("embed") === "1" && inFrame;
export const TEACHER_PREVIEW = query.get("teacher") === "1";
if (EMBEDDED) document.documentElement.classList.add("is-embedded");

// type: "section-complete" with { section: "games" | "listening", score, total }.
export function notifyLesson(type, detail = {}) {
  if (!EMBEDDED) return;
  window.parent.postMessage({ source: "learning-studio", type, ...detail }, location.origin);
}

function currentUser(auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => { const stop = auth.onAuthStateChanged(user => { stop(); resolve(user); }); });
}

// The student context for a page, or, in a teacher preview, a read-only context for the student code in the address.
export async function resolvePageContext({ auth, db, lessonId }) {
  if (!TEACHER_PREVIEW) return resolveStudentContext({ auth, db, lessonId });
  const user = await currentUser(auth);
  if (!(await isTeacher(user, db))) throw new Error("Teacher sign-in required for a preview.");
  const code = String(query.get("code") || "").toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error("The preview needs a student code.");
  const resolvedLessonId = lessonId || query.get("lesson");
  if (!resolvedLessonId) throw new Error("A lesson must be selected.");
  const snapshot = await db.ref(`students/${code}/name`).once("value").catch(() => null);
  return Object.freeze({ code, uid: user.uid, name: String((snapshot && snapshot.val()) || "Student"), lessonId: resolvedLessonId, contentId: resolvedLessonId, storageNamespace: `nd:preview:${code}:${resolvedLessonId}`, preview: true });
}
