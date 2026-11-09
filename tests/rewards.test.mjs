import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_ITEMS, BADGES, DAILY_XP_CAP, LEVEL_THRESHOLDS, MAX_FREEZES, WEEKLY_QUESTS, applyRewards, buyItem, equipItem, levelFor, questProgress, weekKey, xpForResult, xpToNextLevel
} from "../js/games/rewards.js";
import { applyGamification } from "../js/games/engine.js";

const at = text => Date.parse(`${text}T12:00:00Z`);

test("levels follow the configured thresholds and keep going past the table", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(levelFor(219), 2);
  assert.equal(levelFor(220), 3);
  assert.equal(levelFor(LEVEL_THRESHOLDS[19]), 20);
  assert.equal(levelFor(LEVEL_THRESHOLDS[19] + 500), 21);
  assert.equal(levelFor(-5), 1);
  assert.equal(levelFor("abc"), 1);
  assert.deepEqual(xpToNextLevel(150), { level: 2, next: 220, remaining: 70 });
});

test("XP: 10 per answer, perfect and run bonuses, bounded", () => {
  assert.equal(xpForResult({ score: 3, total: 5 }), 30);
  assert.equal(xpForResult({ score: 5, total: 5 }), 55);
  assert.equal(xpForResult({ score: 5, total: 5, bestRun: 5 }), 57);
  assert.equal(xpForResult({ score: 5, total: 5, bestRun: 99 }), 65, "the run bonus stops at 10");
  assert.equal(xpForResult({ score: 0, total: 4 }), 0);
  assert.ok(xpForResult({ score: 400, total: 400 }) <= 500, "one result can never pay more than the database allows");
});

test("the daily XP cap stops grinding but never blocks playing", () => {
  let state = {};
  for (let i = 0; i < 12; i++) state = applyRewards(state, { score: 10, total: 10 }, at("2026-11-04") + i * 1000);
  assert.equal(state.xp, DAILY_XP_CAP);
  assert.equal(state.daily.games, 12, "games still count");
  assert.equal(state.stats.games, 12);
  const next = applyRewards(state, { score: 10, total: 10 }, at("2026-11-05"));
  assert.equal(next.xp, DAILY_XP_CAP + 105, "a new day pays again");
  assert.equal(applyRewards(state, { score: 10, total: 10 }, at("2026-11-04"))._info.capped, true);
});

test("streaks: next day grows, a gap resets, one missed day is covered by a freeze, a week earns a freeze", () => {
  const base = { streak: 2, lastActivityDate: "2026-11-03", streakFreezes: 0 };
  assert.equal(applyRewards(base, { score: 1, total: 1 }, at("2026-11-04")).streak, 3);
  assert.equal(applyRewards(base, { score: 1, total: 1 }, at("2026-11-03")).streak, 2, "same day changes nothing");
  assert.equal(applyRewards(base, { score: 1, total: 1 }, at("2026-11-07")).streak, 1);
  const covered = applyRewards({ ...base, streakFreezes: 1 }, { score: 1, total: 1 }, at("2026-11-05"));
  assert.equal(covered.streak, 2); assert.equal(covered.streakFreezes, 0); assert.equal(covered._info.streakFreezeUsed, true);
  const gap3 = applyRewards({ ...base, streakFreezes: 1 }, { score: 1, total: 1 }, at("2026-11-06"));
  assert.equal(gap3.streak, 1, "two missed days is too many for one freeze");
  const week = applyRewards({ streak: 6, lastActivityDate: "2026-11-03", streakFreezes: 0 }, { score: 1, total: 1 }, at("2026-11-04"));
  assert.equal(week.streak, 7); assert.equal(week.streakFreezes, 1);
  const full = applyRewards({ streak: 13, lastActivityDate: "2026-11-03", streakFreezes: MAX_FREEZES }, { score: 1, total: 1 }, at("2026-11-04"));
  assert.equal(full.streakFreezes, MAX_FREEZES, "freezes are capped");
});

test("weeks start on Monday and roll over cleanly across New Year", () => {
  assert.equal(weekKey(at("2026-11-09")), "2026-11-09");
  assert.equal(weekKey(at("2026-11-15")), "2026-11-09");
  assert.equal(weekKey(at("2026-01-01")), "2025-12-29", "1 January 2026 is a Thursday, so its week began in 2025");
  assert.equal(weekKey(at("2026-01-04")), "2025-12-29");
  assert.equal(weekKey(at("2026-01-05")), "2026-01-05");
  const dec = applyRewards({}, { score: 1, total: 1, words: 4 }, at("2025-12-31"));
  const jan = applyRewards(dec, { score: 1, total: 1, words: 4 }, at("2026-01-02"));
  assert.equal(jan.weekly.week, "2025-12-29");
  assert.equal(jan.weekly.words, 8, "the same week keeps adding up across the year boundary");
  const next = applyRewards(jan, { score: 1, total: 1 }, at("2026-01-05"));
  assert.equal(next.weekly.week, "2026-01-05"); assert.equal(next.weekly.words, 0, "a new week starts again");
});

test("weekly quests: progress, completion pays gems once and counts the week", () => {
  let state = {};
  state = applyRewards(state, { score: 3, total: 3, words: 15 }, at("2026-11-09"));
  assert.deepEqual(questProgress(state.weekly).map(q => q.done), [true, false, false]);
  for (let i = 0; i < 3; i++) state = applyRewards(state, { score: 2, total: 2, kind: "listening" }, at("2026-11-10"));
  assert.equal(state.weekly.questComplete, false);
  const gemsBefore = state.gems;
  state = applyRewards(state, { score: 2, total: 2 }, at("2026-11-11"));
  assert.equal(state.weekly.games, 5);
  assert.equal(state.weekly.questComplete, true);
  assert.equal(state.gems, gemsBefore + 5 + 0, "the weekly reward");
  assert.equal(state.stats.weeks, 1);
  assert.equal(state._info.weeklyDone, true);
  const again = applyRewards(state, { score: 2, total: 2 }, at("2026-11-12"));
  assert.equal(again.stats.weeks, 1, "paid only once per week");
  assert.equal(WEEKLY_QUESTS.length, 3);
});

test("there are at least 20 badges with ids, icons and criteria, and they are awarded from the stats", () => {
  assert.ok(BADGES.length >= 20);
  assert.equal(new Set(BADGES.map(b => b.id)).size, BADGES.length);
  for (const badge of BADGES) { assert.match(badge.id, /^[a-z0-9-]{3,40}$/); assert.ok(badge.icon && badge.name && badge.criteria); }
  const first = applyRewards({}, { score: 3, total: 3 }, at("2026-11-04"));
  for (const id of ["first-game", "perfect-round", "first-level-up"]) assert.ok(first.badges.includes(id) || id === "first-level-up", id);
  assert.ok(first._info.newBadges.includes("first-game"));
  assert.ok(!first.badges.includes("five-games"));
  const hunter = applyRewards({ stats: { hunts: 8 } }, { score: 3, total: 3, kind: "error-hunt", fixes: 3 }, at("2026-11-04"));
  assert.ok(hunter.badges.includes("error-spotter"));
  const boss = applyRewards({}, { score: 3, total: 5, kind: "boss", won: true }, at("2026-11-04"));
  assert.ok(boss.badges.includes("boss-slayer"));
  const lost = applyRewards({}, { score: 3, total: 5, kind: "boss", won: false }, at("2026-11-04"));
  assert.ok(!lost.badges.includes("boss-slayer"));
  const kept = applyRewards({ badges: ["three-day-streak"] }, { score: 1, total: 1 }, at("2026-11-04"));
  assert.ok(kept.badges.includes("three-day-streak"), "badges are never taken away");
});

test("hearts never lock anyone out and can be switched off", () => {
  assert.equal(applyRewards({ hearts: 1 }, { score: 0, total: 5 }, at("2026-11-04")).hearts, 0);
  assert.equal(applyRewards({ hearts: 3 }, { score: 0, total: 5 }, at("2026-11-04"), { hearts: false }).hearts, 3);
});

test("rejects impossible results", () => {
  assert.throws(() => applyRewards({}, { score: 5, total: 3 }, 0));
  assert.throws(() => applyRewards({}, { score: -1, total: 3 }, 0));
  assert.throws(() => applyRewards({}, { score: 1.5, total: 3 }, 0));
  assert.throws(() => applyRewards({}, null, 0));
  assert.throws(() => applyRewards({}, { score: 0, total: 0 }, 0));
});

test("applyGamification keeps its old shape for existing callers and never leaks screen-only fields", () => {
  const next = applyGamification({}, { score: 2, total: 2 }, at("2026-11-04"));
  assert.equal("_info" in next, false);
  assert.equal(next.xp, 25);
});

test("avatar shop: gems buy looks, not answers; no double buying; equip needs ownership", () => {
  assert.ok(AVATAR_ITEMS.length >= 6);
  assert.equal(buyItem({ gems: 2 }, "frame-sun").reason, "gems");
  assert.equal(buyItem({ gems: 50 }, "nope").reason, "unknown");
  const bought = buyItem({ gems: 12 }, "frame-sun");
  assert.equal(bought.ok, true); assert.equal(bought.state.gems, 7); assert.deepEqual(bought.state.avatar.owned, ["frame-sun"]); assert.equal(bought.state.avatar.frame, "frame-sun");
  assert.equal(buyItem(bought.state, "frame-sun").reason, "owned");
  assert.equal(equipItem(bought.state, "frame-leaf").reason, "not-owned");
  const two = buyItem({ ...bought.state, gems: 20 }, "frame-leaf");
  assert.equal(equipItem({ ...two.state, avatar: { ...two.state.avatar, frame: "frame-sun" } }, "frame-leaf").state.avatar.frame, "frame-leaf");
});
