
    import { firebaseConfig } from "../config.js";
    import { resolveStudentContext } from "../student-context.js";
    import { loadProtectedContent } from "../protected-content.js";
    import { createPracticeGames, createReviewGame, evaluateGame } from "../games/engine.js";
    import { progressPath, saveGameProgress, shopAction } from "../games/progress.js";
    import { moduleFor, playModular } from "../games/runtime.js";
    import { mountPanels } from "../games/panels.js";
    import { applyCalm, createServices, loadSettings, saveSettings } from "../games/settings.js";

    const status = document.getElementById("status");
    const list = document.getElementById("gameList");
    const gameView = document.getElementById("gameView");
    const stats = document.getElementById("stats");
    let database;
    let context;
    let activeTimerInterval;
    let activeModule = null;
    let panels = null;
    let settings = loadSettings();
    applyCalm(settings);

    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    function showRewards(progress) {
      stats.replaceChildren();
      for (const [label, value] of [
        ["Level", progress.level || 1],
        ["XP", progress.xp || 0],
        ["Gems", progress.gems || 0],
        ["Streak", `${progress.streak || 0} days`]
      ]) stats.append(element("span", `${label}: ${value}`, "stat"));
    }

    function renderModularGame(game) {
      const card = element("article", undefined, "game-card");
      const heading = element("h2", game.title); heading.tabIndex = -1;
      card.append(heading, element("p", game.instructions, "muted"));
      const arena = element("div", undefined, "gm-arena-host");
      const summary = element("div", undefined, "gm-summary");
      card.append(arena, summary);
      gameView.replaceChildren(card);
      heading.focus();
      activeModule = playModular({
        container: arena, game, settings,
        onFinish: async result => {
          summary.replaceChildren(element("p", `You got ${result.score} of ${result.total} correct.`, "result"));
          try {
            const saved = await saveGameProgress({ db: database, code: context.code, game, result });
            const info = saved._info || {};
            showRewards(saved); if (panels) panels.update(saved);
            const lines = [`+${info.xpEarned || 0} XP${info.capped ? " (you have reached today's XP limit, so this game paid less)" : ""}`];
            if (info.levelUp) lines.push(`Level up! You are level ${saved.level}.`);
            if (info.streakFreezeUsed) lines.push("A streak freeze covered your missed day.");
            if (info.weeklyDone) lines.push("Weekly goals complete: +5 gems!");
            for (const id of info.newBadges || []) lines.push(`New badge: ${id.replace(/-/g, " ")}`);
            for (const line of lines) summary.append(element("p", line, "gm-reward"));
            status.textContent = result.mistakes.length ? `${result.mistakes.length} item${result.mistakes.length === 1 ? "" : "s"} added to Practice review.` : "Perfect round! Your progress has been saved.";
            if (info.levelUp) createServices(settings).celebrate("big"); else if (result.score === result.total) createServices(settings).celebrate("small");
          } catch (error) { status.textContent = `Progress could not be saved: ${error.message}`; }
          const again = element("button", "Play again", "button"); again.type = "button"; again.addEventListener("click", () => renderGame(game)); summary.append(again);
        }
      });
    }

    function renderGame(game) {
      clearInterval(activeTimerInterval);
      if (activeModule && activeModule.destroy) activeModule.destroy();
      activeModule = null;
      if (moduleFor(game)) { renderModularGame(game); return; }
      gameView.replaceChildren();
      const card = element("article", undefined, "game-card");
      card.append(element("h2", game.title), element("p", game.instructions, "muted"));
      const form = element("form");
      const start = Date.now();
      const answers = {};
      const items = game.pairs || game.questions;
      let submitted = false;
      const submit = element("button", "Check answers", "button");
      submit.type = "submit";
      if (["memory-cards", "flashcards", "hangman"].includes(game.type)) submit.disabled = true;
      const memoryPairs = new Set();
      const answerInputs = new Map();
      const answeredCards = new Set();

      async function finishGame() {
        if (submitted) return;
        submitted = true;
        clearInterval(activeTimerInterval);
        submit.disabled = true;
        for (const item of items) {
          const input = answerInputs.get(item.id);
          if (input) answers[item.id] = input.value;
        }
        const result = evaluateGame(game, answers);
        result.timeSpentSeconds = Math.round((Date.now() - start) / 1000);
        let summary = card.querySelector(".result");
        if (!summary) {
          summary = element("p", undefined, "result");
          card.append(summary);
        }
        summary.textContent = `You got ${result.score} of ${result.total} correct.`;
        try {
          const progress = await saveGameProgress({
            db: database,
            code: context.code,
            game,
            result
          });
          showRewards(progress);
          status.textContent = result.mistakes.length
            ? `${result.mistakes.length} item${result.mistakes.length === 1 ? "" : "s"} added to Practice review.`
            : "Perfect round! Your progress has been saved.";
        } catch (error) {
          status.textContent = `Progress could not be saved: ${error.message}`;
          submitted = false;
          submit.disabled = false;
        }
      }

      function makeQuestion(item, labelText) {
        const row = element("div", undefined, "question");
        const label = element("label", labelText || item.prompt);
        const input = ["speed-quiz", "word-match", "boss-battle", "story-choice"].includes(game.type)
          ? element("select")
          : element("input");
        input.id = `answer-${item.id}`;
        input.name = item.id;
        label.htmlFor = input.id;
        if (["speed-quiz", "word-match", "boss-battle", "story-choice"].includes(game.type)) {
          input.required = true;
          const placeholder = element("option", "Choose an answer…");
          placeholder.value = "";
          input.append(placeholder);
          const options = game.type === "word-match"
            ? game.pairs.map(pair => pair.answer)
            : item.options;
          for (const option of options) {
            const choice = element("option", option);
            choice.value = option;
            input.append(choice);
          }
        } else {
          input.type = "text";
          input.autocomplete = "off";
          input.required = true;
          if (game.type === "word-scramble") {
            label.textContent = `${item.scrambled} — Hint: ${item.prompt}`;
          }
        }
        row.append(label, input);
        answerInputs.set(item.id, input);
        return { row, input };
      }

      if (game.type === "speed-quiz") {
        const timer = element("p", `Time remaining: ${game.secondsPerQuestion * items.length}s`, "timer");
        timer.setAttribute("aria-live", "off");
        card.append(timer);
        let remaining = game.secondsPerQuestion * items.length;
        activeTimerInterval = setInterval(() => {
          remaining -= 1;
          timer.textContent = `Time remaining: ${Math.max(remaining, 0)}s`;
          if (remaining <= 0) {
            timer.textContent = "Time is up.";
            finishGame();
          }
        }, 1000);
      }

      if (game.type === "crossword") {
        const grid = element("div", undefined, "puzzle-grid");
        grid.style.setProperty("--columns", String(game.grid[0].length));
        const cellInputs = new Map();
        const numberedCells = new Map();
        items.forEach(item => {
          const first = item.cells[0];
          numberedCells.set(`${first.row},${first.col}`, item.number);
          const answer = element("input");
          answer.type = "hidden";
          answer.name = item.id;
          answerInputs.set(item.id, answer);
        });
        game.grid.forEach((row, rowIndex) => row.forEach((_, colIndex) => {
          const key = `${rowIndex},${colIndex}`;
          const cell = element("div", undefined, "puzzle-cell");
          if (!items.some(item => item.cells.some(point => point.row === rowIndex && point.col === colIndex))) {
            cell.classList.add("blocked");
          } else {
            cell.classList.add("open");
            if (numberedCells.has(key)) cell.append(element("span", numberedCells.get(key), "puzzle-number"));
            const input = element("input");
            input.type = "text";
            input.maxLength = 1;
            input.autocomplete = "off";
            input.setAttribute("aria-label", `Row ${rowIndex + 1}, column ${colIndex + 1}`);
            input.addEventListener("input", () => {
              input.value = input.value.toLocaleUpperCase().replace(/[^A-Z]/g, "").slice(-1);
              let complete = true;
              for (const item of items) {
                const value = item.cells.map(point =>
                  cellInputs.get(`${point.row},${point.col}`).value).join("");
                answerInputs.get(item.id).value = value;
                if (value.length !== item.answer.length) complete = false;
              }
              submit.disabled = !complete;
            });
            input.addEventListener("keydown", event => {
              const next = {
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0],
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1]
              }[event.key];
              if (!next) return;
              const target = cellInputs.get(`${rowIndex + next[0]},${colIndex + next[1]}`);
              if (target) {
                event.preventDefault();
                target.focus();
              }
            });
            cellInputs.set(key, input);
            cell.append(input);
          }
          grid.append(cell);
        }));
        const clues = element("ol", undefined, "puzzle-words");
        for (const item of items) {
          const clue = element("li", `${item.number} · ${item.direction} · ${item.prompt}`);
          clues.append(clue);
        }
        submit.disabled = true;
        form.append(grid, clues);
      } else if (game.type === "word-search") {
        const grid = element("div", undefined, "puzzle-grid");
        grid.style.setProperty("--columns", String(game.grid[0].length));
        const foundWords = new Set();
        const selected = [];
        const feedback = element("p", "Select adjacent letters in a straight line.", "question-feedback");
        feedback.setAttribute("aria-live", "polite");
        const wordList = element("ol", undefined, "puzzle-words");
        const wordItems = new Map();
        items.forEach(item => {
          const answer = element("input");
          answer.type = "hidden";
          answer.name = item.id;
          answerInputs.set(item.id, answer);
          const word = element("li", item.prompt);
          wordItems.set(item.id, word);
          wordList.append(word);
        });
        const cellButtons = new Map();
        const coordinates = point => `${point.row},${point.col}`;
        const resetSelection = () => {
          selected.forEach(point => cellButtons.get(coordinates(point))?.classList.remove("selected"));
          selected.length = 0;
        };
        const addSelection = point => {
          const prior = selected[selected.length - 1];
          if (prior) {
            const rowStep = point.row - prior.row;
            const colStep = point.col - prior.col;
            if (Math.abs(rowStep) > 1 || Math.abs(colStep) > 1 ||
                (!rowStep && !colStep) ||
                (selected.length > 1 && (point.row - prior.row !== selected[1].row - selected[0].row ||
                  point.col - prior.col !== selected[1].col - selected[0].col))) {
              resetSelection();
            }
          }
          selected.push(point);
          cellButtons.get(coordinates(point)).classList.add("selected");
          const value = selected.map(cell => game.grid[cell.row][cell.col]).join("");
          const found = items.find(item =>
            !foundWords.has(item.id) &&
            (item.answer === value || [...item.answer].reverse().join("") === value));
          if (found) {
            foundWords.add(found.id);
            answerInputs.get(found.id).value = found.answer;
            wordItems.get(found.id).classList.add("found");
            selected.forEach(cell => cellButtons.get(coordinates(cell)).classList.add("found"));
            feedback.textContent = `Found ${found.answer}!`;
            resetSelection();
            submit.disabled = foundWords.size !== items.length;
          } else if (!items.some(item => !foundWords.has(item.id) &&
              (item.answer.startsWith(value) || [...item.answer].reverse().join("").startsWith(value)))) {
            feedback.textContent = "Not a word from this list. Start a new selection.";
            resetSelection();
          } else {
            feedback.textContent = `Selected ${value.length} letter${value.length === 1 ? "" : "s"}.`;
          }
        };
        game.grid.forEach((row, rowIndex) => row.forEach((letter, colIndex) => {
          const button = element("button", letter, "puzzle-cell open");
          button.type = "button";
          button.setAttribute("aria-label", `${letter}, row ${rowIndex + 1}, column ${colIndex + 1}`);
          button.addEventListener("click", () => addSelection({ row: rowIndex, col: colIndex }));
          cellButtons.set(`${rowIndex},${colIndex}`, button);
          grid.append(button);
        }));
        const clear = element("button", "Clear selection", "button secondary");
        clear.type = "button";
        clear.addEventListener("click", resetSelection);
        submit.disabled = true;
        form.append(grid, wordList, feedback, clear);
      } else if (game.type === "memory-cards") {
        const board = element("div", undefined, "memory-board");
        const cards = items.flatMap(pair => [
          { pairId: pair.id, value: pair.prompt },
          { pairId: pair.id, value: pair.answer }
        ]).sort(() => Math.random() - 0.5);
        let revealed = [];
        cards.forEach((cardData, index) => {
          const button = element("button", "?", "memory-card");
          button.type = "button";
          button.setAttribute("aria-label", `Hidden card ${index + 1}`);
          button.addEventListener("click", () => {
            if (button.disabled || revealed.length === 2) return;
            button.textContent = cardData.value;
            button.setAttribute("aria-label", cardData.value);
            revealed.push({ button, cardData });
            if (revealed.length !== 2) return;
            const [first, second] = revealed;
            if (first.cardData.pairId === second.cardData.pairId && first.button !== second.button) {
              memoryPairs.add(first.cardData.pairId);
              answers[first.cardData.pairId] = items.find(pair => pair.id === first.cardData.pairId).answer;
              first.button.classList.add("matched");
              second.button.classList.add("matched");
              first.button.disabled = true;
              second.button.disabled = true;
              revealed = [];
              if (memoryPairs.size === items.length) submit.disabled = false;
            } else {
              setTimeout(() => {
                for (const selected of revealed) {
                  selected.button.textContent = "?";
                  selected.button.setAttribute("aria-label", "Hidden card");
                }
                revealed = [];
              }, 700);
            }
          });
          board.append(button);
        });
        submit.disabled = true;
        card.append(board);
      } else {
        for (const item of items) {
          if (game.type === "hangman") {
            const row = element("section", undefined, "question");
            row.append(element("p", `Hint: ${item.prompt}`, "muted"));
            const mask = element("p", "", "result");
            mask.setAttribute("aria-live", "polite");
            const lives = element("p", "Lives: ♥ ♥ ♥ ♥ ♥ ♥", "question-feedback");
            const letters = element("div", undefined, "letters");
            const guessed = new Set();
            let wrong = 0;
            const answer = [...item.answer.toLocaleLowerCase()];
            const updateMask = () => {
              mask.textContent = answer.map(character =>
                /[a-z]/i.test(character) ? (guessed.has(character) ? character : "_") : character
              ).join(" ");
            };
            const finishWord = solved => {
              answers[item.id] = solved ? item.answer : "";
              letters.querySelectorAll("button").forEach(button => button.disabled = true);
              lives.textContent = solved ? "Word found!" : `Out of lives. The word was ${item.answer}.`;
              if (items.every(question => Object.hasOwn(answers, question.id))) submit.disabled = false;
            };
            updateMask();
            for (const character of "abcdefghijklmnopqrstuvwxyz") {
              const button = element("button", character.toUpperCase());
              button.type = "button";
              button.setAttribute("aria-label", `Guess ${character}`);
              button.addEventListener("click", () => {
                button.disabled = true;
                guessed.add(character);
                if (!answer.includes(character)) wrong += 1;
                updateMask();
                lives.textContent = `Lives: ${"♥ ".repeat(Math.max(6 - wrong, 0))}`;
                const solved = answer.every(letter => !/[a-z]/i.test(letter) || guessed.has(letter));
                if (solved) finishWord(true);
                else if (wrong >= 6) finishWord(false);
              });
              letters.append(button);
            }
            row.append(mask, lives, letters);
            form.append(row);
            continue;
          }

          if (game.type === "flashcards") {
            const row = element("div", undefined, "question");
            const prompt = element("p", item.prompt);
            const hiddenAnswer = element("input");
            hiddenAnswer.type = "hidden";
            hiddenAnswer.name = item.id;
            const feedback = element("p", "", "question-feedback");
            const reveal = element("button", "Reveal meaning", "button secondary");
            reveal.type = "button";
            const answer = element("p", item.answer, "result");
            answer.hidden = true;
            const knew = element("button", "I knew it", "button");
            const review = element("button", "Practice again", "button secondary");
            knew.type = review.type = "button";
            knew.disabled = review.disabled = true;
            reveal.addEventListener("click", () => {
              answer.hidden = false;
              knew.disabled = review.disabled = false;
              reveal.disabled = true;
            });
            const choose = value => {
              hiddenAnswer.value = value;
              feedback.textContent = value ? "Marked as recalled." : "Added to your review queue.";
              knew.disabled = review.disabled = true;
              answeredCards.add(item.id);
              if (items.every(question => answeredCards.has(question.id))) submit.disabled = false;
            };
            knew.addEventListener("click", () => choose(item.answer));
            review.addEventListener("click", () => choose(""));
            row.append(prompt, reveal, answer, knew, review, feedback);
            answerInputs.set(item.id, hiddenAnswer);
            form.append(row);
            continue;
          }

          const labelText = game.type === "listening-dictation" ? "Listen, then type the word." : item.prompt;
          const { row, input } = makeQuestion(item, labelText);
          if (game.type === "sentence-builder") {
            const tileBank = element("div", undefined, "tile-bank");
            const tokens = item.words.slice().reverse();
            const used = new Set();
            tokens.forEach((word, index) => {
              const tile = element("button", word, "button secondary");
              tile.type = "button";
              tile.addEventListener("click", () => {
                used.add(index);
                tile.disabled = true;
                input.value = [...used].map(position => tokens[position]).join(" ");
              });
              tileBank.append(tile);
            });
            const clear = element("button", "Clear tiles", "button secondary");
            clear.type = "button";
            clear.addEventListener("click", () => {
              used.clear();
              input.value = "";
              tileBank.querySelectorAll("button").forEach(tile => tile.disabled = false);
            });
            row.append(tileBank, clear);
          }
          if (game.type === "listening-dictation") {
            const listen = element("button", "Play word", "button secondary");
            listen.type = "button";
            listen.addEventListener("click", () => {
              if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
                status.textContent = "Text-to-speech is unavailable. Try another game type in this browser.";
                return;
              }
              const utterance = new SpeechSynthesisUtterance(item.spoken);
              utterance.lang = "en-US";
              utterance.onerror = error => {
                status.textContent = `Text-to-speech failed: ${error.error}.`;
              };
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            });
            row.prepend(listen);
          }
          if (game.type === "pronunciation") {
            const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const speak = element("button", Recognition ? "Speak the word" : "Speech recognition unavailable", "button secondary");
            speak.type = "button";
            speak.disabled = !Recognition;
            speak.addEventListener("click", () => {
              const recognition = new Recognition();
              recognition.lang = "en-US";
              recognition.interimResults = false;
              recognition.onresult = event => {
                input.value = event.results[0][0].transcript;
                status.textContent = `Heard: ${input.value}`;
              };
              recognition.onerror = event => {
                status.textContent = `Speech recognition failed: ${event.error}. You can type the word instead.`;
              };
              try {
                recognition.start();
              } catch (error) {
                status.textContent = `Could not start speech recognition: ${error.message}. You can type the word instead.`;
              }
            });
            row.prepend(speak);
          }
          form.append(row);
        }
      }

      form.append(submit);
      form.addEventListener("submit", async event => {
        event.preventDefault();
        await finishGame();
      });
      if (!["memory-cards", "flashcards", "hangman", "crossword", "word-search"].includes(game.type)) submit.disabled = false;
      card.append(form);
      gameView.append(card);
    }

    function renderGames(games) {
      list.replaceChildren();
      for (const game of games) {
        const card = element("article", undefined, "game-card");
        const meta = [`${(game.pairs || game.questions).length} questions`, game.skill, game.cefr, game.estimatedMinutes ? `about ${game.estimatedMinutes} min` : ""].filter(Boolean).join(" · ");
        card.append(element("h2", game.title), element("p", meta, "muted"));
        const button = element("button", "Play", "button");
        button.type = "button";
        button.addEventListener("click", () => renderGame(game));
        card.append(button);
        list.append(card);
      }
    }

    async function boot() {
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        const query = new URLSearchParams(location.search);
        context = await resolveStudentContext({
          auth: firebase.auth(),
          db: database,
          lessonId: query.get("lesson")
        });
        const [record, progressSnapshot] = await Promise.all([
          loadProtectedContent(database, context.lessonId, "classwork"),
          database.ref(progressPath(context.code)).once("value")
        ]);
        document.getElementById("pageTitle").textContent = `Practice · ${record.content.title || "Your lesson"}`;
        const progress = progressSnapshot.val() || {};
        showRewards(progress);
        panels = mountPanels(document.getElementById("gamePanels"), {
          progress, settings,
          onSettings: next => { settings = next; saveSettings(settings); applyCalm(settings); },
          onShop: async (itemId, action) => {
            const outcome = await shopAction({ db: database, code: context.code, itemId, action });
            status.textContent = outcome.ok ? (action === "buy" ? "Bought! It is yours to keep." : "Updated your look.") : outcome.reason === "gems" ? "You need more gems for that." : "That could not be done.";
            if (outcome.ok) { showRewards(outcome.state); panels.update(outcome.state); }
          }
        });
        const games = createPracticeGames(record.content, { seed: context.code });
        const reviewGame = createReviewGame(progressSnapshot.val()?.reviewQueue);
        if (reviewGame) games.unshift(reviewGame);
        renderGames(games);
        if (!reviewGame) list.prepend(Object.assign(element("article", undefined, "game-card"), { }));
        if (!reviewGame) { const done = list.firstElementChild; done.append(element("h2", "Practice mistakes"), element("p", "You're done for today: nothing is due for review. Come back tomorrow, or play any game below.", "muted")); }
        status.textContent = list.childElementCount
          ? "Choose a short game to review this lesson."
          : "This lesson does not have enough compatible practice items yet.";
      } catch (error) {
        status.textContent = `Practice could not be opened: ${error.message}`;
        list.replaceChildren();
      }
    }
    boot();
  

if (typeof element === "function") globalThis["element"] = element;
if (typeof showRewards === "function") globalThis["showRewards"] = showRewards;
if (typeof renderGame === "function") globalThis["renderGame"] = renderGame;
if (typeof finishGame === "function") globalThis["finishGame"] = finishGame;
if (typeof makeQuestion === "function") globalThis["makeQuestion"] = makeQuestion;
if (typeof renderGames === "function") globalThis["renderGames"] = renderGames;
if (typeof boot === "function") globalThis["boot"] = boot;
if (typeof coordinates === "function") globalThis["coordinates"] = coordinates;
if (typeof resetSelection === "function") globalThis["resetSelection"] = resetSelection;
if (typeof addSelection === "function") globalThis["addSelection"] = addSelection;
if (typeof updateMask === "function") globalThis["updateMask"] = updateMask;
if (typeof finishWord === "function") globalThis["finishWord"] = finishWord;
if (typeof choose === "function") globalThis["choose"] = choose;
