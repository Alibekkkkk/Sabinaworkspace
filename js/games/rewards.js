// Reward loop: XP with accuracy and run bonuses and a daily cap, levels, gems, streaks with earned freezes, weekly quests,
// 20+ badges and a small avatar shop. Pure functions, no DOM and no Firebase; `now` is always passed in.
export const LEVEL_THRESHOLDS = Object.freeze([0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620, 1900, 2200, 2520, 2860, 3220, 3600, 4000, 4420, 4860, 5320]);
export const LEVEL_STEP_AFTER = 500; // each level beyond the table needs this much more
export const DAILY_XP_CAP = 400; // grinding the same game all day stops paying XP
export const MAX_XP_PER_RESULT = 500; // also enforced by the database rules (600 per write)
export const MAX_FREEZES = 3;
export const HINT_XP_COST = 3; // a hint (reveal a letter) takes this much off the round's XP
export const WEEKLY_QUESTS = Object.freeze([
  { id: "words", label: "Learn 15 words", field: "words", goal: 15 },
  { id: "listening", label: "Do 3 listening rounds", field: "listening", goal: 3 },
  { id: "games", label: "Play 5 games", field: "games", goal: 5 }
]);
export const WEEKLY_REWARD_GEMS = 5;
export const SKILLS = Object.freeze(["vocab", "grammar", "reading", "listening", "speaking", "spelling"]);

export function levelFor(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) if (value >= LEVEL_THRESHOLDS[i]) level = i + 1;
  const top = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  if (value > top) level = LEVEL_THRESHOLDS.length + Math.floor((value - top) / LEVEL_STEP_AFTER);
  return level;
}

export function xpToNextLevel(xp) {
  const level = levelFor(xp);
  const next = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length + 1) * LEVEL_STEP_AFTER;
  return { level, next, remaining: Math.max(0, next - (Number(xp) || 0)) };
}

export const dateKey = now => new Date(now).toISOString().slice(0, 10);

// Monday of the week as YYYY-MM-DD in UTC. A date string, so a week that spans New Year keeps one id.
export function weekKey(now) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start.toISOString().slice(0, 10);
}

export function daysBetween(fromKey, toKey) {
  return Math.floor((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

// Raw XP a finished round is worth before the daily cap: 10 per correct answer, +5 for a perfect round,
// +2 for every three correct answers in a row (at most +10), minus 3 for each hint used (never below 0).
export function xpForResult(result) {
  const score = Math.max(0, Math.floor(Number(result.score) || 0));
  const total = Math.max(1, Math.floor(Number(result.total) || 1));
  const run = Math.max(0, Math.floor(Number(result.bestRun) || 0));
  const hints = Math.max(0, Math.floor(Number(result.hints) || 0));
  const raw = score * 10 + (score === total ? 5 : 0) + Math.min(10, Math.floor(run / 3) * 2) - hints * HINT_XP_COST;
  return Math.max(0, Math.min(MAX_XP_PER_RESULT, raw));
}

const num = value => Math.max(0, Number(value) || 0);

export const BADGES = Object.freeze([
  { id: "first-game", name: "First steps", icon: "👣", criteria: "Finish your first game.", earned: s => s.stats.games >= 1 },
  { id: "five-games", name: "Getting going", icon: "🎮", criteria: "Finish 5 games.", earned: s => s.stats.games >= 5 },
  { id: "twenty-five-games", name: "Regular player", icon: "🕹️", criteria: "Finish 25 games.", earned: s => s.stats.games >= 25 },
  { id: "perfect-round", name: "Perfect round", icon: "🎯", criteria: "Get every answer right in one game.", earned: s => s.stats.perfect >= 1 },
  { id: "five-perfect", name: "Sharpshooter", icon: "🏹", criteria: "Get 5 perfect rounds.", earned: s => s.stats.perfect >= 5 },
  { id: "three-day-streak", name: "Three days running", icon: "🔥", criteria: "Practise 3 days in a row.", earned: s => s.streak >= 3 },
  { id: "seven-day-streak", name: "One week streak", icon: "🌟", criteria: "Practise 7 days in a row.", earned: s => s.streak >= 7 },
  { id: "thirty-day-streak", name: "Habit master", icon: "🏆", criteria: "Practise 30 days in a row.", earned: s => s.streak >= 30 },
  { id: "first-level-up", name: "Level up", icon: "⬆️", criteria: "Reach level 2.", earned: s => s.level >= 2 },
  { id: "level-5", name: "Rising star", icon: "⭐", criteria: "Reach level 5.", earned: s => s.level >= 5 },
  { id: "level-10", name: "Veteran", icon: "🎖️", criteria: "Reach level 10.", earned: s => s.level >= 10 },
  { id: "word-collector-25", name: "Word collector", icon: "📚", criteria: "Learn 25 words.", earned: s => s.stats.words >= 25 },
  { id: "word-collector-100", name: "Word hoarder", icon: "🗃️", criteria: "Learn 100 words.", earned: s => s.stats.words >= 100 },
  { id: "listening-ear", name: "Listening ear", icon: "👂", criteria: "Finish 3 listening rounds.", earned: s => s.stats.listening >= 3 },
  { id: "listening-star", name: "Sharp ears", icon: "🎧", criteria: "Finish 15 listening rounds.", earned: s => s.stats.listening >= 15 },
  { id: "boss-slayer", name: "Boss slayer", icon: "🐉", criteria: "Defeat a unit boss.", earned: s => s.stats.boss >= 1 },
  { id: "error-spotter", name: "Eagle eye", icon: "🦅", criteria: "Fix 10 mistakes in Error Hunt.", earned: s => s.stats.hunts >= 10 },
  { id: "review-master", name: "Review master", icon: "🧠", criteria: "Answer 20 review items correctly.", earned: s => s.stats.reviewed >= 20 },
  { id: "accuracy-ace", name: "Accuracy ace", icon: "✅", criteria: "Give 100 correct answers.", earned: s => s.stats.correct >= 100 },
  { id: "gem-saver", name: "Gem saver", icon: "💎", criteria: "Hold 50 gems at once.", earned: s => s.gems >= 50 },
  { id: "weekly-champion", name: "Weekly champion", icon: "📅", criteria: "Finish all weekly goals.", earned: s => s.stats.weeks >= 1 },
  { id: "freeze-keeper", name: "Streak keeper", icon: "🧊", criteria: "Earn a streak freeze.", earned: s => s.streakFreezes >= 1 }
]);

export const AVATAR_ITEMS = Object.freeze([
  { id: "frame-sun", slot: "frame", name: "Sun frame", icon: "🌞", cost: 5 },
  { id: "frame-leaf", slot: "frame", name: "Leaf frame", icon: "🍃", cost: 5 },
  { id: "frame-star", slot: "frame", name: "Star frame", icon: "⭐", cost: 10 },
  { id: "theme-sea", slot: "theme", name: "Sea theme", icon: "🌊", cost: 8 },
  { id: "theme-forest", slot: "theme", name: "Forest theme", icon: "🌲", cost: 8 },
  { id: "theme-night", slot: "theme", name: "Night theme", icon: "🌙", cost: 12 },
  { id: "pet-fox", slot: "pet", name: "Fox buddy", icon: "🦊", cost: 15 },
  { id: "pet-owl", slot: "pet", name: "Owl buddy", icon: "🦉", cost: 15 }
]);

// Gems buy looks, never answers. Returns { ok, state } or { ok: false, reason }.
export function buyItem(state, itemId) {
  const item = AVATAR_ITEMS.find(entry => entry.id === itemId);
  if (!item) return { ok: false, reason: "unknown" };
  const avatar = state.avatar && typeof state.avatar === "object" ? state.avatar : {};
  const owned = Array.isArray(avatar.owned) ? avatar.owned : [];
  if (owned.includes(item.id)) return { ok: false, reason: "owned" };
  const gems = num(state.gems);
  if (gems < item.cost) return { ok: false, reason: "gems" };
  return { ok: true, state: { ...state, gems: gems - item.cost, avatar: { ...avatar, owned: [...owned, item.id], [item.slot]: item.id } } };
}

export function equipItem(state, itemId) {
  const item = AVATAR_ITEMS.find(entry => entry.id === itemId);
  const avatar = state.avatar && typeof state.avatar === "object" ? state.avatar : {};
  if (!item || !(avatar.owned || []).includes(item.id)) return { ok: false, reason: "not-owned" };
  return { ok: true, state: { ...state, avatar: { ...avatar, [item.slot]: item.id } } };
}

const STAT_KEYS = ["games", "perfect", "correct", "words", "listening", "boss", "hunts", "reviewed", "weeks"];
const cleanStats = value => Object.fromEntries(STAT_KEYS.map(key => [key, num(value && value[key])]));

export function questProgress(weekly) {
  const state = weekly && typeof weekly === "object" ? weekly : {};
  return WEEKLY_QUESTS.map(quest => ({ ...quest, value: Math.min(quest.goal, num(state[quest.field])), done: num(state[quest.field]) >= quest.goal }));
}

// result: { score, total, mistakes?, bestRun?, words?, kind?: "listening"|"boss"|"error-hunt"|"review"|"game", won?, fixes? }
// options: { hearts: false } turns heart loss off (the live-lesson default).
export function applyRewards(previous, result, now = Date.now(), options = {}) {
  if (!result || !Number.isInteger(result.score) || !Number.isInteger(result.total) || result.score < 0 || result.total < 1 || result.score > result.total) {
    throw new Error("A valid completed game result is required.");
  }
  const state = previous && typeof previous === "object" ? previous : {};
  const date = dateKey(now);
  const week = weekKey(now);
  const previousDate = String(state.lastActivityDate || "");
  const dayGap = previousDate ? daysBetween(previousDate, date) : 0;
  let streak = num(state.streak);
  let streakFreezes = Math.min(MAX_FREEZES, num(state.streakFreezes));
  let streakFreezeUsed = false;
  if (!previousDate) streak = 1;
  else if (dayGap === 1) streak += 1;
  else if (dayGap === 2 && streakFreezes > 0) { streakFreezes -= 1; streakFreezeUsed = true; } // the missed day is covered, the streak is kept
  else if (dayGap > 1) streak = 1;
  if (streak > num(state.streak) && streak % 7 === 0 && streakFreezes < MAX_FREEZES) streakFreezes += 1; // earned, used automatically

  const daily = state.daily && state.daily.date === date ? state.daily : { date, games: 0, correct: 0, xp: 0 };
  const earnedRaw = xpForResult(result);
  const room = Math.max(0, DAILY_XP_CAP - num(daily.xp));
  const xpEarned = Math.min(earnedRaw, room);
  const xp = num(state.xp) + xpEarned;
  const level = levelFor(xp);
  let gems = num(state.gems) + Math.floor(result.score / 5);

  const weekly = state.weekly && state.weekly.week === week ? state.weekly : { week, games: 0, words: 0, listening: 0, questComplete: false };
  const kind = result.kind || "game";
  const nextWeekly = {
    week,
    games: num(weekly.games) + 1,
    words: num(weekly.words) + num(result.words),
    listening: num(weekly.listening) + (kind === "listening" ? 1 : 0)
  };
  const questsDone = questProgress(nextWeekly).every(quest => quest.done);
  nextWeekly.questComplete = questsDone;
  const firstCompletion = questsDone && !weekly.questComplete;
  if (firstCompletion) gems += WEEKLY_REWARD_GEMS;

  const old = cleanStats(state.stats);
  const stats = {
    games: old.games + 1,
    perfect: old.perfect + (result.score === result.total ? 1 : 0),
    correct: old.correct + result.score,
    words: old.words + num(result.words),
    listening: old.listening + (kind === "listening" ? 1 : 0),
    boss: old.boss + (kind === "boss" && result.won ? 1 : 0),
    hunts: old.hunts + (kind === "error-hunt" ? num(result.fixes) : 0),
    reviewed: old.reviewed + (kind === "review" ? result.score : 0),
    weeks: old.weeks + (firstCompletion ? 1 : 0)
  };

  const hearts = options.hearts === false ? Math.max(0, Math.min(5, Number.isFinite(state.hearts) ? state.hearts : 5))
    : Math.max(0, Math.min(5, Number.isFinite(state.hearts) ? state.hearts : 5) - (result.total - result.score));
  const mistakes = Array.isArray(result.mistakes) ? result.mistakes.slice(0, 20) : [];
  const reviewQueue = [...(Array.isArray(state.reviewQueue) ? state.reviewQueue : []), ...mistakes].slice(-100);

  const next = {
    xp, level, gems, hearts, streak, streakFreezes, lastActivityDate: date,
    daily: { date, games: num(daily.games) + 1, correct: num(daily.correct) + result.score, xp: num(daily.xp) + xpEarned, questComplete: true },
    weekly: nextWeekly,
    stats,
    reviewQueue
  };
  const owned = new Set(Array.isArray(state.badges) ? state.badges : []);
  const known = new Set(owned);
  for (const badge of BADGES) if (badge.earned({ ...next, stats })) owned.add(badge.id);
  const newBadges = [...owned].filter(id => !known.has(id));
  return { ...next, badges: [...owned], _info: { xpEarned, capped: earnedRaw > xpEarned, streakFreezeUsed, newBadges, weeklyDone: firstCompletion, levelUp: level > levelFor(num(state.xp)) } };
}
