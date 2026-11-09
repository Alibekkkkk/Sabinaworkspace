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
