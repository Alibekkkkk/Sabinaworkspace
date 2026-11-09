// Standalone whiteboard page. Students open it with their lesson link (?lesson=...); the teacher opens a student's
// board with ?code=STUDENTCODE&lesson=... while signed in as a teacher.
import { firebaseConfig } from "../config.js";
import { isTeacher } from "../auth.js";
import { resolveStudentContext } from "../student-context.js";
import { mountWhiteboard } from "../whiteboard/app.js";
import { featureEnabled, showNotEnabled } from "../feature-gate.js";

const query = new URLSearchParams(location.search);
const status = document.getElementById("status");

function currentUser(auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => { const stop = auth.onAuthStateChanged(user => { stop(); resolve(user); }); });
}

async function boot() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.database(); const auth = firebase.auth();
    const user = await currentUser(auth);
    const lessonId = query.get("lesson");
    if (!lessonId || !/^[A-Za-z0-9_-]{1,64}$/.test(lessonId)) throw new Error("Open the whiteboard from a lesson.");
    let role = "student"; let code; let uid; let name;
    if (user && await isTeacher(user, db)) {
      code = String(query.get("code") || "").toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error("Add ?code=STUDENTCODE to open a student's board.");
      role = "teacher"; uid = user.uid; name = "Teacher";
    } else {
      const context = await resolveStudentContext({ auth, db, lessonId });
      code = context.code; uid = context.uid; name = context.name;
      if (!(await featureEnabled(db, code, "whiteboard"))) { showNotEnabled(status, "whiteboard"); return; }
    }
    document.getElementById("pageTitle").textContent = role === "teacher" ? "Whiteboard · " + code : "Whiteboard";
    status.hidden = true;
    mountWhiteboard({ host: document.getElementById("whiteboardHost"), db, code, lessonId, uid, role, name, initialScope: query.get("board") === "personal" ? "personal" : "shared" });
    document.getElementById("wbBack").href = role === "teacher" ? "dashboard.html" : `portal.html`;
  } catch (error) {
    console.error(error);
    status.textContent = error && error.message ? error.message : "The whiteboard could not be opened.";
  }
}
boot();
