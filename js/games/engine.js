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
  "word-search"
]);
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

export function createPracticeGames(content) {
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
    const crossword = createCrosswordGame(pairs);
    if (crossword) games.push(crossword);
    const wordSearch = createWordSearchGame(pairs);
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
    games.push({
      id: "boss-battle",
      type: "boss-battle",
      title: "Unit Boss Battle",
      instructions: "Answer the unit questions to defeat the boss.",
      questions: quizQuestions.slice(0, 10)
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

  return games;
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
    if (["speed-quiz", "boss-battle", "story-choice"].includes(game.type) &&
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

function createCrosswordGame(pairs) {
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

function createWordSearchGame(pairs) {
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
  let seed = words.reduce((value, item) => value + item.answer.length + item.id.length, 0) || 1;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };

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
    if (normalizeAnswer(answers && answers[item.id]) === normalizeAnswer(item.answer)) {
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

export function applyGamification(previous, result, now = Date.now()) {
  if (!result || !Number.isInteger(result.score) || !Number.isInteger(result.total) ||
      result.score < 0 || result.total < 1 || result.score > result.total) {
    throw new Error("A valid completed game result is required.");
  }

  const state = previous && typeof previous === "object" ? previous : {};
  const date = new Date(now).toISOString().slice(0, 10);
  const previousDate = String(state.lastActivityDate || "");
  const dayGap = previousDate ? Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previousDate}T00:00:00Z`)) / 86400000) : 0;
  const freezes = Math.max(0, Number(state.streakFreezes) || 0);
  let streak = Math.max(0, Number(state.streak) || 0);
  let streakFreezes = freezes;
  if (dayGap === 1) streak += 1;
  else if (dayGap > 1 && dayGap <= 2 && freezes > 0) streakFreezes -= 1;
  else if (dayGap > 1) streak = 1;
  else if (!previousDate) streak = 1;

  const xpEarned = result.score * 10 + (result.score === result.total ? 5 : 0);
  const xp = Math.max(0, Number(state.xp) || 0) + xpEarned;
  const level = Math.floor(xp / 100) + 1;
  const gems = Math.max(0, Number(state.gems) || 0) + Math.floor(result.score / 5);
  const hearts = Math.max(0, Math.min(5, Number.isFinite(state.hearts) ? state.hearts : 5) -
    (result.total - result.score));
  const daily = state.daily && state.daily.date === date ? state.daily : { date, games: 0, correct: 0 };
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const week = weekStart.toISOString().slice(0, 10);
  const weekly = state.weekly && state.weekly.week === week ? state.weekly : { week, games: 0 };
  const mistakes = Array.isArray(result.mistakes) ? result.mistakes.slice(0, 20) : [];
  const reviewQueue = [...(Array.isArray(state.reviewQueue) ? state.reviewQueue : []), ...mistakes]
    .slice(-100);
  const badges = new Set(Array.isArray(state.badges) ? state.badges : []);
  if (streak >= 3) badges.add("three-day-streak");
  if (xp >= 100) badges.add("first-level-up");
  if (result.score === result.total) badges.add("perfect-round");

  return {
    xp,
    level,
    gems,
    hearts,
    streak,
    streakFreezes,
    lastActivityDate: date,
    daily: {
      date,
      games: (Number(daily.games) || 0) + 1,
      correct: (Number(daily.correct) || 0) + result.score,
      questComplete: (Number(daily.games) || 0) + 1 >= 1
    },
    weekly: {
      week,
      games: (Number(weekly.games) || 0) + 1,
      questComplete: (Number(weekly.games) || 0) + 1 >= 5
    },
    badges: [...badges],
    reviewQueue
  };
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
