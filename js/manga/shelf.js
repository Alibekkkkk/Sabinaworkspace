// The chapters shelf (for the student) and the teacher's rows. Pure functions.
import { dueState } from "../schedule.js";

// records: studentProgress/<code>/manga/<mangaId>; assignments: mangaAssignments/<code>/<mangaId>
export function chapterShelf(manga, records = {}, assignments = {}, now = Date.now(), timeZone = "UTC") {
  return manga.chapters.map(chapter => {
    const record = (records && records[chapter.id]) || null; const assignment = (assignments && assignments[chapter.id]) || null;
    const pages = chapter.pages.length; const read = record ? Math.min(pages, Number(record.pagesRead) || 0) : 0;
    const done = Boolean(record && record.completedAt);
    const due = assignment && assignment.dueAt ? dueState({ dueAt: assignment.dueAt }, now, timeZone) : { state: "none", label: "" };
    return {
      id: chapter.id, title: chapter.title, summary: chapter.summary, minutes: chapter.estimatedMinutes, pages, pagesRead: read,
      state: done ? "done" : read > 0 ? "reading" : "new", stars: done ? Number(record.stars) || 0 : 0, bossWon: Boolean(record && record.bossWon),
      assigned: Boolean(assignment), due, percent: Math.round((read / pages) * 100)
    };
  });
}

// Which chapter to open next: the one in progress, else the first not finished, else the first. Assigned and due chapters win ties.
export function nextChapter(shelf) {
  const urgent = shelf.find(item => item.state !== "done" && item.assigned && ["overdue", "due-today", "due-soon"].includes(item.due.state));
  return urgent || shelf.find(item => item.state === "reading") || shelf.find(item => item.state !== "done") || shelf[0] || null;
}

// Shelf badges come from the saved chapter records, so they need no extra database fields.
export const SHELF_BADGES = Object.freeze([
  { id: "first-page", name: "First pages", icon: "📖", criteria: "Read a page of a chapter.", earned: s => s.some(item => item.pagesRead > 0) },
  { id: "chapter-done", name: "Chapter finished", icon: "🏁", criteria: "Finish a chapter.", earned: s => s.some(item => item.state === "done") },
  { id: "boss-slayer", name: "Boss slayer", icon: "🐉", criteria: "Win a chapter boss fight.", earned: s => s.some(item => item.bossWon) },
  { id: "three-stars", name: "Perfect reader", icon: "⭐", criteria: "Earn three stars on a chapter.", earned: s => s.some(item => item.stars === 3) },
  { id: "story-complete", name: "Whole story", icon: "📚", criteria: "Finish every chapter.", earned: s => s.length > 0 && s.every(item => item.state === "done") }
]);
export const earnedBadges = shelf => SHELF_BADGES.filter(badge => badge.earned(shelf));

// One row per chapter for the teacher: pages, time, words, quiz accuracy and what waits for review.
export function teacherRows(manga, records = {}, assignments = {}, reviewItems = [], now = Date.now(), timeZone = "UTC") {
  const waiting = new Map();
  for (const item of Array.isArray(reviewItems) ? reviewItems : []) {
    const match = item && typeof item.questionId === "string" ? /^manga:([^:]+):/.exec(item.questionId) : null;
    if (match) waiting.set(match[1], (waiting.get(match[1]) || 0) + 1);
  }
  return chapterShelf(manga, records, assignments, now, timeZone).map(item => {
    const record = (records && records[item.id]) || {};
    const quizTotal = (Number(record.quickTotal) || 0) + (Number(record.qTotal) || 0);
    const quizScore = (Number(record.quickScore) || 0) + (Number(record.qScore) || 0);
    return {
      ...item, minutes: Math.round((Number(record.seconds) || 0) / 60), words: Number(record.words) || 0, attempts: Number(record.attempts) || 0,
      accuracy: quizTotal ? Math.round((quizScore / quizTotal) * 100) : null, awaitingReview: waiting.get(item.id) || 0
    };
  });
}
