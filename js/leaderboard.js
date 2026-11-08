// Opt-in class leaderboard: pure helpers. Students are opted out by default; a leaderboard entry
// exists only after the student chooses a nickname. Entries are keyed by Firebase uid, never by
// student code, so classmates cannot learn each other's codes or real names.

export const DEFAULT_CLASS_ID = "main";
export const MAX_WEEKLY_XP = 5000;
export const NICKNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$/;

// A small blocklist of obvious rude words. It is a courtesy filter, not a guarantee: the teacher
// can rename or remove any nickname from the dashboard.
const BLOCKED_FRAGMENTS = ["fuck", "shit", "bitch", "cunt", "dick", "pussy", "slut", "whore", "nigg", "fag", "rape", "nazi", "porn", "sex", "asshole", "bastard"];

function normalizeForFilter(text) {
  return String(text).toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s").replace(/@/g, "a");
}

export function validateNickname(value) {
  const nickname = String(value ?? "").trim().replace(/\s+/g, " ");
  if (nickname.length < 3 || nickname.length > 16) return { valid: false, nickname, reason: "Use 3 to 16 characters." };
  if (!NICKNAME_PATTERN.test(nickname)) return { valid: false, nickname, reason: "Use only letters, numbers, spaces, - and _." };
  const flattened = normalizeForFilter(nickname);
  if (BLOCKED_FRAGMENTS.some(fragment => flattened.includes(fragment))) return { valid: false, nickname, reason: "Please choose a friendlier nickname." };
  return { valid: true, nickname, reason: "" };
}

// ISO 8601 week id such as "2026-W02". Uses UTC so every student agrees on the week boundary.
export function isoWeekId(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousWeekId(date = new Date()) {
  return isoWeekId(new Date(date.getTime() - 7 * 86400000));
}

// XP earned this week, never negative and never above the cap the rules enforce.
export function weeklyXpSince(baselineXp, currentXp) {
  const earned = Math.floor(Number(currentXp) - Number(baselineXp));
  return Number.isFinite(earned) ? Math.max(0, Math.min(MAX_WEEKLY_XP, earned)) : 0;
}

// entries: { [uid]: { xp } } plus a nickname lookup. Ties share a rank (1, 2, 2, 4).
export function rankEntries(scores, nicknames, ownUid, limit = 10) {
  const rows = Object.entries(scores || {})
    .filter(([uid, score]) => nicknames && nicknames[uid] && Number.isFinite(Number(score)))
    .map(([uid, score]) => ({ uid, nickname: String(nicknames[uid]), xp: Number(score) }))
    .sort((a, b) => b.xp - a.xp || a.nickname.localeCompare(b.nickname) || a.uid.localeCompare(b.uid));
  let previousXp = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    row.rank = row.xp === previousXp ? previousRank : index + 1;
    previousXp = row.xp;
    previousRank = row.rank;
    row.isOwn = row.uid === ownUid;
  });
  const top = rows.slice(0, limit);
  const own = rows.find(row => row.isOwn) || null;
  return { top: top.map(({ uid, ...rest }) => rest), own: own ? { rank: own.rank, nickname: own.nickname, xp: own.xp } : null, total: rows.length };
}

// Friendly, improvement-first message for the current student.
export function encouragement({ rank, total, xp, lastWeekXp }) {
  if (!total) return "Be the first to join the board.";
  if (xp === 0) return "A fresh week! Any practice puts you on the board.";
  if (lastWeekXp > 0 && xp > lastWeekXp) return `You are ${xp - lastWeekXp} XP ahead of last week. Great progress!`;
  if (rank === 1) return "You lead the board this week. Keep it fun!";
  if (lastWeekXp > 0) return `${lastWeekXp - xp > 0 ? `${lastWeekXp - xp} XP to beat` : "Matching"} your last week. You can do it!`;
  return "Every bit of practice counts. Keep going!";
}
