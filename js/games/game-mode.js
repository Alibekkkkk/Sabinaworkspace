// Game mode for a lesson: how much game framing the lesson player adds. Pure functions; the DOM lives in lesson-layer.js.
//   off    the classic lesson, nothing added
//   light  a mission line on every stage, the card map on stage 1, XP when a stage is finished, celebrations
//   full   light plus the extra games (Error Hunt on reading and grammar stages, Boss Battle for the final test)
// The teacher sets it per student and lesson (studentCurriculum/<code>/<lessonId>/gameMode); a lesson file may suggest
// a default with `gameMode`. Nothing in any mode replaces a stage, changes its grading or removes its content.
export const GAME_MODES = Object.freeze(["full", "light", "off"]);
export const DEFAULT_MODE = "light";

export function resolveGameMode(studentValue, contentValue) {
  if (GAME_MODES.includes(studentValue)) return studentValue;
  if (GAME_MODES.includes(contentValue)) return contentValue;
  return DEFAULT_MODE;
}

export const modeAllows = (mode, feature) => {
  if (mode === "off") return false;
  if (feature === "extras") return mode === "full";
  return true; // mission lines, card map, stage XP, celebrations
};

const MISSIONS = Object.freeze({
  1: "Mission: collect all the cards. A card is yours when you answer its quiz correctly.",
  2: "Mission: link every word to its meaning.",
  3: "Mission: read, watch and answer. Look for the evidence in the text.",
  4: "Mission: complete the sentences with the right form.",
  5: "Mission: finish the second set of sentences.",
  6: "Mission: build correct sentences from the word tiles.",
  7: "Mission: build the next set of sentences.",
  8: "Mission: choose the right tense each time.",
  9: "Boss: the unit test. One attempt, so take your time.",
  10: "Mission: finish a game to complete this section.",
  11: "Mission: finish a listening round. Catch every missing word."
});
// Grammar sections are 21 to 29 (js/lesson-plan.js).
export const missionFor = stageId => MISSIONS[stageId] || (stageId >= 21 && stageId <= 29 ? "Mission: learn the rule, then get every sentence right." : "Mission: finish this stage.");

// XP framing for a finished stage: a stage worth `points` pays like a game of points/5 answers, perfect. Daily cap applies.
export function stageResult(points) {
  const size = Math.max(1, Math.round((Number(points) || 5) / 5));
  return { score: size, total: size, kind: "game", mistakes: [] };
}

export function deckSummary(words, statusOf, startedOf) {
  const cards = words.map(word => {
    const status = statusOf(word);
    return { word, state: status === "learned" ? "collected" : startedOf(word) ? "in progress" : "not started" };
  });
  return { cards, collected: cards.filter(card => card.state === "collected").length, total: cards.length };
}

export function allStagesDone(stages, lessonId, done) {
  return stages.length > 0 && stages.every(stage => done[`${lessonId}_${stage.id}`]);
}
