
    import { firebaseConfig } from "../config.js";
    import { resolveStudentContext } from "../student-context.js";
    import { loadProtectedContent } from "../protected-content.js";
    import { evaluateGame, normalizeAnswer } from "../games/engine.js";
    import { saveGameProgress, saveVocabularyWord } from "../games/progress.js";
    import { validateManga } from "../manga/schema.js";

    const byId = id => document.getElementById(id);
    const lessonId = new URLSearchParams(location.search).get("lesson");
    const status = byId("status");
    let context;
    let manga;
    let chapter;
    let pageIndex = 0;
    let answers = {};
    let startedAt;
    let selectedWord;
    let selectedBubble;

    function showError(error) {
      status.textContent = `Manga Reader could not load: ${error.message}`;
      status.classList.add("error");
    }

    function renderBubbleText(panel, bubble) {
      bubble.replaceChildren();
      const terms = panel.vocabulary.map(item => item.word).sort((a, b) => b.length - a.length);
      const pattern = terms.length
        ? new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi")
        : null;
      (pattern ? panel.bubbleText.split(pattern) : [panel.bubbleText]).forEach(part => {
        const vocabulary = panel.vocabulary.find(item => item.word.toLocaleLowerCase() === part.toLocaleLowerCase());
        if (!vocabulary) {
          bubble.append(document.createTextNode(part));
          return;
        }
        const word = document.createElement("button");
        word.type = "button";
        word.className = "word";
        word.textContent = part;
        word.setAttribute("aria-label", `Define ${part}`);
        word.addEventListener("click", event => {
          event.stopPropagation();
          openWord(vocabulary);
        });
        bubble.append(word);
      });
    }

    function openWord(item) {
      selectedWord = item;
      byId("wordHeading").textContent = item.word;
      byId("wordTranslation").textContent = item.translation;
      byId("wordDefinition").textContent = item.definition;
      byId("wordStatus").textContent = "";
      byId("saveWord").disabled = false;
      byId("saveWord").textContent = "Save word";
      byId("wordDialog").showModal();
    }

    function renderPanel(panel, index) {
      const card = document.createElement("article");
      card.className = "reader-card";
      card.hidden = document.body.dataset.mode === "page-flip" && index !== pageIndex;
      const image = document.createElement("img");
      image.src = panel.imageUrl;
      image.alt = panel.alt;
      image.loading = index > 0 ? "lazy" : "eager";
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = "bubble";
      bubble.setAttribute("aria-label", `Explain speech bubble: ${panel.bubbleText}`);
      const bubbleText = document.createElement("span");
      bubbleText.className = "bubble-text";
      renderBubbleText(panel, bubbleText);
      bubble.append(bubbleText);
      bubble.addEventListener("click", () => {
        selectedBubble = panel;
        byId("bubbleExplanation").textContent = panel.simplifiedExplanation;
        byId("bubbleStatus").textContent = "";
        byId("bubbleDialog").showModal();
      });
      card.append(image, bubble);
      return card;
    }

    function renderPanels() {
      const root = byId("panels");
      root.replaceChildren(...chapter.panels.map(renderPanel));
      const flip = document.body.dataset.mode === "page-flip";
      root.className = `reader ${flip ? "page-flip" : "vertical"}`;
      byId("pageControls").hidden = !flip;
      if (flip) {
        root.querySelectorAll(".reader-card").forEach((panel, index) => {
          panel.hidden = index !== pageIndex;
        });
      }
      byId("pageNumber").textContent = `${pageIndex + 1} / ${chapter.panels.length}`;
      byId("previousPage").disabled = pageIndex === 0;
      byId("nextPage").disabled = pageIndex >= chapter.panels.length - 1;
    }

    function renderChecks() {
      const root = byId("checks");
      root.replaceChildren();
      answers = {};
      chapter.checks.forEach((check, index) => {
        const section = document.createElement("section");
        section.className = "check";
        const heading = document.createElement("h3");
        heading.textContent = `${check.type === "boss-quiz" ? "👑 Chapter boss" : check.type === "fill-bubble" ? "💬 Fill the bubble" : `Check ${index + 1}`}: ${check.prompt}`;
        const options = document.createElement("div");
        options.className = "options";
        const feedback = document.createElement("p");
        feedback.className = "status";
        feedback.setAttribute("aria-live", "polite");
        check.options.forEach(option => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = option;
          button.addEventListener("click", () => {
            answers[check.id] = option;
            options.querySelectorAll("button").forEach(choice => choice.disabled = true);
            const correct = normalizeAnswer(option) === normalizeAnswer(check.answer);
            feedback.textContent = correct ? "Correct!" : "Added to your review.";
            feedback.classList.toggle("success", correct);
            byId("completeChapter").disabled = Object.keys(answers).length !== chapter.checks.length;
          });
          options.append(button);
        });
        section.append(heading, options, feedback);
        root.append(section);
      });
      byId("completeChapter").disabled = chapter.checks.length === 0;
    }

    async function saveWord() {
      if (!selectedWord) return;
      const key = selectedWord.word.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!key) throw new Error("This word cannot be saved.");
      await saveVocabularyWord({
        db: firebase.database(),
        code: context.code,
        key: key.slice(0, 64),
        entry: {
          ...selectedWord,
          sourceMangaId: manga.id,
          chapterId: chapter.id,
          savedAt: new Date().toISOString()
        }
      });
      byId("wordStatus").textContent = "Saved to your vocabulary collection.";
      byId("saveWord").textContent = "Saved";
      byId("saveWord").disabled = true;
    }

    async function finishChapter() {
      const questions = chapter.checks.map(check => ({
        id: check.id,
        prompt: check.prompt,
        answer: check.answer
      }));
      const game = {
        id: `manga-${chapter.id}`,
        type: "fill-gap",
        title: `Manga: ${chapter.title}`,
        questions
      };
      const result = evaluateGame(game, answers);
      result.timeSpentSeconds = Math.round((Date.now() - startedAt) / 1000);
      const progress = await saveGameProgress({
        db: firebase.database(),
        code: context.code,
        game,
        result
      });
      byId("completeChapter").disabled = true;
      byId("result").textContent = `Chapter complete: ${result.score}/${result.total} correct. You earned XP; your reading streak is ${progress.streak} day(s).`;
      byId("result").classList.add("success");
    }

    async function initialize() {
      if (!lessonId || !/^[A-Za-z0-9_-]+$/.test(lessonId)) throw new Error("A valid lesson is required.");
      firebase.initializeApp(firebaseConfig);
      const db = firebase.database();
      context = await resolveStudentContext({ auth: firebase.auth(), db, lessonId });
      const [record, lessonSnapshot] = await Promise.all([
        loadProtectedContent(db, context.lessonId, "manga"),
        db.ref(`studentCurriculum/${context.code}/${context.lessonId}`).once("value")
      ]);
      manga = validateManga(record.content);
      const lesson = lessonSnapshot.val();
      if (!lesson || lesson.published === false || lesson.features?.mangaReader !== true ||
          lesson.mangaId !== manga.id) {
        throw new Error("Manga Reader is not enabled for this student or lesson.");
      }
      chapter = manga.chapters[0];
      startedAt = Date.now();
      byId("backLink").href = `portal.html?code=${encodeURIComponent(context.code)}`;
      byId("practiceLink").href = `practice.html?code=${encodeURIComponent(context.code)}&lesson=${encodeURIComponent(context.lessonId)}`;
      byId("title").textContent = manga.title;
      byId("level").textContent = manga.level;
      byId("chapterTitle").textContent = chapter.title;
      renderPanels();
      renderChecks();
      document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
        document.body.dataset.mode = button.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        renderPanels();
      }));
      byId("previousPage").addEventListener("click", () => {
        pageIndex = Math.max(0, pageIndex - 1);
        renderPanels();
      });
      byId("nextPage").addEventListener("click", () => {
        pageIndex = Math.min(chapter.panels.length - 1, pageIndex + 1);
        renderPanels();
      });
      byId("readBubble").addEventListener("click", () => {
        if (!selectedBubble) return;
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
          byId("bubbleStatus").textContent = "Text-to-speech is not available in this browser. You can read the bubble aloud yourself.";
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(selectedBubble.bubbleText);
        utterance.lang = "en-US";
        utterance.onerror = event => {
          byId("bubbleStatus").textContent = `Text-to-speech failed: ${event.error}.`;
          byId("bubbleStatus").classList.add("error");
        };
        window.speechSynthesis.speak(utterance);
      });
      byId("closeBubble").addEventListener("click", () => byId("bubbleDialog").close());
      byId("saveWord").addEventListener("click", () => saveWord().catch(error => {
        byId("wordStatus").textContent = `Could not save word: ${error.message}`;
        byId("wordStatus").classList.add("error");
      }));
      byId("closeWord").addEventListener("click", () => byId("wordDialog").close());
      byId("completeChapter").addEventListener("click", () => finishChapter().catch(error => {
        byId("result").textContent = `Could not save chapter progress: ${error.message}`;
        byId("result").classList.add("error");
      }));
      byId("status").hidden = true;
      byId("readerContent").hidden = false;
    }

    initialize().catch(showError);
  

if (typeof showError === "function") globalThis["showError"] = showError;
if (typeof renderBubbleText === "function") globalThis["renderBubbleText"] = renderBubbleText;
if (typeof openWord === "function") globalThis["openWord"] = openWord;
if (typeof renderPanel === "function") globalThis["renderPanel"] = renderPanel;
if (typeof renderPanels === "function") globalThis["renderPanels"] = renderPanels;
if (typeof renderChecks === "function") globalThis["renderChecks"] = renderChecks;
if (typeof saveWord === "function") globalThis["saveWord"] = saveWord;
if (typeof finishChapter === "function") globalThis["finishChapter"] = finishChapter;
if (typeof initialize === "function") globalThis["initialize"] = initialize;
if (typeof byId === "function") globalThis["byId"] = byId;
