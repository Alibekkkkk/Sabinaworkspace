import assert from "node:assert/strict";
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
    await set(ref(db, "sessions/A111111/commands/cmd-1"), { type: "goto", payload: { stage: 2 }, createdAt: 1 });
    await set(ref(db, "sessions/A111111/commands/cmd-2"), { type: "resetVocab", createdAt: 2 });
    await set(ref(db, "sessions/B222222/commands/cmd-1"), { type: "goto", payload: { stage: 2 }, createdAt: 1 });
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
  await assertSucceeds(set(record, {
    version: 1,
    answers: { "0": "draft" },
    score: 4,
    total: 5,
    submitted: false
  }));
  await assertSucceeds(update(record, { submitted: true, score: 5 }));
  await assertFails(update(record, { score: 0 }));
  await assertFails(set(ref(dbA, "sessions/A111111/homework/task-2"), {
    version: 1,
    answers: { "0": "answer" },
    score: 6,
    total: 5,
    submitted: false
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/homework/task bad"), {
    version: 1,
    answers: { "0": "answer" }
  }));
  const archiveRecord = ref(dbA, "sessions/A111111/homework/task-archive");
  await assertSucceeds(set(archiveRecord, {
    version: 1,
    answers: { "0": "current answer" },
    total: 5,
    submitted: false
  }));
  await assertSucceeds(set(ref(dbA, "sessions/A111111/homework/task-archive/attempts/attempt-1"), {
    version: 1,
    answers: { "0": "previous answer" },
    score: 3,
    total: 5,
    updatedAt: Date.now(),
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/homework/task-archive/attempts/attempt-2"), {
    version: 1,
    answers: { "0": "previous answer" },
    score: 3,
    total: 5,
    updatedAt: Date.now(),
    ts: Date.now(),
    injected: true
  }));
});

test("students can only update their own identity and registration records", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "studentByUid/student-a"), "A111111"));
  await assertSucceeds(set(ref(dbA, "students/A111111/lastLogin"), Date.now()));
  await assertFails(set(ref(dbA, "students/A111111/name"), "Changed by student"));
  await assertFails(set(ref(dbA, "students/A111111/approved"), true));
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
  await assertFails(set(ref(dbA, "sessions/A111111/state"), { unknownField: { data: true } }));
  await assertFails(set(ref(dbA, "sessions/A111111/state"), { scores: { "lesson_1_1": "high" } }));
  await assertFails(set(ref(dbA, "sessions/A111111/state"), {
    notes: "x".repeat(4001)
  }));
  await assertSucceeds(set(ref(dbA, "sessions/A111111/state/vocabProgress/lesson-a/cat/meanings/0"), {
    perfectStreak: 1,
    wrongCount: 0
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/state/vocabProgress/lesson-a/cat/meanings/1"), {
    perfectStreak: "one"
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
  await assertFails(set(ref(dbA, "sessions/A111111/history/bad key"), {
    actor: "student",
    type: "answer",
    detail: "Bad key",
    ts: Date.now()
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/history/extra-field"), {
    actor: "student",
    type: "answer",
    detail: "Extra field",
    ts: Date.now(),
    arbitrary: "not allowed"
  }));
  await assertFails(set(ref(dbA, "sessions/B222222/history/test-entry"), {
    actor: "student",
    type: "answer",
    detail: "Answered a question",
    ts: Date.now()
  }));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/annotations/lesson-a"), "<p>Note</p>"));
  await assertFails(set(ref(dbA, "sessions/A111111/annotations/bad lesson"), "<p>Note</p>"));
  await assertFails(set(ref(dbA, "sessions/A111111/annotations/lesson-b"), 42));
  await assertFails(set(ref(dbA, "sessions/A111111/annotations/lesson-c"), "x".repeat(50001)));
  await assertFails(set(ref(dbA, "sessions/B222222/annotations/lesson-a"), "<p>Note</p>"));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/homework_annotations/task-1"), "<p>Note</p>"));
  await assertFails(set(ref(dbA, "sessions/A111111/homework_annotations/bad task"), "<p>Note</p>"));
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
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/bad key"), review));
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/review-extra"), {
    ...review,
    unknown: "not allowed"
  }));
  await assertFails(set(ref(dbA, "sessions/B222222/reviewQueue/review-1"), review));

  await assertSucceeds(set(ref(dbA, "sessions/A111111/commands/cmd-1/ack"), true));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-2/ack"), "yes"));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-2/ack"), false));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-1/ack"), null));
  await assertFails(set(ref(dbA, "sessions/B222222/commands/cmd-1/ack"), true));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/ghost/ack"), true));

  await assertFails(set(ref(dbA, "sessionSummary/A111111"), { completed: 1 }));
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

test("student progress validates dynamic keys, record shapes, and bounded values", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/daily"), {
    date: "2026-11-08",
    games: 1,
    correct: 2,
    questComplete: true
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/daily"), {
    date: "2026-11-08",
    games: 1,
    correct: 2,
    questComplete: true,
    unexpected: "extra"
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/daily/games"), "one"));
  await assertFails(set(ref(dbA, "studentProgress/A111111/topics/bad topic"), {
    label: "Bad topic",
    attempts: 1,
    score: 1,
    total: 1,
    timeSpentSeconds: 1,
    updatedAt: Date.now()
  }));
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/topics/word-match"), {
    label: "Word Match",
    attempts: 1,
    score: 2,
    total: 2,
    timeSpentSeconds: 3,
    updatedAt: Date.now()
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/topics/extra"), {
    label: "Extra",
    attempts: 1,
    score: 2,
    total: 2,
    timeSpentSeconds: 3,
    updatedAt: Date.now(),
    unknown: true
  }));
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/attempts/0"), {
    gameId: "game-1",
    gameType: "fill-gap",
    score: 1,
    total: 1,
    timeSpentSeconds: 5,
    completedAt: new Date().toISOString()
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/attempts/1"), {
    gameId: "game-1",
    gameType: "fill-gap",
    score: 1,
    total: 1,
    timeSpentSeconds: 5,
    completedAt: new Date().toISOString(),
    injected: true
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/attempts/bad index"), {
    gameId: "game-1",
    gameType: "fill-gap",
    score: 1,
    total: 1,
    timeSpentSeconds: 5,
    completedAt: new Date().toISOString()
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/reviewQueue/0"), {
    itemId: "q1",
    prompt: "x".repeat(301),
    answer: "Answer",
    topic: "Topic"
  }));
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/vocabulary/artificial-intelligence"), {
    word: "artificial intelligence",
    translation: "translation",
    definition: "definition",
    savedAt: new Date().toISOString(),
    sourceClipId: "ai"
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/artificial intelligence"), {
    word: "artificial intelligence"
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/extra"), {
    word: "word",
    unexpected: "not allowed"
  }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/oversized"), {
    word: "x".repeat(101)
  }));
});

test("bounded session history and review queue records reject malformed fixed shapes", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertFails(set(ref(dbA, "sessions/A111111/commands/bad key/ack"), true));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-1/ack"), {
    ack: true,
    extra: "not allowed"
  }));
  await assertFails(set(ref(dbA, "sessions/A111111/draft/lesson-a/bad answer"), "answer"));
  await assertFails(set(ref(dbA, "sessions/A111111/state/scores/bad stage"), 1));
  await assertFails(set(ref(dbA, "sessions/A111111/state/vocabProgress/lesson-a/bad word/meanings/0"), {
    perfectStreak: 1
  }));
});

test("teacher commands use one versioned schema with a server timestamp", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const serverNow = { ".sv": "timestamp" };

  await assertSucceeds(set(ref(teacher, "sessions/A111111/commands/cmd-new"), { type: "goto", payload: { stage: 3 }, createdAt: serverNow }));
  await assertSucceeds(set(ref(teacher, "sessions/A111111/commands/cmd-reset"), { type: "resetAll", createdAt: serverNow }));
  await assertSucceeds(set(ref(teacher, "sessions/A111111/commands/cmd-stage"), { type: "resetStage", payload: { stage: 9 }, createdAt: serverNow }));

  // client clocks are not trusted
  await assertFails(set(ref(teacher, "sessions/A111111/commands/cmd-clock"), { type: "goto", payload: { stage: 3 }, createdAt: Date.now() }));
  // unknown types, out-of-range stages, extra fields and the legacy shape are rejected
  await assertFails(set(ref(teacher, "sessions/A111111/commands/cmd-bad-type"), { type: "eval", createdAt: serverNow }));
  await assertFails(set(ref(teacher, "sessions/A111111/commands/cmd-bad-stage"), { type: "goto", payload: { stage: 10 }, createdAt: serverNow }));
  await assertFails(set(ref(teacher, "sessions/A111111/commands/cmd-extra"), { type: "goto", payload: { stage: 1, html: "<b>" }, createdAt: serverNow }));
  await assertFails(set(ref(teacher, "sessions/A111111/commands/cmd-legacy"), { action: "goto", stage: 1, ts: Date.now() }));
  await assertFails(set(ref(teacher, "sessions/A111111/command"), { action: "goto", stage: 1, ts: Date.now() }));
  // the creation time is immutable
  await assertFails(update(ref(teacher, "sessions/A111111/commands/cmd-new"), { createdAt: serverNow }));

  // students can never create or edit commands, only acknowledge them
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-student"), { type: "goto", payload: { stage: 3 }, createdAt: serverNow }));
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-1/type"), "resetAll"));
  await assertSucceeds(set(ref(dbA, "sessions/A111111/commands/cmd-new/ack"), true));
  await assertSucceeds(get(ref(dbA, "sessions/A111111/commands")));
  await assertFails(get(ref(dbA, "sessions/B222222/commands")));
});

test("only an admin can reset a submitted homework record, and the attempt can be archived first", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const record = ref(dbA, "sessions/A111111/homework/task-reset");
  await assertSucceeds(set(record, { version: 6, answers: { q_one: "mine" }, score: 1, total: 2, submitted: false }));
  await assertSucceeds(update(record, { submitted: true }));
  await assertFails(update(record, { submitted: false }));

  const adminRecord = ref(teacher, "sessions/A111111/homework/task-reset");
  await assertSucceeds(set(ref(teacher, "sessions/A111111/homework/task-reset/attempts/attempt-1"), {
    version: 6, answers: { q_one: "mine" }, score: 1, total: 2, updatedAt: Date.now(), ts: Date.now()
  }));
  await assertSucceeds(update(adminRecord, {
    version: 6, answers: null, rawAnswers: null, score: null, total: null,
    submitted: false, completed: false, submittedAt: null, submittedBy: null, updatedAt: null
  }));
  // the student can answer again, and the archived attempt survived the reset
  await assertSucceeds(update(record, { answers: { q_one: "retry" } }));
  const attempt = await get(ref(teacher, "sessions/A111111/homework/task-reset/attempts/attempt-1/answers/q_one"));
  assert.equal(attempt.val(), "mine");
});

test("students write only a bounded compact summary of their own session, and only admins read all of them", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const summary = { score: 40, stage: 3, streak: 2, elapsed: 600, doneCount: 3, lastUpdate: Date.now() };

  await assertSucceeds(set(ref(dbA, "sessionSummary/A111111"), summary));
  await assertSucceeds(update(ref(dbA, "sessionSummary/A111111"), { score: 55 }));
  await assertSucceeds(update(ref(dbA, "sessionSummary/A111111/homework/task-1"), { submitted: true, completed: true, score: 4, total: 5, updatedAt: Date.now() }));
  await assertSucceeds(get(ref(dbA, "sessionSummary/A111111")));

  // other students, bad shapes, oversized values and free-form text are rejected
  await assertFails(set(ref(dbA, "sessionSummary/B222222"), summary));
  await assertFails(get(ref(dbA, "sessionSummary/B222222")));
  await assertFails(get(ref(dbA, "sessionSummary")));
  await assertFails(update(ref(dbA, "sessionSummary/A111111"), { score: 1e9 }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111"), { stage: 12 }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111"), { doneCount: -1 }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111"), { name: "<img src=x onerror=alert(1)>" }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111"), { notes: "free text does not belong in the summary" }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111/homework/task-1"), { score: 99999 }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111/homework/task-1"), { answers: { q1: "x" } }));
  await assertFails(update(ref(dbA, "sessionSummary/A111111/homework/bad id"), { updatedAt: 1 }));

  // the teacher can read the whole compact tree but cannot forge a student's summary
  const all = await assertSucceeds(get(ref(teacher, "sessionSummary")));
  assert.equal(all.val().A111111.score, 55);
  await assertFails(set(ref(teacher, "sessionSummary/A111111"), summary));
});
