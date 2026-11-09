// Runs the games that live in js/games/types/. Each type exports render(container, game, bus); this file gives them a
// shared bus (settings, sound, haptics, announcements) and turns what they report into the standard result:
// { score, total, mistakes, correctItemIds, bestRun, durationMs, timeSpentSeconds, kind, won?, fixes?, words? }.
import { evaluateGame } from "./engine.js";
import * as bossBattle from "./types/boss-battle.js";
import * as errorHunt from "./types/error-hunt.js";
import * as speedQuiz from "./types/speed-quiz.js";
import * as storyChoice from "./types/story-choice.js";
import * as wordFormation from "./types/word-formation.js";
import { flashcards, memoryCards, wordMatch } from "./types/pairs.js";
import { crossword, wordSearch } from "./types/puzzles.js";
import { sentenceBuilder } from "./types/tiles.js";
import { fillGap, hangman, listeningDictation, pronunciation, wordScramble } from "./types/typed.js";
import { createServices } from "./settings.js";

export const MODULES = Object.freeze([speedQuiz, bossBattle, storyChoice, errorHunt, wordFormation, wordMatch, memoryCards, flashcards, fillGap, sentenceBuilder, hangman, wordScramble, listeningDictation, pronunciation, crossword, wordSearch]);
export const moduleFor = game => MODULES.find(module => module.supports(game)) || null;

export function buildResult(game, payload, startedAt, now = Date.now()) {
  const base = evaluateGame(game, payload.answers || {});
  const durationMs = Math.max(0, now - startedAt);
  const result = { ...base, bestRun: Math.min(payload.bestRun || 0, base.total), durationMs, timeSpentSeconds: Math.round(durationMs / 1000), kind: payload.kind || "game" };
  if (payload.won !== undefined) result.won = Boolean(payload.won);
  if (payload.fixes !== undefined) result.fixes = Math.min(payload.fixes, base.total);
  if (payload.words !== undefined) result.words = Math.min(payload.words, base.total);
  if (payload.hints) result.hints = Math.min(Math.max(0, Math.floor(payload.hints)), 50);
  if (payload.noQueue) { result.mistakes = []; result.coaching = true; } // coaching games never fill the review list
  return result;
}

export function playModular({ container, game, settings, onFinish, announce = () => {}, reportAnswer = null }) {
  const module = moduleFor(game);
  if (!module) throw new Error(`No interactive module for ${game.type}.`);
  const startedAt = Date.now(); let finished = false;
  const bus = {
    settings, services: createServices(settings), announce, reportAnswer,
    finish(payload) { if (finished) return; finished = true; onFinish(buildResult(game, payload, startedAt)); }
  };
  return module.render(container, game, bus);
}
