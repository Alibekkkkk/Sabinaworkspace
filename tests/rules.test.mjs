import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";

const projectId = "sabinaworkspace-rules-test";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    database: { rules: await readFile(new URL("../database.rules.json", import.meta.url), "utf8") }
  });
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "students/A111111"), { uid: "student-a", name: "A" });
    await set(ref(db, "students/B222222"), { uid: "student-b", name: "B" });
    await set(ref(db, "studentByUid/student-a"), "A111111");
    await set(ref(db, "studentByUid/student-b"), "B222222");
    await set(ref(db, "curriculum/lesson-a"), {
      title: "Lesson A",
      contentData: { answerKey: "not for students" }
    });
    await set(ref(db, "studentCurriculum/A111111/lesson-a"), {
      title: "Lesson A",
      features: { mangaReader: true }
    });
    await set(ref(db, "studentCurriculum/B222222/lesson-a"), { title: "Lesson A" });
    await set(ref(db, "protectedContent/lesson-a/classwork"), {
      sourceFile: "lesson-a.json",
      content: { title: "Lesson A" }
    });
    await set(ref(db, "protectedContent/lesson-a/clip"), {
      sourceFile: "clips/clip-a.json",
      content: { id: "clip-a" }
    });
    await set(ref(db, "protectedContent/lesson-a/manga"), {
      sourceFile: "manga/gaziz-demo.json",
      content: { id: "gaziz-demo" }
    });
    await set(ref(db, "protectedContent/lesson-b/classwork"), {
      sourceFile: "lesson-b.json",
      content: { title: "Lesson B" }
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test("student A cannot read or write student B's session", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertFails(get(ref(dbA, "sessions/B222222/state")));
  await assertFails(set(ref(dbA, "sessions/B222222/state"), { score: 1 }));
});

test("students can only read and write their own game progress", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111"), { xp: 15, level: 1 }));
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/vocabulary/verb"), { word: "verb" }));
  await assertSucceeds(get(ref(dbA, "studentProgress/A111111")));
  await assertSucceeds(get(ref(dbA, "studentProgress/A111111/vocabulary/verb")));
  await assertFails(get(ref(dbA, "studentProgress/B222222")));
  await assertFails(set(ref(dbA, "studentProgress/B222222"), { xp: 999999 }));
  await assertFails(set(ref(dbA, "studentProgress/B222222/vocabulary/verb"), { word: "verb" }));
  await assertFails(get(ref(dbA, "studentProgress")));
});

test("teachers can read game progress but cannot write student progress", async () => {
  const teacherDb = testEnv.authenticatedContext("teacher", {
    email: "alibek.alpysbayev@gmail.com",
    email_verified: true
  }).database();
  await assertSucceeds(get(ref(teacherDb, "studentProgress/A111111")));
  await assertFails(set(ref(teacherDb, "studentProgress/A111111"), { xp: 100 }));
});

test("students cannot list student records", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertFails(get(ref(dbA, "students")));
});

test("students can only read protected content assigned to their student code", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-a/classwork")));
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-a/clip")));
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-a/manga")));
  await assertFails(get(ref(dbA, "protectedContent/lesson-b/classwork")));
  await assertFails(get(ref(dbA, "protectedContent/lesson-b/clip")));
  await assertFails(get(ref(dbA, "protectedContent/lesson-b/manga")));
});

test("manga content requires its per-student feature flag", async () => {
  const dbB = testEnv.authenticatedContext("student-b").database();
  await assertSucceeds(get(ref(dbB, "protectedContent/lesson-a/classwork")));
  await assertFails(get(ref(dbB, "protectedContent/lesson-a/manga")));
});

test("students can only read their own curriculum view", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(get(ref(dbA, "studentCurriculum/A111111")));
  await assertFails(get(ref(dbA, "studentCurriculum/B222222")));
  await assertFails(get(ref(dbA, "studentCurriculum")));
  await assertFails(get(ref(dbA, "curriculum")));
});

test("submitted homework is write-once and score cannot exceed total", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const record = ref(dbA, "sessions/A111111/homework/task-1");
  await assertSucceeds(set(record, { score: 4, total: 5, submitted: false }));
  await assertSucceeds(update(record, { submitted: true, score: 5 }));
  await assertFails(update(record, { score: 0 }));
  await assertFails(set(ref(dbA, "sessions/A111111/homework/task-2"), {
    score: 6,
    total: 5,
    submitted: false
  }));
});
