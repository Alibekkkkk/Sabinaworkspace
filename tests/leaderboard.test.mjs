import assert from "node:assert/strict";
import test from "node:test";
import { encouragement, isoWeekId, MAX_WEEKLY_XP, previousWeekId, rankEntries, validateNickname, weeklyXpSince } from "../js/leaderboard.js";

test("nicknames are 3-16 safe characters and rude ones are rejected, including simple disguises", () => {
  for (const good of ["Sky", "Maple Fox", "Ace_99", "blue-owl", "A1b", "Abcdefghijklmnop"]) {
    assert.equal(validateNickname(good).valid, true, good);
  }
  for (const bad of ["", "ab", "Abcdefghijklmnopq", "<b>hi</b>", "-lead", "trail-", "emoji😀fun", "f.u.c.k"]) {
    assert.equal(validateNickname(bad).valid, false, bad);
  }
  for (const rude of ["sh1t", "F U C K", "b1tch", "p0rn_fan", "n4zi"]) {
    assert.equal(validateNickname(rude).valid, false, rude);
  }
  assert.equal(validateNickname("  Maple   Fox ").nickname, "Maple Fox");
  assert.equal(validateNickname(undefined).valid, false);
  assert.equal(validateNickname("Scunthorpe").valid, false, "known trade-off: substring filtering can reject innocent words; the student just picks another nickname");
});

test("ISO week ids handle year boundaries and DST-free UTC weeks", () => {
  assert.equal(isoWeekId(new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(isoWeekId(new Date("2025-12-29T00:00:00Z")), "2026-W01");
  assert.equal(isoWeekId(new Date("2027-01-03T23:59:59Z")), "2026-W53");
  assert.equal(isoWeekId(new Date("2027-01-04T00:00:00Z")), "2027-W01");
  assert.equal(isoWeekId(new Date("2026-03-29T00:30:00Z")), "2026-W13");
  assert.equal(isoWeekId(new Date("2026-03-30T00:00:00Z")), "2026-W14");
  assert.equal(previousWeekId(new Date("2026-01-05T10:00:00Z")), "2026-W01");
  assert.equal(previousWeekId(new Date("2027-01-04T10:00:00Z")), "2026-W53");
});

test("weekly XP is the gain since the baseline, never negative, never above the cap", () => {
  assert.equal(weeklyXpSince(100, 160), 60);
  assert.equal(weeklyXpSince(100, 100), 0);
  assert.equal(weeklyXpSince(100, 40), 0);
  assert.equal(weeklyXpSince(0, 99999), MAX_WEEKLY_XP);
  assert.equal(weeklyXpSince(undefined, 5), 0);
  assert.equal(weeklyXpSince(10, "abc"), 0);
});

test("ranking: ties share a rank, only nicknamed students appear, own rank is reported beyond the top 10", () => {
  const scores = { u1: 50, u2: 80, u3: 80, u4: 10, hidden: 999 };
  const names = { u1: "Fox", u2: "Owl", u3: "Bee", u4: "Ant" };
  const ranked = rankEntries(scores, names, "u1");
  assert.deepEqual(ranked.top.map(row => [row.nickname, row.rank]), [["Bee", 1], ["Owl", 1], ["Fox", 3], ["Ant", 4]]);
  assert.equal(ranked.total, 4);
  assert.deepEqual(ranked.own, { rank: 3, nickname: "Fox", xp: 50 });
  assert.ok(ranked.top.every(row => !("uid" in row)), "uids must not leak into the display rows");

  const many = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`u${index}`, 100 - index]));
  const manyNames = Object.fromEntries(Object.keys(many).map(uid => [uid, `Name ${uid}`]));
  const result = rankEntries(many, manyNames, "u12");
  assert.equal(result.top.length, 10);
  assert.equal(result.own.rank, 13);
  assert.equal(rankEntries({}, {}, "x").own, null);
  assert.deepEqual(rankEntries(undefined, undefined, "x").top, []);
});

test("encouragement celebrates improvement before rank", () => {
  assert.match(encouragement({ rank: 4, total: 5, xp: 90, lastWeekXp: 40 }), /50 XP ahead of last week/);
  assert.match(encouragement({ rank: 3, total: 5, xp: 90, lastWeekXp: 200 }), /110 XP to beat/);
  assert.match(encouragement({ rank: 1, total: 5, xp: 90, lastWeekXp: 0 }), /lead/);
  assert.match(encouragement({ rank: 2, total: 5, xp: 0, lastWeekXp: 50 }), /fresh week/);
  assert.match(encouragement({ rank: 0, total: 0, xp: 0, lastWeekXp: 0 }), /first/);
});
