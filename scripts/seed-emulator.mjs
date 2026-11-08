// Fills the LOCAL Firebase emulators (Realtime Database + Auth) with demo data so every page can be
// opened and tested without production data:
//   - one teacher (e-mail/password sign-in on the dashboard; credentials are the constants below)
//   - three demo students with codes DEMOA001, DEMOB002, DEMOC003 (sign in on the portal with the code)
//   - classwork, homework and clip content copied from content/, assigned per student with schedules
//     (open, due soon, overdue, and locked until a future date)
//   - sample progress: session state, summaries, XP, a saved placement result
// Run through `npm run dev`, or on its own against running emulators: `node scripts/seed-emulator.mjs`.
// It refuses to run against anything that is not a local emulator.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_STAGES } from "../js/lesson-meta.js";

export const DEMO_TEACHER = { email: "teacher@example.test", password: "demo-password-1" };
export const DEMO_STUDENTS = [
  { code: "DEMOA001", name: "Demo Anna", lessonId: "sabina", homeworkId: "homework_sabina_natural_disasters" },
  { code: "DEMOB002", name: "Demo Boris", lessonId: "abay", homeworkId: null },
  { code: "DEMOC003", name: "Demo Chen", lessonId: "george", homeworkId: null }
];

const root = new URL("../", import.meta.url);
const DAY = 86400000;

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

function assertLocal(host) {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error(`Refusing to seed "${host}": only local emulators are allowed.`);
}

export async function seedEmulator({
  databaseHost = "127.0.0.1:9000",
  authHost = "127.0.0.1:9099",
  namespace = "sabina-s-workspace-default-rtdb",
  log = console.log
} = {}) {
  assertLocal(databaseHost);
  assertLocal(authHost);
  const now = Date.now();

  async function put(path, value) {
    const response = await fetch(`http://${databaseHost}/${path}.json?ns=${namespace}`, {
      method: "PUT",
      headers: { Authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify(value)
    });
    if (!response.ok) throw new Error(`Seeding ${path} failed: ${response.status} ${await response.text()}`);
  }

  async function createTeacher() {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DEMO_TEACHER, returnSecureToken: true })
    });
    const body = await response.json();
    if (body.localId) return body.localId;
    // Already created by an earlier run of the same emulator session: sign in to learn the uid.
    const signIn = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DEMO_TEACHER, returnSecureToken: true })
    });
    const existing = await signIn.json();
    if (!existing.localId) throw new Error(`Could not create the demo teacher: ${JSON.stringify(body)}`);
    return existing.localId;
  }

  const manifest = await readJson("content/manifest.json");
  const teacherUid = await createTeacher();
  await put(`admins/${teacherUid}`, true);
  log(`Teacher ready (${DEMO_TEACHER.email}).`);

  const placementItems = (await readJson("content/placement/items.json")).items;

  for (const [index, student] of DEMO_STUDENTS.entries()) {
    const entry = manifest[student.lessonId];
    if (!entry) throw new Error(`content/manifest.json has no "${student.lessonId}" entry.`);
    await put(`students/${student.code}`, { code: student.code, name: student.name, createdAt: now - 14 * DAY, approved: true });

    // Schedules: Anna's lesson is open and her homework is due in two days, Boris's lesson is overdue,
    // Chen's lesson is locked for three days (and cannot be read from the database until then).
    const schedule = [{ availableFrom: now - DAY, dueAt: now + 2 * DAY }, { availableFrom: now - 7 * DAY, dueAt: now - DAY }, { availableFrom: now + 3 * DAY, dueAt: now + 10 * DAY }][index];
    const lesson = {
      id: student.lessonId, title: `Demo lesson: ${student.name}`, description: "Seeded classwork for local testing.", icon: "📘",
      stages: DEFAULT_STAGES, published: true, audience: "assigned", assignedTo: [student.code], order: index + 1,
      year: "2026", month: "November", classworkContentUrl: `content/${entry.classworkFile}`, ...schedule,
      ...(entry.clipId ? { clipId: entry.clipId } : {})
    };
    await put(`curriculum/${student.lessonId}`, lesson);
    await put(`studentCurriculum/${student.code}/${student.lessonId}`, lesson);
    await put(`protectedContent/${student.lessonId}/classwork`, { sourceFile: entry.classworkFile, content: await readJson(`content/${entry.classworkFile}`) });
    if (entry.clipFile) await put(`protectedContent/${student.lessonId}/clip`, { sourceFile: entry.clipFile, content: await readJson(`content/${entry.clipFile}`) });

    if (student.homeworkId) {
      const homeworkEntry = manifest[student.homeworkId] || entry;
      const homeworkFile = homeworkEntry.homeworkFile || entry.homeworkFile;
      const homework = {
        id: student.homeworkId, title: `Demo homework: ${student.name}`, description: "Seeded homework for local testing.", icon: "📌", homework: true,
        customUrl: "homework.html", homeworkContentUrl: `content/${homeworkFile}`, parentId: student.lessonId, published: true, audience: "assigned",
        assignedTo: [student.code], order: index + 10, year: "2026", month: "November", availableFrom: now - DAY, dueAt: now + 2 * DAY
      };
      await put(`curriculum/${student.homeworkId}`, homework);
      await put(`studentCurriculum/${student.code}/${student.homeworkId}`, homework);
      await put(`protectedContent/${student.homeworkId}/homework`, { sourceFile: homeworkFile, content: await readJson(`content/${homeworkFile}`) });
    }

    const xp = [240, 120, 60][index];
    await put(`sessions/${student.code}/state`, { stage: 3, score: [35, 20, 5][index], streak: [2, 1, 0][index], elapsed: 900, lastUpdate: now - 3600000, done: { [`${student.lessonId}_1`]: true, [`${student.lessonId}_2`]: index === 0 } });
    await put(`sessionSummary/${student.code}`, { score: [35, 20, 5][index], stage: 3, streak: [2, 1, 0][index], elapsed: 900, doneCount: index === 0 ? 2 : 1, lastUpdate: now - 3600000 });
    await put(`studentProgress/${student.code}`, {
      xp, level: Math.floor(xp / 100) + 1, gems: 5 + index * 3, hearts: 5, streak: [2, 1, 0][index], lastActivityDate: new Date(now).toISOString().slice(0, 10),
      ...(index === 0 ? { placement: { takenAt: now - 2 * DAY, cefr: "B1", confidence: 0.82, durationMs: 540000, answers: placementItems.slice(0, 18).map((item, position) => ({ id: item.id, correct: position % 5 !== 4 })) } } : {})
    });
  }
  log(`Seeded ${DEMO_STUDENTS.length} students: ${DEMO_STUDENTS.map(student => student.code).join(", ")}.`);
  return { teacherUid };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedEmulator().then(() => console.log("Done.")).catch(error => { console.error(error.message); process.exit(1); });
}
