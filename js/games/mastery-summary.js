// Teacher view of games and mastery, built from studentProgress (attempts, topics, reviewQueue, stats, badges).
// Pure functions: no DOM, no Firebase.
import { GAME_META } from "./engine.js";
import { BADGES, levelFor } from "./rewards.js";

const list = value => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const TREND_DAYS = 7;

export const skillOf = gameType => (gameType === "listening" ? "listening" : (GAME_META[gameType] && GAME_META[gameType].skill) || "other");

export function accuracyBySkill(progress) {
  const out = new Map();
  for (const attempt of list(progress && progress.attempts)) {
    if (!attempt || num(attempt.total) <= 0) continue;
    const skill = skillOf(attempt.gameType);
    const row = out.get(skill) || { skill, games: 0, score: 0, total: 0, seconds: 0 };
    row.games += 1; row.score += num(attempt.score); row.total += num(attempt.total); row.seconds += num(attempt.timeSpentSeconds);
    out.set(skill, row);
  }
  return [...out.values()].map(row => ({ ...row, accuracy: row.total ? row.score / row.total : 0 })).sort((a, b) => b.games - a.games);
}

export function accuracyByTopic(progress) {
  return Object.values((progress && progress.topics) || {}).filter(topic => topic && num(topic.total) > 0)
    .map(topic => ({ label: String(topic.label || ""), attempts: num(topic.attempts), accuracy: num(topic.score) / num(topic.total), total: num(topic.total) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

// Items missed most often, from the review queue (every mistake is queued, so repeats count).
export function weakestItems(progress, limit = 10) {
  const counts = new Map();
  for (const entry of list(progress && progress.reviewQueue)) {
    if (!entry || typeof entry.prompt !== "string") continue;
    const key = String(entry.itemId || entry.prompt);
    const row = counts.get(key) || { itemId: key, prompt: entry.prompt.slice(0, 140), answer: String(entry.answer || "").slice(0, 80), topic: String(entry.topic || ""), misses: 0 };
    row.misses += 1; counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.misses - a.misses || a.prompt.localeCompare(b.prompt)).slice(0, limit);
}

// Points from game scores over the last days, oldest first, so a teacher can see whether practice is happening.
export function recentPoints(progress, now = Date.now(), days = TREND_DAYS) {
  const buckets = Array.from({ length: days }, (_, index) => { const day = new Date(now - (days - 1 - index) * 86400000).toISOString().slice(0, 10); return { day, games: 0, score: 0 }; });
  for (const attempt of list(progress && progress.attempts)) {
    const day = String(attempt && attempt.completedAt || "").slice(0, 10);
    const bucket = buckets.find(item => item.day === day);
    if (bucket) { bucket.games += 1; bucket.score += num(attempt.score); }
  }
  return buckets;
}

export function summarizeMastery(progress, now = Date.now()) {
  const p = progress && typeof progress === "object" ? progress : {};
  const attempts = list(p.attempts).filter(item => item && num(item.total) > 0);
  const stats = p.stats || {};
  return {
    games: attempts.length,
    accuracy: attempts.reduce((sum, item) => sum + num(item.total), 0) ? attempts.reduce((sum, item) => sum + num(item.score), 0) / attempts.reduce((sum, item) => sum + num(item.total), 0) : 0,
    seconds: attempts.reduce((sum, item) => sum + num(item.timeSpentSeconds), 0),
    xp: num(p.xp), level: levelFor(p.xp), streak: num(p.streak), freezes: num(p.streakFreezes),
    badges: list(p.badges).length, badgeTotal: BADGES.length, stats,
    skills: accuracyBySkill(p), topics: accuracyByTopic(p), weakest: weakestItems(p), trend: recentPoints(p, now)
  };
}

// Words and items the whole class struggles with: each student's misses, summed.
export function classMostMissed(progressList, limit = 10) {
  const counts = new Map();
  for (const progress of progressList) for (const row of weakestItems(progress, 100)) {
    const known = counts.get(row.itemId) || { ...row, misses: 0, students: 0 };
    known.misses += row.misses; known.students += 1; counts.set(row.itemId, known);
  }
  return [...counts.values()].sort((a, b) => b.students - a.students || b.misses - a.misses).slice(0, limit);
}

const csvCell = value => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
export function masteryCsv(rows) { // rows: [{ code, name, summary }]
  const header = ["Student", "Code", "Games", "Accuracy %", "Minutes", "XP", "Level", "Streak", "Badges", "Weakest items"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const s = row.summary;
    lines.push([row.name, row.code, s.games, Math.round(s.accuracy * 100), Math.round(s.seconds / 60), s.xp, s.level, s.streak, s.badges, s.weakest.slice(0, 3).map(item => item.prompt).join(" | ")].map(csvCell).join(","));
  }
  return lines.join("\n");
}
