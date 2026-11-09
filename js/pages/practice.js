
    import { firebaseConfig } from "../config.js";
    import { resolveStudentContext } from "../student-context.js";
    import { loadProtectedContent } from "../protected-content.js";
    import { createPracticeGames, createReviewGame } from "../games/engine.js";
    import { progressPath, saveGameProgress, shopAction } from "../games/progress.js";
    import { moduleFor, playModular } from "../games/runtime.js";
    import { mountPanels } from "../games/panels.js";
    import { applyCalm, createServices, loadSettings, saveSettings } from "../games/settings.js";
    import { mountOfflineBanner, watchConnection } from "../shell.js";
    mountOfflineBanner();

    const status = document.getElementById("status");
    const list = document.getElementById("gameList");
    const gameView = document.getElementById("gameView");
    const stats = document.getElementById("stats");
    let database;
    let context;
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
      if (activeModule && activeModule.destroy) activeModule.destroy();
      activeModule = null;
      if (!moduleFor(game)) { status.textContent = `The ${game.title} game is not available in this version.`; return; }
      renderModularGame(game);
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
        database = firebase.database(); watchConnection(database);
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
if (typeof renderGames === "function") globalThis["renderGames"] = renderGames;
if (typeof boot === "function") globalThis["boot"] = boot;
