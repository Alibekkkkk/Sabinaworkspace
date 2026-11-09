import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { get, ref, remove, set, update } from "firebase/database";

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

test("listening progress: own node only, bounded numbers, no extra fields, saved words may record their listening source", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const item = { attempts: 2, bestAccuracy: 0.75, lastAt: 1700000000000 };
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/listening/sabina-l-001"), item));
  await assertSucceeds(get(ref(dbA, "studentProgress/A111111/listening/sabina-l-001")));
  await assertFails(set(ref(dbA, "studentProgress/B222222/listening/sabina-l-001"), item));
  await assertFails(set(ref(dbA, "studentProgress/A111111/listening/sabina-l-001"), { ...item, bestAccuracy: 1.5 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/listening/sabina-l-001"), { ...item, attempts: -1 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/listening/sabina-l-001"), { ...item, extra: "x" }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/listening/sabina-l-001"), { attempts: 1 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/listening/bad key!"), item));
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/vocabulary/grasp"), { word: "grasp", sourceListeningId: "sabina-l-001" }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/grip"), { word: "grip", sourceListeningId: "x".repeat(81) }));
  const teacherDb = testEnv.authenticatedContext("teacher").database();
  await assertSucceeds(get(ref(teacherDb, "studentProgress/A111111/listening")));
  await assertFails(set(ref(teacherDb, "studentProgress/A111111/listening/sabina-l-001"), item));
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

test("students cannot write teacher-owned nodes and teachers can read every student's data", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();

  for (const path of [
    "curriculum/lesson-x",
    "studentCurriculum/A111111/lesson-x",
    "protectedContent/lesson-x/classwork",
    "admins/student-a",
    "sessions/A111111/commands/cmd-student-made"
  ]) {
    await assertFails(set(ref(dbA, path), { type: "goto", title: "x", content: { a: 1 }, createdAt: Date.now() }));
  }
  await assertFails(set(ref(dbA, "admins/student-a"), true));

  for (const path of [
    "sessions/A111111/state", "sessions/B222222/state", "sessions/A111111/history",
    "sessions/B222222/reviewQueue", "students/A111111", "students/B222222", "studentProgress/B222222",
    "sessionSummary", "pendingStudents"
  ]) {
    await assertSucceeds(get(ref(teacher, path)));
  }
  await assertFails(set(ref(teacher, "students/A111111/uid"), "teacher-hijack-attempt-over-128-chars-".repeat(5)));
});

test("placement results: server-stamped, own code only, one retake a week, teacher override and reset", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const now = { ".sv": "timestamp" };
  const result = { takenAt: now, cefr: "B1", confidence: 0.82, durationMs: 420000, answers: [{ id: "a1-be", correct: true }, { id: "b1-passive", correct: false }] };
  const placement = ref(dbA, "studentProgress/A111111/placement");

  await assertSucceeds(set(placement, result));
  // wrong owner, client clock, bad shape
  await assertFails(set(ref(dbA, "studentProgress/B222222/placement"), result));
  await assertFails(set(ref(dbA, "studentProgress/A111111/placement"), { ...result, cefr: "Z9" }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/placement"), { ...result, confidence: 3 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/placement"), { ...result, extra: true }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/placement"), { ...result, answers: [{ id: "<img onerror=x>", correct: true }] }));
  // an immediate retake and any tampering with the stored result are refused
  await assertFails(set(placement, { ...result, cefr: "C1" }));
  await assertFails(update(ref(dbA, "studentProgress/A111111/placement"), { cefr: "C1" }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/placement/teacherLevel"), "C1"));
  await assertFails(set(placement, null));
  // other progress writes keep working and keep the placement
  await assertSucceeds(update(ref(dbA, "studentProgress/A111111"), { xp: 20 }));
  const stored = await get(placement);
  assert.equal(stored.val().cefr, "B1");

  // teacher: read all, override the level, but cannot forge a result; reset allows a retake
  await assertSucceeds(get(ref(teacher, "studentProgress/A111111/placement")));
  await assertSucceeds(set(ref(teacher, "studentProgress/A111111/placement/teacherLevel"), "A2"));
  await assertFails(set(ref(teacher, "studentProgress/A111111/placement/teacherLevel"), "D9"));
  await assertSucceeds(set(ref(teacher, "studentProgress/A111111/placement"), null));
  await assertSucceeds(set(placement, { ...result, cefr: "B2" }));

  // after seven days the student may retake (simulated by backdating the stored timestamp)
  await testEnv.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), "studentProgress/A111111/placement/takenAt"), Date.now() - 8 * 24 * 3600 * 1000);
  });
  await assertSucceeds(set(placement, { ...result, cefr: "C1" }));
});

test("leaderboard: opt-in only, own uid only, own class only, capped, uid-keyed, teacher moderates", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), "students/B222222/classId"), "room-b");
  });
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const outsider = testEnv.authenticatedContext("stranger").database();
  const member = { nickname: "Maple Fox", totalXp: 120, updatedAt: Date.now() };
  const week = { weeklyXp: 40, baselineXp: 80, updatedAt: Date.now() };

  // opted OUT by default: a weekly score cannot exist without a member (nickname) entry
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), week));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/members/student-a"), member));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), week));

  // cannot write another student's entry, another class, or by student code
  await assertFails(set(ref(dbA, "leaderboard/main/members/student-b"), member));
  await assertFails(set(ref(dbA, "leaderboard/room-b/members/student-a"), member));
  await assertFails(set(ref(dbB, "leaderboard/main/members/student-b"), member));
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-b"), week));
  await assertFails(set(ref(outsider, "leaderboard/main/members/stranger"), member));

  // validation: caps, nickname, week id, unknown fields, immutable baseline
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W03/student-a"), { ...week, weeklyXp: 5001 }));
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W03/student-a"), { ...week, weeklyXp: -1 }));
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/not-a-week/student-a"), week));
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), { ...week, baselineXp: 0 }));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), { ...week, weeklyXp: 55 }));
  await assertFails(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), { ...week, realName: "Sabina" }));
  await assertFails(set(ref(dbA, "leaderboard/main/members/student-a"), { ...member, nickname: "<b>x</b>" }));
  await assertFails(set(ref(dbA, "leaderboard/main/members/student-a"), { ...member, nickname: "ab" }));
  await assertFails(set(ref(dbA, "leaderboard/main/members/student-a"), { ...member, code: "A111111" }));

  // reads: classmates and teacher yes, other class and strangers no
  await assertSucceeds(get(ref(dbA, "leaderboard/main")));
  await assertSucceeds(get(ref(teacher, "leaderboard/main")));
  await assertFails(get(ref(dbB, "leaderboard/main")));
  await assertFails(get(ref(outsider, "leaderboard/main")));
  await assertFails(get(ref(dbA, "leaderboard")));

  // opt out = delete own entries; teacher can rename and remove
  await assertSucceeds(set(ref(teacher, "leaderboard/main/members/student-a/nickname"), "Friendly Owl"));
  await assertFails(set(ref(teacher, "leaderboard/main/members/student-a/nickname"), "ab"));
  await assertSucceeds(set(ref(teacher, "leaderboard/main/members/student-a"), null));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/members/student-a"), member));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/members/student-a"), null));
  await assertSucceeds(set(ref(dbA, "leaderboard/main/weeks/2026-W02/student-a"), null));

  // only the teacher may assign a class
  await assertFails(set(ref(dbA, "students/A111111/classId"), "room-b"));
  await assertSucceeds(set(ref(teacher, "students/A111111/classId"), "room-a"));
  await assertFails(set(ref(teacher, "students/A111111/classId"), "Bad Class!"));
  await testEnv.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), "students/A111111/classId"), null);
  });
});

test("scheduled assignments: protected content unlocks at availableFrom on the server clock; closed homework cannot be saved", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const hour = 3600 * 1000;

  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "protectedContent/sched-future/classwork"), { sourceFile: "x.json", content: { title: "Future" } });
    await set(ref(db, "protectedContent/sched-open/classwork"), { sourceFile: "x.json", content: { title: "Open" } });
    await set(ref(db, "protectedContent/sched-none/classwork"), { sourceFile: "x.json", content: { title: "No schedule" } });
    await set(ref(db, "studentCurriculum/A111111/sched-future"), { title: "Future", availableFrom: Date.now() + 2 * hour });
    await set(ref(db, "studentCurriculum/A111111/sched-open"), { title: "Open", availableFrom: Date.now() - 2 * hour, dueAt: Date.now() + hour });
    await set(ref(db, "studentCurriculum/A111111/sched-none"), { title: "No schedule" });
  });

  await assertFails(get(ref(dbA, "protectedContent/sched-future/classwork")));
  await assertSucceeds(get(ref(dbA, "protectedContent/sched-open/classwork")));
  await assertSucceeds(get(ref(dbA, "protectedContent/sched-none/classwork")));
  // the teacher always sees the content, and the student still sees the schedule metadata (to show "Locked until")
  await assertSucceeds(get(ref(teacher, "protectedContent/sched-future/classwork")));
  await assertSucceeds(get(ref(dbA, "studentCurriculum/A111111/sched-future")));

  // moving the date into the past unlocks it
  await assertSucceeds(set(ref(teacher, "studentCurriculum/A111111/sched-future/availableFrom"), Date.now() - 1000));
  await assertSucceeds(get(ref(dbA, "protectedContent/sched-future/classwork")));
  // bad schedule values and student edits are rejected
  await assertFails(set(ref(teacher, "studentCurriculum/A111111/sched-open/dueAt"), "tomorrow"));
  await assertFails(set(ref(dbA, "studentCurriculum/A111111/sched-future/availableFrom"), 0));

  // homework after closesAt cannot be saved; before it can
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "studentCurriculum/A111111/hw-closed"), { homework: true, closesAt: Date.now() - hour });
    await set(ref(db, "studentCurriculum/A111111/hw-open"), { homework: true, closesAt: Date.now() + hour });
  });
  await assertFails(set(ref(dbA, "sessions/A111111/homework/hw-closed"), { version: 1, answers: { q_one: "late" }, submitted: false }));
  await assertSucceeds(set(ref(dbA, "sessions/A111111/homework/hw-open"), { version: 1, answers: { q_one: "on time" }, submitted: false }));
  await assertSucceeds(set(ref(teacher, "sessions/A111111/homework/hw-closed"), { version: 1, submitted: false }));
});

test("lesson clock: only teachers write, the state machine and revisions are enforced, the stopped total is frozen", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const now = { ".sv": "timestamp" };
  const clock = ref(teacher, "lessonClock/A111111/lesson-a");
  const idle = { state: "idle", accumulatedMs: 0, rev: 0, currentSection: "vocabulary" };

  await assertFails(set(ref(dbA, "lessonClock/A111111/lesson-a"), idle));
  await assertFails(set(ref(dbB, "lessonClock/A111111/lesson-a"), idle));
  await assertSucceeds(set(clock, idle));
  await assertSucceeds(get(ref(dbA, "lessonClock/A111111/lesson-a")));
  await assertFails(get(ref(dbB, "lessonClock/A111111/lesson-a")));
  await assertFails(set(ref(dbA, "lessonClock/A111111/lesson-a/state"), "stopped"));
  await assertFails(set(ref(dbA, "lessonClock/A111111/lesson-a/accumulatedMs"), 99));

  // start (rev must go up by exactly one, runningSince must be a real server time)
  await assertFails(set(clock, { ...idle, state: "running", rev: 5, runningSince: now, startedAt: now, sections: { vocabulary: { accumulatedMs: 0, runningSince: now } } }));
  await assertFails(set(clock, { ...idle, state: "running", rev: 1, runningSince: Date.now() + 600000, startedAt: now }));
  await assertFails(set(clock, { ...idle, state: "running", rev: 1, startedAt: now, runningSince: now, extra: true }));
  await assertSucceeds(set(clock, { ...idle, state: "running", rev: 1, runningSince: now, startedAt: now, sections: { vocabulary: { accumulatedMs: 0, runningSince: now } } }));

  // running -> paused banks time and clears runningSince; a paused clock cannot keep runningSince
  await assertFails(set(clock, { state: "paused", accumulatedMs: 60000, rev: 2, currentSection: "vocabulary", runningSince: now, startedAt: now }));
  await assertFails(set(clock, { state: "paused", accumulatedMs: -1, rev: 2, currentSection: "vocabulary", startedAt: now }));
  await assertFails(set(clock, { state: "paused", accumulatedMs: 60000, rev: 2, currentSection: "Bad Section", startedAt: now }));
  await assertFails(set(clock, { state: "paused", accumulatedMs: 60000, rev: 2, currentSection: "grammar", totalMs: 1, startedAt: now }));
  await assertSucceeds(set(clock, { state: "paused", accumulatedMs: 60000, rev: 2, currentSection: "vocabulary", startedAt: now, sections: { vocabulary: { accumulatedMs: 60000 } } }));
  await assertSucceeds(set(clock, { state: "running", accumulatedMs: 60000, rev: 3, currentSection: "vocabulary", startedAt: now, runningSince: now }));
  await assertFails(set(clock, { state: "idle", accumulatedMs: 0, rev: 4, currentSection: "vocabulary" }));

  // stop freezes the total
  await assertFails(set(clock, { state: "stopped", accumulatedMs: 120000, rev: 4, currentSection: "vocabulary", startedAt: now, stoppedAt: now }));
  await assertSucceeds(set(clock, { state: "stopped", accumulatedMs: 120000, rev: 4, currentSection: "vocabulary", startedAt: now, stoppedAt: now, totalMs: 120000 }));
  await assertFails(set(clock, { state: "running", accumulatedMs: 120000, rev: 5, currentSection: "vocabulary", startedAt: now, runningSince: now }));
  await assertFails(set(clock, { state: "stopped", accumulatedMs: 999999, rev: 5, currentSection: "vocabulary", startedAt: now, stoppedAt: now, totalMs: 999999 }));
  await assertSucceeds(set(clock, { state: "stopped", accumulatedMs: 120000, rev: 5, currentSection: "vocabulary", startedAt: now, stoppedAt: now, totalMs: 120000 }));
  // an adjustment must carry the previous value, and revisions cannot be replayed
  const adjusted = { state: "stopped", accumulatedMs: 180000, totalMs: 180000, rev: 6, currentSection: "vocabulary", startedAt: now, stoppedAt: now, lastAdjust: { previousMs: 120000, at: now, reason: "Forgot to stop" } };
  await assertFails(set(clock, { ...adjusted, lastAdjust: { previousMs: 5, at: now } }));
  await assertFails(set(clock, { ...adjusted, rev: 5 }));
  await assertSucceeds(set(clock, adjusted));
  // wrong lesson id shape and the other student's clock
  await assertFails(set(ref(teacher, "lessonClock/A111111/bad lesson"), idle));
  await assertFails(get(ref(dbB, "lessonClock/A111111")));
});

test("lesson clock log is append-only, teacher-only, stamped with the server time and the teacher's uid", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const now = { ".sv": "timestamp" };
  const event = { type: "start", at: now, by: "teacher", fromState: "idle", toState: "running" };
  const entry = ref(teacher, "lessonClockLog/A111111/lesson-a/evt-1");

  await assertSucceeds(set(entry, event));
  await assertFails(set(entry, { ...event, type: "pause" }));
  await assertFails(set(entry, null));
  await assertFails(set(ref(teacher, "lessonClockLog/A111111/lesson-a/evt-2"), { ...event, at: Date.now() - 5000 }));
  await assertFails(set(ref(teacher, "lessonClockLog/A111111/lesson-a/evt-3"), { ...event, by: "somebody-else" }));
  await assertFails(set(ref(teacher, "lessonClockLog/A111111/lesson-a/evt-4"), { ...event, type: "explode" }));
  await assertFails(set(ref(teacher, "lessonClockLog/A111111/lesson-a/evt-5"), { ...event, injected: "<b>" }));
  await assertFails(set(ref(teacher, "lessonClockLog/A111111/lesson-a/bad id"), event));
  await assertSucceeds(set(ref(teacher, "lessonClockLog/A111111/lesson-a/evt-6"), { type: "adjust", at: now, by: "teacher", fromState: "stopped", toState: "stopped", deltaMs: 60000, previousMs: 120000, note: "Forgot to stop" }));
  await assertSucceeds(get(ref(teacher, "lessonClockLog/A111111/lesson-a")));
  await assertFails(get(ref(dbA, "lessonClockLog/A111111/lesson-a")));
  await assertFails(set(ref(dbA, "lessonClockLog/A111111/lesson-a/evt-7"), event));
});

test("per-student section overrides are teacher-written, bounded and readable by the student", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const base = "studentCurriculum/A111111/lesson-a/sectionOverrides";
  await assertSucceeds(set(ref(teacher, `${base}/estimatedMinutes/grammar`), 35));
  await assertSucceeds(set(ref(teacher, `${base}/order`), ["reading", "vocabulary", "grammar"]));
  await assertSucceeds(get(ref(dbA, base)));
  await assertFails(set(ref(dbA, `${base}/estimatedMinutes/grammar`), 5));
  await assertFails(set(ref(teacher, `${base}/estimatedMinutes/grammar`), 0));
  await assertFails(set(ref(teacher, `${base}/estimatedMinutes/grammar`), 500));
  await assertFails(set(ref(teacher, `${base}/estimatedMinutes/Bad Id`), 20));
  await assertFails(set(ref(teacher, `${base}/estimatedMinutes/grammar`), "twenty"));
  await assertFails(set(ref(teacher, `${base}/order/0`), "<b>x</b>"));
  await assertFails(set(ref(teacher, `${base}/unknown`), 1));
});

// ---- whiteboards ---------------------------------------------------------------------------------------------------
const wbObject = (extra = {}) => ({ t: "stroke", k: "pen", z: 1, x: 10, y: 10, w: 50, h: 20, p: "0,0,5 3c,14,5", s: { c: "auto", w: 4, o: 1, fs: 24 }, by: "student-a", at: 1, ...extra });

test("whiteboard: the teacher sets the mode and the student can only draw when it is draw", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const base = "whiteboards/A111111/lesson-a";
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "view"));
  await assertFails(set(ref(dbA, `${base}/mode`), "draw"));
  await assertFails(set(ref(teacher, `${base}/mode`), "everybody"));
  await assertSucceeds(set(ref(teacher, `${base}/boards/shared/pages/p1/objects/t1`), wbObject({ by: "teacher" })));
  await assertSucceeds(get(ref(dbA, `${base}/boards/shared/pages/p1/objects`)));
  await assertFails(set(ref(dbA, `${base}/boards/shared/pages/p1/objects/s1`), wbObject()));
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "draw"));
  await assertSucceeds(set(ref(dbA, `${base}/boards/shared/pages/p1/objects/s1`), wbObject()));
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "view"));
  await assertFails(set(ref(dbA, `${base}/boards/shared/pages/p1/objects/s2`), wbObject()));
});

test("whiteboard: teacher-only hides the shared board from the student but not their own board", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const base = "whiteboards/A111111/lesson-a";
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "teacher-only"));
  await assertFails(get(ref(dbA, `${base}/boards/shared/pages`)));
  await assertSucceeds(get(ref(teacher, `${base}/boards/shared/pages`)));
  await assertSucceeds(set(ref(dbA, `${base}/boards/personal/pages/p1/objects/m1`), wbObject()));
  await assertSucceeds(get(ref(dbA, `${base}/boards/personal/pages`)));
  await assertSucceeds(get(ref(teacher, `${base}/boards/personal/pages`)));
  await assertSucceeds(get(ref(dbA, `${base}/mode`)));
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "view"));
});

test("whiteboard: students are isolated from each other, and the teacher can read but not write a personal board", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const anon = testEnv.unauthenticatedContext().database();
  await assertSucceeds(set(ref(dbA, "whiteboards/A111111/lesson-a/boards/personal/pages/p1/objects/iso"), wbObject()));
  await assertFails(get(ref(dbB, "whiteboards/A111111/lesson-a/boards/personal/pages/p1/objects/iso")));
  await assertFails(set(ref(dbB, "whiteboards/A111111/lesson-a/boards/personal/pages/p1/objects/x"), wbObject({ by: "student-b" })));
  await assertFails(get(ref(dbB, "whiteboards/A111111/lesson-a/boards/shared")));
  await assertFails(set(ref(dbB, "whiteboards/A111111/lesson-a/presence/student-b"), { name: "B", colour: "#1c7ed6", x: 1, y: 1, at: 1 }));
  await assertFails(get(ref(anon, "whiteboards/A111111/lesson-a/boards/personal")));
  await assertSucceeds(get(ref(teacher, "whiteboards/A111111/lesson-a/boards/personal/pages/p1/objects/iso")));
  await assertFails(set(ref(teacher, "whiteboards/A111111/lesson-a/boards/personal/pages/p1/objects/by-teacher"), wbObject({ by: "teacher" })));
});

test("whiteboard: in draw mode a student edits only their own objects and cannot touch pages or the mode", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const base = "whiteboards/A111111/lesson-b/boards/shared";
  await assertSucceeds(set(ref(teacher, "whiteboards/A111111/lesson-b/mode"), "draw"));
  await assertSucceeds(set(ref(teacher, `${base}/index/p1`), { title: "Page 1", bg: "grid", paper: "light", order: 0 }));
  await assertSucceeds(set(ref(teacher, `${base}/pages/p1/meta`), { title: "Page 1", bg: "grid", paper: "light", order: 0 }));
  await assertSucceeds(set(ref(teacher, `${base}/pages/p1/objects/teacherObj`), wbObject({ by: "teacher" })));
  await assertSucceeds(set(ref(dbA, `${base}/pages/p1/objects/mine`), wbObject()));
  await assertSucceeds(update(ref(dbA, `${base}/pages/p1`), { "objects/mine": wbObject({ x: 99, at: 2 }), "meta/updatedAt": 5 }));
  await assertFails(set(ref(dbA, `${base}/pages/p1/objects/teacherObj`), wbObject({ by: "student-a" })));
  await assertFails(set(ref(dbA, `${base}/pages/p1/objects/teacherObj`), null));
  await assertFails(set(ref(dbA, `${base}/pages/p1/objects/forged`), wbObject({ by: "teacher" })));
  await assertFails(set(ref(dbA, `${base}/pages/p1/objects`), null));
  await assertFails(set(ref(dbA, `${base}/index/p2`), { title: "Mine", order: 1 }));
  await assertFails(set(ref(dbA, `${base}/pages/p1/meta/bg`), "dots"));
  await assertFails(set(ref(dbA, "whiteboards/A111111/lesson-b/mode"), "draw"));
  await assertSucceeds(set(ref(teacher, `${base}/pages/p1/objects/mine`), { t: "stroke", by: "student-a", at: 9, del: true, z: 0 }));
  await assertSucceeds(set(ref(teacher, `${base}/pages/p1/objects`), null));
});

test("whiteboard: object shape, size and type are validated", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const base = "whiteboards/A111111/lesson-c/boards/personal/pages/p1";
  await assertSucceeds(set(ref(dbA, `${base}/objects/ok`), wbObject()));
  await assertFails(set(ref(dbA, `${base}/objects/badtype`), wbObject({ t: "script" })));
  await assertFails(set(ref(dbA, `${base}/objects/oversize`), wbObject({ p: "a".repeat(5601) })));
  await assertSucceeds(set(ref(dbA, `${base}/objects/maxsize`), wbObject({ p: "a".repeat(5600) })));
  await assertFails(set(ref(dbA, `${base}/objects/bigtext`), wbObject({ t: "text", tx: "x".repeat(1501) })));
  await assertFails(set(ref(dbA, `${base}/objects/badcolour`), wbObject({ s: { c: "red; x:url(1)", w: 4, o: 1 } })));
  await assertFails(set(ref(dbA, `${base}/objects/farout`), wbObject({ x: 1e9 })));
  await assertFails(set(ref(dbA, `${base}/objects/unknownfield`), wbObject({ onclick: "x" })));
  await assertFails(set(ref(dbA, `${base}/objects/nogeom`), { t: "stroke", by: "student-a", at: 1 }));
  await assertSucceeds(set(ref(dbA, `${base}/objects/tomb`), { t: "stroke", by: "student-a", at: 3, del: true, z: 0 }));
  await assertFails(set(ref(dbA, `${base}/objects/bad id!`), wbObject()));
  await assertFails(set(ref(dbA, `${base}/surprise`), 1));
  await assertFails(set(ref(teacher, "whiteboards/A111111/lesson-c/boards/other/pages/p1/objects/x"), wbObject({ by: "teacher" })));
  const png = "data:image/png;base64,iVBORw0KGgo=";
  await assertSucceeds(set(ref(dbA, `${base}/images/im1`), png));
  await assertFails(set(ref(dbA, `${base}/images/im2`), "data:image/svg+xml;base64,PHN2Zz4="));
  await assertFails(set(ref(dbA, `${base}/images/im3`), "data:image/png;base64," + "A".repeat(250000)));
  await assertFails(set(ref(dbA, `${base}/images/im4`), "https://example.com/x.png"));
  const picture = { t: "image", im: "im1", alt: "A river", z: 1, x: 0, y: 0, w: 50, h: 50, s: { c: "auto", w: 4, o: 1, fs: 24 }, by: "student-a", at: 1 };
  await assertSucceeds(set(ref(dbA, `${base}/objects/img`), picture));
});

test("whiteboard: presence and live strokes are writable only by their own uid", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const base = "whiteboards/A111111/lesson-d";
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "draw"));
  const me = { name: "Anna", colour: "#1c7ed6", x: 10, y: 20, tool: "laser", at: 5, laser: [[1, 2, 3], [4, 5, 6]] };
  await assertSucceeds(set(ref(dbA, `${base}/presence/student-a`), me));
  await assertFails(set(ref(dbA, `${base}/presence/teacher`), me));
  await assertFails(set(ref(dbA, `${base}/presence/student-a`), { ...me, colour: "red" }));
  await assertFails(set(ref(dbA, `${base}/presence/student-a`), { ...me, name: "n".repeat(41) }));
  await assertSucceeds(get(ref(teacher, `${base}/presence`)));
  await assertSucceeds(set(ref(dbA, `${base}/boards/shared/pages/p1/live/student-a`), wbObject()));
  await assertFails(set(ref(dbA, `${base}/boards/shared/pages/p1/live/teacher`), wbObject()));
  await assertSucceeds(set(ref(teacher, `${base}/mode`), "view"));
  await assertFails(set(ref(dbA, `${base}/boards/shared/pages/p1/live/student-a`), wbObject()));
});

test("whiteboard: snapshots are teacher-written JPEGs the student can read", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const path = "whiteboards/A111111/lesson-e/snapshots/s1";
  const snapshot = { at: 5, by: "teacher", label: "End of class", pages: { p1: "data:image/jpeg;base64,/9j/4AAQ" } };
  await assertSucceeds(set(ref(teacher, path), snapshot));
  await assertFails(set(ref(dbA, "whiteboards/A111111/lesson-e/snapshots/s2"), snapshot));
  await assertSucceeds(get(ref(dbA, path)));
  await assertFails(get(ref(dbB, path)));
  await assertFails(set(ref(teacher, "whiteboards/A111111/lesson-e/snapshots/s3"), { ...snapshot, pages: { p1: "data:text/html;base64,PGI+" } }));
});

// ---- game progress caps ----------------------------------------------------------------------------------------------
test("progress: XP only goes up, by a bounded amount per write; gems may be spent but not minted; teachers still cannot write", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const path = "studentProgress/A111111";
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), path), { xp: 100, gems: 20, level: 2 }); });
  await assertSucceeds(update(ref(dbA, path), { xp: 150 }));
  await assertSucceeds(update(ref(dbA, path), { xp: 750 }));
  await assertFails(update(ref(dbA, path), { xp: 1500 }), "a single write cannot add more than 600 XP");
  await assertFails(update(ref(dbA, path), { xp: 10 }), "XP can never go down for a student");
  await assertFails(set(ref(dbA, `${path}/xp`), -5));
  await assertSucceeds(update(ref(dbA, path), { gems: 10 }), "spending gems lowers them");
  await assertSucceeds(update(ref(dbA, path), { gems: 60 }));
  await assertFails(update(ref(dbA, path), { gems: 500 }), "gems cannot jump");
  await assertFails(update(ref(teacher, path), { xp: 40 }), "teachers still cannot write student progress, as before");
  await assertFails(update(ref(testEnv.authenticatedContext("student-b").database(), path), { xp: 41 }));
});

test("progress: stats, badges, avatar, daily and weekly shapes are validated", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const path = "studentProgress/A111111";
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), path), { xp: 0, level: 1 }); });
  await assertSucceeds(update(ref(dbA, path), { stats: { games: 3, perfect: 1, correct: 9, words: 4, listening: 1, boss: 0, hunts: 2, reviewed: 0, weeks: 0 } }));
  await assertFails(update(ref(dbA, path), { stats: { games: -1 } }));
  await assertFails(update(ref(dbA, path), { stats: { hacks: 1 } }));
  await assertSucceeds(update(ref(dbA, path), { badges: ["first-game", "boss-slayer", "seven-day-streak"] }));
  await assertFails(update(ref(dbA, path), { badges: ["<script>"] }));
  await assertSucceeds(update(ref(dbA, path), { avatar: { owned: ["frame-sun", "pet-fox"], frame: "frame-sun", pet: "pet-fox" } }));
  await assertFails(update(ref(dbA, path), { avatar: { owned: ["Bad Id!"] } }));
  await assertFails(update(ref(dbA, path), { avatar: { cheat: 1 } }));
  await assertSucceeds(update(ref(dbA, path), { daily: { date: "2026-11-09", games: 2, correct: 9, xp: 90, questComplete: true }, weekly: { week: "2026-11-09", games: 2, words: 8, listening: 1, questComplete: false }, streakFreezes: 2 }));
  await assertFails(update(ref(dbA, path), { streakFreezes: 9 }), "at most three freezes");
  await assertFails(update(ref(dbA, path), { weekly: { week: "2026-11-09", games: 2, questComplete: false, extra: 1 } }));
  await assertFails(update(ref(testEnv.authenticatedContext("student-b").database(), path), { stats: { games: 1 } }));
});

test("game mode on a student's lesson: teacher-set, three values, readable by the student", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const path = "studentCurriculum/A111111/lesson-a/gameMode";
  await assertSucceeds(set(ref(teacher, path), "full"));
  await assertSucceeds(set(ref(teacher, path), "off"));
  await assertFails(set(ref(teacher, path), "turbo"));
  await assertFails(set(ref(teacher, path), 3));
  await assertFails(set(ref(dbA, path), "full"), "a student cannot switch their own game mode");
  await assertSucceeds(get(ref(dbA, path)));
  await assertFails(get(ref(testEnv.authenticatedContext("student-b").database(), path)));
});

test("clip completion records: own progress only, bounded, stars 1 to 3, at most eight weak lines", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const path = "studentProgress/A111111/clips/sample-flood-night";
  const record = { title: "Sample", completedAt: 1790000000000, score: 8, total: 10, stars: 2, lastStars: 2, attempts: 1, seconds: 300, interactive: true, weakLines: ["l1", "l3"] };
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), "studentProgress/A111111"), { xp: 0, level: 1 }); });
  await assertSucceeds(set(ref(dbA, path), record));
  await assertSucceeds(get(ref(teacher, path)));
  await assertFails(set(ref(teacher, path), record));
  await assertFails(set(ref(dbB, path), record));
  await assertFails(get(ref(dbB, path)));
  await assertFails(set(ref(dbA, path), { ...record, stars: 4 }));
  await assertFails(set(ref(dbA, path), { ...record, stars: 0 }));
  await assertFails(set(ref(dbA, path), { ...record, total: 0 }));
  await assertFails(set(ref(dbA, path), { ...record, seconds: 90000 }));
  await assertFails(set(ref(dbA, path), { ...record, weakLines: { 8: "l9" } }));
  await assertFails(set(ref(dbA, path), { ...record, weakLines: ["bad id!"] }));
  await assertFails(set(ref(dbA, path), { ...record, extra: 1 }));
  await assertFails(set(ref(dbA, path), { score: 1 }));
  await assertFails(set(ref(dbA, "studentProgress/A111111/clips/x"), record));
});

test("feature flags: teacher-written, readable by the student, and the manga content follows them", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  await assertSucceeds(set(ref(teacher, "studentFeatures/A111111/mangaReader"), true));
  await assertSucceeds(set(ref(teacher, "studentFeatures/A111111/clipLab"), false));
  await assertFails(set(ref(teacher, "studentFeatures/A111111/mangaReader"), "yes"));
  await assertFails(set(ref(teacher, "studentFeatures/A111111/unknownFlag"), true));
  await assertFails(set(ref(dbA, "studentFeatures/A111111/mangaReader"), true), "a student cannot switch their own features on");
  await assertSucceeds(get(ref(dbA, "studentFeatures/A111111")));
  await assertFails(get(ref(dbB, "studentFeatures/A111111")));
  // protected manga follows the student-level flag, and an explicit false beats the lesson's own marker
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "protectedContent/lesson-a/manga"), { sourceFile: "manga/x.json", content: { id: "x" } });
    await set(ref(db, "studentCurriculum/A111111/lesson-a/features/mangaReader"), true);
    await set(ref(db, "studentCurriculum/B222222/lesson-a/features/mangaReader"), true);
  });
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-a/manga")));
  await assertSucceeds(set(ref(teacher, "studentFeatures/A111111/mangaReader"), false));
  await assertFails(get(ref(dbA, "protectedContent/lesson-a/manga")), "switched off by the teacher, so the content is denied even though the lesson says yes");
  await assertSucceeds(get(ref(dbB, "protectedContent/lesson-a/manga")), "a student with no explicit flag keeps the lesson's marker (the older way)");
  await assertSucceeds(set(ref(teacher, "studentFeatures/B222222/mangaReader"), false));
  await assertFails(get(ref(dbB, "protectedContent/lesson-a/manga")));
  await assertSucceeds(set(ref(teacher, "studentFeatures/A111111/mangaReader"), true));
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), "studentCurriculum/A111111/lesson-a/features/mangaReader"), null); });
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-a/manga")), "the student-level flag alone is enough");
});

test("manga chapter records: own progress only, bounded numbers, a fixed set of fields", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const path = "studentProgress/A111111/manga/gaziz-demo/first-seeds";
  const record = { title: "Chapter 1", lastAt: 1790000000000, completedAt: 1790000000000, pagesRead: 3, pagesTotal: 3, seconds: 400, quickScore: 2, quickTotal: 2, qScore: 4, qTotal: 5, bossScore: 4, bossTotal: 5, bossWon: true, retell: true, words: 4, stars: 3, attempts: 1, mode: "panel" };
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), "studentProgress/A111111"), { xp: 0, level: 1 }); });
  await assertSucceeds(set(ref(dbA, path), record));
  await assertSucceeds(get(ref(teacher, path)));
  await assertFails(set(ref(teacher, path), record), "teachers read progress but never write it");
  await assertFails(set(ref(dbB, path), record));
  await assertFails(get(ref(dbB, path)));
  await assertSucceeds(set(ref(dbA, path), { lastAt: 1790000000001, pagesRead: 1, pagesTotal: 3 }), "a record with only the reading fields is fine while the chapter is unfinished");
  await assertFails(set(ref(dbA, path), { ...record, stars: 4 }));
  await assertFails(set(ref(dbA, path), { ...record, stars: 0 }));
  await assertFails(set(ref(dbA, path), { ...record, pagesTotal: 0 }));
  await assertFails(set(ref(dbA, path), { ...record, pagesRead: 501 }));
  await assertFails(set(ref(dbA, path), { ...record, seconds: 8640001 }));
  await assertFails(set(ref(dbA, path), { ...record, mode: "fly" }));
  await assertFails(set(ref(dbA, path), { ...record, bossWon: "yes" }));
  await assertFails(set(ref(dbA, path), { ...record, extra: 1 }));
  await assertFails(set(ref(dbA, path), { pagesRead: 1 }), "lastAt, pagesRead and pagesTotal are required");
  await assertFails(set(ref(dbA, "studentProgress/A111111/manga/gaziz-demo/bad chapter!"), record));
  await assertFails(set(ref(dbA, "studentProgress/A111111/manga/gaziz-demo/first-seeds/title"), "x".repeat(81)));
});

test("manga assignments: the teacher assigns chapters with due dates, only that student reads them", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const path = "mangaAssignments/A111111/gaziz-demo/little-market";
  await assertSucceeds(set(ref(teacher, path), { assignedAt: 1790000000000, dueAt: 1790600000000 }));
  await assertSucceeds(set(ref(teacher, "mangaAssignments/A111111/gaziz-demo/first-seeds"), { assignedAt: 1790000000000 }), "the due date is optional");
  await assertSucceeds(get(ref(dbA, "mangaAssignments/A111111")));
  await assertFails(get(ref(dbB, "mangaAssignments/A111111")));
  await assertFails(set(ref(dbA, path), { assignedAt: 1790000000000 }), "a student cannot assign or change their own chapters");
  await assertFails(remove(ref(dbA, path)));
  await assertFails(set(ref(teacher, path), { dueAt: 1790600000000 }), "assignedAt is required");
  await assertFails(set(ref(teacher, path), { assignedAt: 0 }));
  await assertFails(set(ref(teacher, path), { assignedAt: 1790000000000, note: "x" }));
  await assertSucceeds(remove(ref(teacher, path)));
});

test("manga: a student whose teacher did not switch it on cannot read the story, even by its address", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "protectedContent/lesson-g/manga"), { sourceFile: "manga/gaziz-demo.json", content: { id: "gaziz-demo" } });
    await set(ref(db, "studentCurriculum/A111111/lesson-g"), { title: "Manga lesson", published: true, mangaId: "gaziz-demo" });
    await set(ref(db, "studentCurriculum/B222222/lesson-g"), { title: "Manga lesson", published: true, mangaId: "gaziz-demo" });
    await set(ref(db, "studentFeatures/A111111/mangaReader"), true);
  });
  await assertSucceeds(get(ref(dbA, "protectedContent/lesson-g/manga")));
  await assertFails(get(ref(dbB, "protectedContent/lesson-g/manga")), "no flag anywhere: denied by default");
  await assertFails(get(ref(dbB, "protectedContent/lesson-g/manga/content")));
});

test("threat list: signed-out visitors can read and write nothing", async () => {
  const anonymous = testEnv.unauthenticatedContext().database();
  for (const path of ["students/A111111", "studentProgress/A111111", "sessions/A111111", "protectedContent/lesson-a/classwork", "studentCurriculum/A111111", "curriculum", "admins/teacher", "studentFeatures/A111111", "mangaAssignments/A111111", "whiteboards/A111111", "leaderboard", "lessonClock/A111111", "sessionSummary/A111111"]) {
    await assertFails(get(ref(anonymous, path)), `anonymous read of ${path}`);
    await assertFails(set(ref(anonymous, `${path}/x`), 1), `anonymous write of ${path}`);
  }
});

test("threat list: a student cannot escalate to teacher or write teacher-owned data", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  await assertFails(set(ref(dbA, "admins/student-a"), true), "self-granting teacher access");
  await assertFails(set(ref(dbA, "admins"), { "student-a": true }));
  await assertFails(set(ref(dbA, "curriculum/lesson-x"), { title: "x" }), "writing the teacher's lesson list");
  await assertFails(set(ref(dbA, "studentCurriculum/A111111/lesson-x"), { title: "x", published: true }), "assigning themselves a lesson");
  await assertFails(set(ref(dbA, "protectedContent/lesson-a/classwork/content/title"), "hacked"), "editing protected content");
  await assertFails(set(ref(dbA, "protectedContent/lesson-z/manga"), { content: {} }), "adding protected content");
  await assertFails(set(ref(dbA, "studentFeatures/A111111/mangaReader"), true), "switching on their own features");
  await assertFails(set(ref(dbA, "mangaAssignments/A111111/s/c"), { assignedAt: 1 }));
  await assertFails(set(ref(dbA, "lessonClock/A111111/lesson-a"), { state: "running" }), "starting the teacher's lesson clock");
  await assertFails(set(ref(dbA, "sessions/A111111/commands/cmd-9"), { type: "goto", payload: { stage: 9 }, createdAt: 9 }), "sending themselves teacher commands");
  await assertFails(set(ref(dbA, "studentByUid/student-b"), "A111111"), "re-pointing another student's identity");
  await assertFails(set(ref(dbA, "students/B222222/name"), "renamed"), "renaming another student");
  await assertFails(get(ref(dbA, "students")), "listing every student");
  await assertFails(get(ref(dbA, "sessions")), "listing every session");
  await assertFails(get(ref(dbA, "studentProgress")), "listing every student's progress");
  await assertFails(get(ref(dbA, "studentCurriculum")), "listing every curriculum");
});

test("threat list: write abuse is bounded (size, shape, unknown fields)", async () => {
  const dbA = testEnv.authenticatedContext("student-a").database();
  const huge = "x".repeat(200000);
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/w1"), { word: huge }), "an oversized saved word");
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/w2"), { word: "ok", surprise: "extra field" }), "an unknown field");
  await assertFails(set(ref(dbA, "studentProgress/A111111/vocabulary/bad key!"), { word: "ok" }), "a malformed key");
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/r1"), { stage: 3, questionId: "q", prompt: "p", studentAnswer: huge, autoResult: false, ts: 1 }), "an oversized review answer");
  await assertFails(set(ref(dbA, "sessions/A111111/reviewQueue/r2"), { stage: 99, questionId: "q", prompt: "p", studentAnswer: "a", autoResult: false, ts: 1 }), "an out-of-range stage");
  await assertFails(set(ref(dbA, "sessions/A111111/unknownNode"), { a: 1 }), "an unknown session node");
  await assertFails(set(ref(dbA, "studentProgress/A111111/unknownNode"), { a: 1 }), "an unknown progress node");
  await assertFails(set(ref(dbA, "studentProgress/A111111/xp"), 99999999), "minting XP");
});

test("data deletion: a teacher can delete everything held for a student, nobody else can, and a teacher still cannot write progress", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "studentProgress/A111111"), { xp: 10, level: 1 });
    await set(ref(db, "sessionSummary/A111111"), { score: 1, stage: 1, streak: 0, elapsed: 5, doneCount: 0, lastUpdate: 1 });
    await set(ref(db, "sessions/A111111/state"), { stage: 1 });
    await set(ref(db, "whiteboards/A111111/lesson-a/mode"), "view");
    await set(ref(db, "lessonClock/A111111/lesson-a"), { state: "stopped", totalMs: 1, rev: 1 });
  });
  for (const path of ["studentProgress/A111111", "sessionSummary/A111111", "sessions/A111111", "whiteboards/A111111", "lessonClock/A111111"]) {
    await assertFails(remove(ref(dbB, path)), `another student deleting ${path}`);
    await assertFails(set(ref(teacher, `${path}/zz`), { a: 1 }), `a teacher writing (not deleting) ${path}/zz`);
  }
  await assertFails(set(ref(teacher, "studentProgress/A111111"), { xp: 99999, level: 9 }), "a teacher cannot overwrite progress");
  await assertFails(remove(ref(dbA, "sessions/A111111")), "a student cannot delete their own session wholesale");
  await assertSucceeds(set(ref(dbA, "studentProgress/A111111/xp"), 20), "the student's own progress writes still work");
  for (const path of ["studentProgress/A111111", "sessionSummary/A111111", "sessions/A111111", "whiteboards/A111111", "lessonClock/A111111", "studentCurriculum/A111111", "studentFeatures/A111111", "mangaAssignments/A111111", "students/A111111", "studentByUid/student-a"]) {
    await assertSucceeds(remove(ref(teacher, path)), `a teacher deleting ${path}`);
  }
});

test("the teacher can read a student's whole whiteboard node (for export); other students cannot", async () => {
  const teacher = testEnv.authenticatedContext("teacher").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), "whiteboards/A111111/lesson-a/mode"), "view"); });
  await assertSucceeds(get(ref(teacher, "whiteboards/A111111")));
  await assertFails(get(ref(dbB, "whiteboards/A111111")));
});

test("client error reports: own code only, fifty slots, bounded fields, teacher reads and clears", async () => {
  await testEnv.withSecurityRulesDisabled(async context => { await set(ref(context.database(), "students/A111111"), { uid: "student-a", name: "A" }); }); // an earlier test deletes this student
  const dbA = testEnv.authenticatedContext("student-a").database();
  const dbB = testEnv.authenticatedContext("student-b").database();
  const teacher = testEnv.authenticatedContext("teacher").database();
  const report = { ts: 1790000000000, diag: "E-1A2B3C", page: "lesson.html", message: "x is not a function", stack: "at a\nat b", agent: "Mozilla/5.0" };
  await assertSucceeds(set(ref(dbA, "clientErrors/A111111/0"), report));
  await assertSucceeds(set(ref(dbA, "clientErrors/A111111/49"), { ts: 1, diag: "E-000000", page: "p", message: "m" }));
  await assertFails(set(ref(dbA, "clientErrors/A111111/50"), report), "only slots 0 to 49 exist, so the list cannot grow");
  await assertFails(set(ref(dbA, "clientErrors/A111111/abc"), report));
  await assertFails(set(ref(dbB, "clientErrors/A111111/1"), report), "another student cannot write it");
  await assertFails(set(ref(dbA, "clientErrors/B222222/1"), report), "or write under another code");
  await assertFails(get(ref(dbA, "clientErrors/A111111")), "students cannot read the reports back");
  await assertFails(set(ref(dbA, "clientErrors/A111111/2"), { ...report, message: "m".repeat(201) }));
  await assertFails(set(ref(dbA, "clientErrors/A111111/2"), { ...report, stack: "s".repeat(601) }));
  await assertFails(set(ref(dbA, "clientErrors/A111111/2"), { ...report, diag: "oops" }));
  await assertFails(set(ref(dbA, "clientErrors/A111111/2"), { ...report, extra: "<b>" }));
  await assertFails(set(ref(dbA, "clientErrors/A111111/2"), { ts: 1, diag: "E-000000", page: "p" }), "message is required");
  await assertSucceeds(get(ref(teacher, "clientErrors/A111111")));
  await assertFails(set(ref(teacher, "clientErrors/A111111/3"), report), "a teacher reads and clears but does not write reports");
  await assertSucceeds(remove(ref(teacher, "clientErrors/A111111")));
});
