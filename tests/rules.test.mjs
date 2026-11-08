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
    await set(ref(db, "students/U333333"), { code: "U333333", name: "Unlinked student" });
    await set(ref(db, "studentByUid/student-a"), "A111111");
    await set(ref(db, "studentByUid/student-b"), "B222222");
    await set(ref(db, "admins/teacher"), true);
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
  const teacherDb = testEnv.authenticatedContext("teacher").database();
  await assertSucceeds(get(ref(teacherDb, "studentProgress/A111111")));
  await assertSucceeds(get(ref(teacherDb, "students")));
  await assertSucceeds(get(ref(teacherDb, "sessions/B222222/state")));
  await assertFails(set(ref(teacherDb, "studentProgress/A111111"), { xp: 100 }));
});

test("admin identity is readable by its owner and cannot be changed by clients", async () => {
  const teacherDb = testEnv.authenticatedContext("teacher").database();
  const studentDb = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(get(ref(teacherDb, "admins/teacher")));
  await assertFails(get(ref(studentDb, "admins/teacher")));
  await assertFails(set(ref(studentDb, "admins/student-a"), true));
  await assertFails(set(ref(teacherDb, "admins/teacher"), false));
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

test("students can only update their own identity and registration records", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "studentByUid/student-a"), "A111111"));
  await assertFails(set(ref(dbA, "studentByUid/student-a"), "B222222"));
  await assertFails(set(ref(dbA, "studentByUid/student-a"), 111111));
  await assertFails(set(ref(dbA, "studentByUid/student-b"), "A111111"));

  await assertSucceeds(set(ref(dbA, "pendingStudents/student-a"), {
    name: "Student A",
    email: "student-a@example.test",
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "pendingStudents/student-a"), {
    name: "x".repeat(81),
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "pendingStudents/student-a"), "invalid"));
  await assertFails(set(ref(dbA, "pendingStudents/student-b"), {
    name: "Student A",
    ts: Date.now()
  }));

  await assertSucceeds(set(ref(dbA, "students/C333333"), {
    uid: "student-a",
    name: "Student A"
  }));
  await assertFails(set(ref(dbA, "students/B222222"), {
    uid: "student-a",
    name: "Student A"
  }));
  await assertFails(set(ref(dbA, "students/E555555"), {
    uid: "student-a",
    name: "x".repeat(81)
  }));
});

test("students can safely claim unlinked codes and register their own code", async () => {
  const dbC = testEnv.authenticatedContext("student-c").database();
  await assertSucceeds(set(ref(dbC, "studentByUid/student-c"), "U333333"));
  await assertSucceeds(update(ref(dbC, "students/U333333"), { uid: "student-c" }));

  const dbD = testEnv.authenticatedContext("student-d").database();
  await assertSucceeds(set(ref(dbD, "students/R555555"), {
    code: "R555555",
    name: "Registered student",
    uid: "student-d",
    createdAt: Date.now(),
    lastLogin: Date.now(),
    selfRegistered: true
  }));
  await assertSucceeds(set(ref(dbD, "studentByUid/student-d"), "R555555"));
});

test("student session writes require valid own-code state, draft, history, and annotations", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "sessions/A111111/state"), {
    stage: 1,
    score: 0,
    notes: "Started"
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/state"), { stage: "one" }));
  await assertFails(set(ref(dbA, "sessions/A111111/state"), {
    notes: "x".repeat(4001)
  }));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/draft/lesson-a/q1"), "answer"));
  await assertFails(set(ref(dbA, "sessions/A111111/draft/lesson-a/q2"), "x".repeat(2001)));
  await assertFails(set(ref(dbA, "sessions/B222222/draft/lesson-a/q1"), "answer"));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/history/test-entry"), {
    actor: "student",
    type: "answer",
    detail: "Answered a question",
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/history/bad-entry"), {
    actor: "student",
    type: "answer",
    detail: "x".repeat(301),
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "sessions/B222222/history/test-entry"), {
    actor: "student",
    type: "answer",
    detail: "Answered a question",
    ts: Date.now()
  }));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/annotations/lesson-a"), "<p>Note</p>"));
  await assertFails(set(ref(dbA, "sessions/A111111/annotations/lesson-b"), 42));
  await assertFails(set(ref(dbA, "sessions/A111111/annotations/lesson-c"), "x".repeat(50001)));
  await assertFails(set(ref(dbA, "sessions/B222222/annotations/lesson-a"), "<p>Note</p>"));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/homework_annotations/task-1"), "<p>Note</p>"));
  await assertFails(set(ref(dbA, "sessions/A111111/homework_annotations/task-2"), 42));
  await assertFails(set(ref(dbA, "sessions/A111111/homework_annotations/task-3"), "x".repeat(50001)));
  await assertFails(set(ref(dbA, "sessions/B222222/homework_annotations/task-1"), "<p>Note</p>"));
});

test("student review, command acknowledgements, and summaries are scoped and validated", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const review = {
    stage: 1,
    questionId: "q1",
    prompt: "Question",
    studentAnswer: "Answer",
    autoResult: false,
    ts: Date.now()
  };
  await assertSucceeds(set(ref(dbA, "sessions/A111111/reviewQueue/review-1"), review));
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/review-2"), {
    ...review,
    prompt: "x".repeat(121)
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/review-3"), {
    ...review,
    autoResult: "false"
  }));
  await assertFails(set(ref(dbA, "sessions/B222222/reviewQueue/review-1"), review));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/commands/cmd-1/ack"), true));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-2/ack"), "yes"));
  await assertFails(set(ref(dbA, "sessions/B222222/commands/cmd-1/ack"), true));

  await assertSucceeds(set(ref(dbA, "sessionSummary/A111111"), { completed: 1 }));
  await assertFails(set(ref(dbA, "sessionSummary/A111111"), "invalid"));
  await assertFails(set(ref(dbA, "sessionSummary/B222222"), { completed: 1 }));
});

test("student progress rejects invalid values and writes to other student codes", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111"), { xp: 15, level: 1 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111"), { xp: "15" }));
  await assertFails(set(ref(dbA, "studentProgress/A111111"), { xp: 100000001 }));
  await assertFails(set(ref(dbA, "studentProgress/B222222"), { xp: 15, level: 1 }));
});
