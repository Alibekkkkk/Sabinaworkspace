import { isAnswerCorrect } from "../grading.js";
import { applyRewards } from "./rewards.js";
import { create as createErrorHunt } from "./types/error-hunt.js";
import { fromContent as bossItems } from "./types/boss-battle.js";
import { decisionsOf, validateStoryGraph } from "./types/story-choice.js";
import { fromVocab } from "./types/word-formation.js";
import { seededRandom, seededShuffle } from "./seed.js";

const SUPPORTED_GAME_TYPES = new Set([
  "word-match",
  "memory-cards",
  "speed-quiz",
  "fill-gap",
  "sentence-builder",
  "hangman",
  "word-scramble",
  "listening-dictation",
  "pronunciation",
  "flashcards",
  "boss-battle",
  "story-choice",
  "crossword",
  "word-search",
  "error-hunt",
  "word-formation"
]);

// What each game trains and roughly how long a round takes. Teachers can set content.cefr for the lesson.
export const GAME_META = Object.freeze({
  "word-match": { skill: "vocab", estimatedMinutes: 3 }, "memory-cards": { skill: "vocab", estimatedMinutes: 4 }, flashcards: { skill: "vocab", estimatedMinutes: 4 },
  "speed-quiz": { skill: "vocab", estimatedMinutes: 4 }, "fill-gap": { skill: "grammar", estimatedMinutes: 5 }, "sentence-builder": { skill: "grammar", estimatedMinutes: 5 },
  hangman: { skill: "spelling", estimatedMinutes: 4 }, "word-scramble": { skill: "spelling", estimatedMinutes: 4 }, "listening-dictation": { skill: "listening", estimatedMinutes: 4 },
  pronunciation: { skill: "speaking", estimatedMinutes: 4 }, "boss-battle": { skill: "reading", estimatedMinutes: 8 }, "story-choice": { skill: "grammar", estimatedMinutes: 5 },
  crossword: { skill: "spelling", estimatedMinutes: 8 }, "word-search": { skill: "vocab", estimatedMinutes: 6 }, "error-hunt": { skill: "grammar", estimatedMinutes: 5 }, "word-formation": { skill: "vocab", estimatedMinutes: 4 }
});
const SKILL_LIST = ["vocab", "grammar", "reading", "listening", "speaking", "spelling"];
const CEFR = /^(A1|A2|B1|B2|C1|C2)(-(A1|A2|B1|B2|C1|C2))?$/;
export const SUPPORTED_TYPES = [...SUPPORTED_GAME_TYPES];
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30];

function stableId(item, prefix, index) {
  return String(item.id || `${prefix}-${index + 1}`);
}

function questionsFrom(items, prefix, questionFor) {
  return (Array.isArray(items) ? items : []).flatMap((item, index) => {
    const question = questionFor(item, stableId(item, prefix, index));
    return question ? [question] : [];
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeAnswer(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");
}

export function createPracticeGames(content, { seed = "", isTeacher = false } = {}) {
  if (!content || typeof content !== "object") {
    throw new Error("Lesson content must be an object.");
  }

  const games = [];
  const pairs = questionsFrom(content.matchData, "match", (item, id) => {
    const prompt = cleanText(item.word);
    const answer = cleanText(item.meaning);
    return prompt && answer ? { id, prompt, answer } : null;
  });
  if (pairs.length >= 2) {
    const practicePairs = pairs.slice(0, 10);
    const memoryPairs = pairs.slice(0, 8);
    games.push({
      id: "word-match",
      type: "word-match",
      title: "Word Match",
      instructions: "Match each word with its meaning.",
      pairs
    });
    games.push({
      id: "memory-cards",
      type: "memory-cards",
      title: "Memory Cards",
      instructions: "Turn over cards and find each word with its meaning.",
      pairs: memoryPairs
    });
    games.push({
      id: "flashcards",
      type: "flashcards",
      title: "Vocabulary Flashcards",
      instructions: "Recall each meaning before you reveal the answer.",
      questions: practicePairs.map(pair => ({ ...pair, prompt: pair.prompt, answer: pair.answer }))
    });
    const crossword = createCrosswordGame(pairs, seed);
    if (crossword) games.push(crossword);
    const wordSearch = createWordSearchGame(pairs, seed);
    if (wordSearch) games.push(wordSearch);
    games.push({
      id: "hangman",
      type: "hangman",
      title: "Vocabulary Hangman",
      instructions: "Use the meaning as a hint and guess the hidden word.",
      questions: practicePairs.map(pair => ({ ...pair, prompt: pair.answer, answer: pair.prompt }))
    });
    games.push({
      id: "word-scramble",
      type: "word-scramble",
      title: "Word Scramble",
      instructions: "Unscramble each word using its meaning as a hint.",
      questions: practicePairs.map(pair => ({
        ...pair,
        prompt: pair.answer,
        answer: pair.prompt,
        scrambled: scrambleWord(pair.prompt, pair.id)
      }))
    });
    games.push({
      id: "listening-dictation",
      type: "listening-dictation",
      title: "Listening Dictation",
      instructions: "Listen to each word and type what you hear.",
      questions: practicePairs.map(pair => ({
        ...pair,
        prompt: "Listen and type the word.",
        answer: pair.prompt,
        spoken: pair.prompt
      }))
    });
    games.push({
      id: "pronunciation",
      type: "pronunciation",
      title: "Pronunciation Challenge",
      instructions: "Say each vocabulary word clearly. Use typing if speech recognition is unavailable.",
      questions: practicePairs.map(pair => ({
        ...pair,
        prompt: `Say: ${pair.prompt}`,
        answer: pair.prompt
      }))
    });
  }

  const quizQuestions = questionsFrom(content.testMcq, "quiz", (item, id) => {
    const prompt = cleanText(item.q);
    const answer = cleanText(item.correct);
    const options = Array.isArray(item.options) ? item.options.map(cleanText).filter(Boolean) : [];
    return prompt && answer && options.includes(answer)
      ? { id, prompt, answer, options }
      : null;
  });
  if (quizQuestions.length) {
    games.push({
      id: "speed-quiz",
      type: "speed-quiz",
      title: "Speed Quiz",
      instructions: "Choose the best answer before the timer runs out.",
      questions: quizQuestions.slice(0, 10),
      secondsPerQuestion: 20
    });
  }
  const bossQuestions = bossItems(content);
  if (bossQuestions.length >= 1) {
    games.push({
      id: "boss-battle",
      type: "boss-battle",
      title: "Unit Boss Battle",
      instructions: "Answer the unit questions to defeat the boss. Mistakes cost a shield, but you can never be locked out.",
      questions: bossQuestions.slice(0, 20)
    });
  }

  const gapQuestions = questionsFrom(content.testComplete, "gap", (item, id) => {
    const prompt = cleanText(item.p || item.prompt);
    const answer = cleanText(item.a || item.answer);
    return prompt && answer ? { id, prompt, answer } : null;
  });
  if (gapQuestions.length) {
    games.push({
      id: "fill-gap",
      type: "fill-gap",
      title: "Fill the Gap",
      instructions: "Type the missing words.",
      questions: gapQuestions.slice(0, 10)
    });
  }

  const sentenceQuestions = Object.entries({
    ...(content.sbPp || {}),
    ...(content.sbPs || {})
  }).flatMap(([group, items]) => questionsFrom(items, `sentence-${group}`, (item, id) => {
    const words = Array.isArray(item.correct) ? item.correct.map(cleanText) : [];
    return cleanText(item.prompt) && words.length
      ? { id, prompt: item.prompt, answer: words.join(" "), words }
      : null;
  }));
  if (sentenceQuestions.length) {
    games.push({
      id: "sentence-builder",
      type: "sentence-builder",
      title: "Sentence Builder",
      instructions: "Tap the word tiles in the correct order to build each sentence.",
      questions: sentenceQuestions.slice(0, 10)
    });
  }

  const storyQuestions = questionsFrom(content.storyChoices, "story", (item, id) => {
    const prompt = cleanText(item.scene || item.prompt);
    const answer = cleanText(item.correctChoice || item.correct);
    const options = Array.isArray(item.choices) ? item.choices.map(cleanText).filter(Boolean) : [];
    return prompt && answer && options.includes(answer)
      ? { id, prompt, answer, options }
      : null;
  });
  if (storyQuestions.length) {
    games.push({
      id: "story-choice",
      type: "story-choice",
      title: "Story Choice Adventure",
      instructions: "Choose the response that completes the story correctly.",
      questions: storyQuestions.slice(0, 10)
    });
  }

  if (Array.isArray(content.errorHunt) && content.errorHunt.length) {
    try {
      games.push({ id: "error-hunt", type: "error-hunt", title: "Error Hunt", instructions: "Find the mistake in each sentence, then fix it.", questions: createErrorHunt(content.errorHunt).slice(0, 10) });
    } catch (error) { console.warn(`Error Hunt skipped: ${error.message}`); }
  }
  const formation = fromVocab(content.vocab, { isTeacher });
  if (formation.length >= 3) {
    games.push({ id: "word-formation", type: "word-formation", title: "Word Formation Race", instructions: "Turn each word into the form asked for.", questions: formation });
  }
  if (content.storyGraph && !validateStoryGraph(content.storyGraph).length) {
    const decisions = decisionsOf(content.storyGraph);
    const hasChoice = games.findIndex(game => game.id === "story-choice");
    const story = { id: "story-choice", type: "story-choice", title: content.storyGraph.title || "Story Choice Adventure", instructions: "Read the story and choose the correct form at each step.", graph: content.storyGraph, questions: decisions };
    if (hasChoice >= 0) games[hasChoice] = story; else games.push(story);
  }

  return games.map(game => {
    const meta = GAME_META[game.type] || {};
    const cefr = CEFR.test(String(content.cefr || "")) ? content.cefr : "";
    return { ...game, skill: meta.skill, estimatedMinutes: meta.estimatedMinutes, ...(cefr ? { cefr } : {}) };
  });
}

function scrambleWord(word, id) {
  const characters = [...word];
  if (characters.length < 2) return word;
  const offset = (id.length % (characters.length - 1)) + 1;
  const scrambled = [...characters.slice(offset), ...characters.slice(0, offset)].join("");
  return scrambled === word ? `${characters.slice(1).join("")}${characters[0]}` : scrambled;
}

export function validateGame(game) {
  if (!game || typeof game !== "object" || !SUPPORTED_GAME_TYPES.has(game.type)) {
    throw new Error("Unsupported game type.");
  }
  if (!/^[a-z0-9-]{1,60}$/i.test(String(game.id || ""))) {
    throw new Error("A valid game ID is required.");
  }
  if (!Array.isArray(game.pairs || game.questions)) {
    throw new Error("Game items must be an array.");
  }

  const items = game.pairs || game.questions;
  if (!items.length) throw new Error("A game must contain at least one item.");
  if (game.skill !== undefined && !SKILL_LIST.includes(game.skill)) throw new Error("A game skill must be vocab, grammar, reading, listening, speaking or spelling.");
  if (game.cefr !== undefined && !CEFR.test(String(game.cefr))) throw new Error("A game level must look like B1 or A2-B1.");
  if (game.estimatedMinutes !== undefined && !(Number.isFinite(game.estimatedMinutes) && game.estimatedMinutes >= 1 && game.estimatedMinutes <= 60)) throw new Error("estimatedMinutes must be between 1 and 60.");
  if (game.graph) { const problems = validateStoryGraph(game.graph); if (problems.length) throw new Error(`Story: ${problems[0]}`); }
  if (game.type === "error-hunt" && items.some(item => !Array.isArray(item.tokens) || !Number.isInteger(item.wrongIndex) || item.wrongIndex < 0 || item.wrongIndex >= item.tokens.length)) throw new Error("Error Hunt items need tokens and the index of the wrong word.");
  if (["crossword", "word-search"].includes(game.type) &&
      (!Array.isArray(game.grid) || !game.grid.length ||
       game.grid.length > 20 || !Array.isArray(game.grid[0]) ||
       !game.grid[0].length || game.grid[0].length > 20 ||
       game.grid.some(row => !Array.isArray(row) ||
         row.length !== game.grid[0].length || row.length > 20))) {
    throw new Error("Word puzzle grids must be rectangular and no larger than 20 cells.");
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.id || seen.has(item.id)) {
      throw new Error("Game items need unique IDs.");
    }
    seen.add(item.id);
    if (!cleanText(item.prompt) || !cleanText(item.answer)) {
      throw new Error("Game items need a prompt and an answer.");
    }
    if (game.type === "word-match" && !cleanText(item.answer)) {
      throw new Error("Word matches need meanings.");
    }
    if (["speed-quiz", "boss-battle", "story-choice"].includes(game.type) && !item.typed &&
        (!Array.isArray(item.options) || item.options.length < 2 ||
         !item.options.includes(item.answer))) {
      throw new Error("Multiple-choice options must include the correct answer.");
    }
    if (game.type === "sentence-builder" &&
        (!Array.isArray(item.words) || item.words.join(" ") !== item.answer)) {
      throw new Error("Sentence-builder tiles must match the correct sentence.");
    }
    if (["crossword", "word-search"].includes(game.type)) {
      if (!Array.isArray(item.cells) || item.cells.length !== [...item.answer].length ||
          item.cells.some(cell => !Number.isInteger(cell.row) || !Number.isInteger(cell.col) ||
            cell.row < 0 || cell.col < 0 || cell.row >= game.grid.length ||
            cell.col >= game.grid[0].length)) {
        throw new Error("Word puzzle entries need a valid grid cell for each answer letter.");
      }
      const puzzleWord = item.cells.map(cell => game.grid[cell.row][cell.col]).join("");
      if (normalizeAnswer(puzzleWord) !== normalizeAnswer(item.answer)) {
        throw new Error("Word puzzle cells must spell their answer.");
      }
      if (item.cells.length > 1) {
        const rowStep = item.cells[1].row - item.cells[0].row;
        const colStep = item.cells[1].col - item.cells[0].col;
        if (Math.abs(rowStep) > 1 || Math.abs(colStep) > 1 ||
            item.cells.slice(1).some((cell, index) =>
              cell.row - item.cells[index].row !== rowStep ||
              cell.col - item.cells[index].col !== colStep)) {
          throw new Error("Word puzzle cells must form a straight line.");
        }
      }
    }
  }
  return game;
}

function createCrosswordGame(pairs, seed = "") {
  const words = pairs
    .map(pair => ({
      id: pair.id,
      prompt: pair.answer,
      answer: pair.prompt.toLocaleUpperCase().replace(/[^A-Z]/g, "")
    }))
    .filter(item => item.answer.length >= 3 && item.answer.length <= 12)
    .filter((item, index, list) => list.findIndex(other => other.answer === item.answer) === index);
  const tieBreak = new Map(seededShuffle(words.map(item => item.id), `crossword:${seed}`).map((id, rank) => [id, rank]));
  words.sort((a, b) => b.answer.length - a.answer.length || tieBreak.get(a.id) - tieBreak.get(b.id));
  words.splice(8);
  if (words.length < 2) return null;

  const placed = [{
    item: words[0],
    row: 0,
    col: 0,
    direction: "across"
  }];
  const letters = new Map();
  const key = (row, col) => `${row},${col}`;
  const addLetters = placement => {
    [...placement.item.answer].forEach((letter, index) => {
      const row = placement.row + (placement.direction === "down" ? index : 0);
      const col = placement.col + (placement.direction === "across" ? index : 0);
      const cellKey = key(row, col);
      const entries = letters.get(cellKey) || [];
      entries.push(letter);
      letters.set(cellKey, entries);
    });
  };
  addLetters(placed[0]);

  for (const item of words.slice(1)) {
    let match = null;
    for (const existing of placed) {
      const existingDirection = existing.direction === "across" ? "down" : "across";
      for (let existingIndex = 0; existingIndex < existing.item.answer.length && !match; existingIndex += 1) {
        const row = existing.row + (existing.direction === "down" ? existingIndex : 0);
        const col = existing.col + (existing.direction === "across" ? existingIndex : 0);
        const letter = existing.item.answer[existingIndex];
        const itemIndex = item.answer.indexOf(letter);
        if (itemIndex < 0) continue;
        const candidate = {
          item,
          row: row - (existingDirection === "down" ? itemIndex : 0),
          col: col - (existingDirection === "across" ? itemIndex : 0),
          direction: existingDirection
        };
        let valid = true;
        for (let index = 0; index < item.answer.length; index += 1) {
          const nextRow = candidate.row + (candidate.direction === "down" ? index : 0);
          const nextCol = candidate.col + (candidate.direction === "across" ? index : 0);
          const nextLetters = letters.get(key(nextRow, nextCol));
          if (nextLetters && (nextRow !== row || nextCol !== col ||
              nextLetters.includes(item.answer[index]) === false)) {
            valid = false;
            break;
          }
        }
        if (valid) match = candidate;
      }
      if (match) break;
    }
    if (match) {
      placed.push(match);
      addLetters(match);
    }
  }
  if (placed.length < 2) return null;

  const minRow = Math.min(...placed.map(item => item.row));
  const minCol = Math.min(...placed.map(item => item.col));
  const maxRow = Math.max(...placed.map(item =>
    item.row + (item.direction === "down" ? item.item.answer.length - 1 : 0)));
  const maxCol = Math.max(...placed.map(item =>
    item.col + (item.direction === "across" ? item.item.answer.length - 1 : 0)));
  const grid = Array.from({ length: maxRow - minRow + 1 },
    () => Array(maxCol - minCol + 1).fill(""));
  const questions = placed.map((placement, index) => {
    const row = placement.row - minRow;
    const col = placement.col - minCol;
    const cells = [...placement.item.answer].map((_, offset) => ({
      row: row + (placement.direction === "down" ? offset : 0),
      col: col + (placement.direction === "across" ? offset : 0)
    }));
    return {
      ...placement.item,
      id: `crossword-${placement.item.id}`,
      number: index + 1,
      direction: placement.direction,
      cells
    };
  });
  questions.forEach(item => {
    item.cells.forEach((cell, index) => {
      grid[cell.row][cell.col] = item.answer[index];
    });
  });
  return {
    id: "crossword",
    type: "crossword",
    title: "Vocabulary Crossword",
    instructions: "Use the meanings as clues and fill each numbered word.",
    grid,
    questions
  };
}

function createWordSearchGame(pairs, seed = "") {
  const words = pairs
    .map(pair => ({
      id: pair.id,
      prompt: pair.answer,
      answer: pair.prompt.toLocaleUpperCase().replace(/[^A-Z]/g, "")
    }))
    .filter(item => item.answer.length >= 3 && item.answer.length <= 12)
    .filter((item, index, list) => list.findIndex(other => other.answer === item.answer) === index)
    .sort((a, b) => b.answer.length - a.answer.length)
    .slice(0, 8);
  if (words.length < 2) return null;

  const size = Math.max(10, Math.max(...words.map(item => item.answer.length)));
  const grid = Array.from({ length: size }, () => Array(size).fill(""));
  const directions = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]];
  const random = seededRandom(`word-search:${seed}:${words.map(item => item.answer).join(",")}`);

  const questions = [];
  for (const item of words) {
    let placement = null;
    for (let attempt = 0; attempt < 400 && !placement; attempt += 1) {
      const [rowStep, colStep] = directions[random(directions.length)];
      const row = random(size);
      const col = random(size);
      const endRow = row + rowStep * (item.answer.length - 1);
      const endCol = col + colStep * (item.answer.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
      const cells = [...item.answer].map((_, index) => ({
        row: row + rowStep * index,
        col: col + colStep * index
      }));
      if (cells.some((cell, index) =>
        grid[cell.row][cell.col] && grid[cell.row][cell.col] !== item.answer[index])) continue;
      placement = cells;
      cells.forEach((cell, index) => { grid[cell.row][cell.col] = item.answer[index]; });
    }
    if (placement) questions.push({ ...item, id: `search-${item.id}`, cells: placement });
  }
  if (questions.length < 2) return null;

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!grid[row][col]) grid[row][col] = alphabet[random(alphabet.length)];
    }
  }
  return {
    id: "word-search",
    type: "word-search",
    title: "Vocabulary Word Search",
    instructions: "Find each word in the letter grid. Select its letters in order.",
    grid,
    questions
  };
}

export function evaluateGame(game, answers) {
  validateGame(game);
  const items = game.pairs || game.questions;
  const mistakes = [];
  const correctItemIds = [];
  let score = 0;
  for (const item of items) {
    const given = answers && answers[item.id];
    const accepted = [item.answer, ...(Array.isArray(item.alternatives) ? item.alternatives : [])];
    const right = item.typed ? isAnswerCorrect(String(given || ""), accepted, { mode: item.mode || "exact" }) : accepted.some(candidate => normalizeAnswer(given) === normalizeAnswer(candidate));
    if (right) {
      score += 1;
      correctItemIds.push(String(item.reviewId || item.id));
    } else {
      mistakes.push({
        itemId: String(item.reviewId || item.id),
        prompt: String(item.prompt),
        answer: String(item.answer),
        topic: String(item.topic || game.title || game.type)
      });
    }
  }
  return {
    score,
    total: items.length,
    mistakes,
    correctItemIds,
    completedAt: Date.now()
  };
}

export function createReviewGame(queue, now = Date.now()) {
  const dueItems = (Array.isArray(queue) ? queue : [])
    .filter(item => !item.dueAt || Date.parse(item.dueAt) <= now)
    .slice(0, 20)
    .map((item, index) => ({
      id: `review-${index + 1}`,
      reviewId: String(item.itemId),
      prompt: String(item.prompt),
      answer: String(item.answer),
      topic: String(item.topic || "Review")
    }))
    .filter(item => item.reviewId && item.prompt && item.answer);
  if (!dueItems.length) return null;
  return {
    id: "review-queue",
    type: "fill-gap",
    title: "Practice mistakes",
    instructions: "Review items you missed before. Correct answers return later at a longer interval.",
    questions: dueItems
  };
}

export function applyGamification(previous, result, now = Date.now(), options = {}) {
  const { _info, ...state } = applyRewards(previous, result, now, options); // _info is for the screen, never stored
  void _info;
  return state;
}

export function updateReviewQueue(queue, result, now = Date.now()) {
  const items = Array.isArray(queue) ? queue : [];
  const correctIds = new Set(result.correctItemIds || []);
  const wrongIds = new Set((result.mistakes || []).map(item => item.itemId));
  const updated = items.map(item => {
    if (correctIds.has(item.itemId)) {
      const repetitions = Math.max(0, Number(item.repetitions) || 0) + 1;
      const intervalDays = REVIEW_INTERVALS_DAYS[
        Math.min(repetitions - 1, REVIEW_INTERVALS_DAYS.length - 1)
      ];
      return {
        ...item,
        repetitions,
        intervalDays,
        dueAt: new Date(now + intervalDays * 86400000).toISOString()
      };
    }
    if (wrongIds.has(item.itemId)) {
      return {
        ...item,
        repetitions: 0,
        intervalDays: 1,
        dueAt: new Date(now + 86400000).toISOString()
      };
    }
    return item;
  });
  return updated.sort((a, b) => Date.parse(a.dueAt || 0) - Date.parse(b.dueAt || 0));
}

export function createVocabMatchGame(matchData) {
  return validateGame({
    id: "word-match",
    type: "word-match",
    title: "Word Match",
    pairs: (Array.isArray(matchData) ? matchData : [])
      .map((item, index) => ({
        id: String(item.id || `match-${index + 1}`),
        prompt: cleanText(item.word),
        answer: cleanText(item.meaning)
      }))
      .filter(item => item.prompt && item.answer)
  });
}
