
    import { firebaseConfig } from "../config.js";
    import { resolveStudentContext } from "../student-context.js";
    import { loadProtectedContent } from "../protected-content.js";
    import { clipEmbedUrl, validateClip } from "../clips/schema.js";
    import { evaluateGame, normalizeAnswer } from "../games/engine.js";
    import { saveGameProgress, saveVocabularyWord } from "../games/progress.js";

    const element = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const lessonId = params.get("lesson");
    const status = element("status");
    let context;
    let clip;
    let player;
    let answers = {};
    let gameStartedAt = Date.now();
    let selectedVocabulary;
    let loopTimer;
    let videoRequested = false;
    const savedWords = new Set();
    const tracks = { en: "text", native: "translation", none: null };

    function showError(error) {
      status.textContent = `Clip Lab could not load: ${error.message}`;
      status.classList.add("error");
    }

    function wordKey(word) {
      return word.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    function makeTranscriptLine(line) {
      const item = document.createElement("li");
      item.className = "transcript-line";
      const time = document.createElement("span");
      time.className = "line-time";
      time.textContent = clip.transcriptType === "verified"
        ? `${line.startSeconds}s–${line.endSeconds}s`
        : "Teacher-created practice line · video timing not verified";
      const content = document.createElement("span");
      content.className = "line-text";
      content.dataset.lineId = line.id;
      const actions = document.createElement("div");
      actions.className = "line-actions";
      const shadow = document.createElement("button");
      shadow.type = "button";
      shadow.textContent = "Shadow this line";
      const shadowFeedback = document.createElement("span");
      shadowFeedback.className = "feedback";
      shadowFeedback.setAttribute("aria-live", "polite");
      const readAloud = document.createElement("button");
      readAloud.type = "button";
      readAloud.textContent = "Read aloud";
      readAloud.addEventListener("click", () => {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
          shadowFeedback.textContent = "Text-to-speech is not available in this browser.";
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = "en-US";
        utterance.onerror = event => {
          shadowFeedback.textContent = `Text-to-speech failed: ${event.error}.`;
          shadowFeedback.classList.add("error");
        };
        window.speechSynthesis.speak(utterance);
      });
      shadow.addEventListener("click", () => shadowPractice(line, shadowFeedback));
      actions.append(readAloud, shadow);
      if (clip.transcriptType === "verified") {
        const loop = document.createElement("button");
        loop.type = "button";
        loop.textContent = "Loop this line";
        loop.addEventListener("click", () => startLoop(line, loop).catch(error => {
          element("playerStatus").textContent = `Could not loop line: ${error.message}`;
        }));
        actions.append(loop);
      }
      item.append(time, content, actions, shadowFeedback);
      updateTranscriptLine(content, line, "en");
      return item;
    }

    function shadowPractice(line, feedback) {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        feedback.textContent = "Speech recognition is not available. Read the line aloud and compare it with the text.";
        return;
      }
      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      feedback.textContent = "Listening… say the practice line.";
      recognition.onresult = event => {
        const spoken = event.results[0][0].transcript;
        const correct = normalizeAnswer(spoken) === normalizeAnswer(line.text);
        feedback.textContent = correct ? "Nice shadowing!" : `Heard: “${spoken}”. Try once more.`;
        feedback.classList.toggle("success", correct);
      };
      recognition.onerror = event => {
        feedback.textContent = `Speech recognition failed: ${event.error}. You can still read the line aloud.`;
        feedback.classList.add("error");
      };
      try {
        recognition.start();
      } catch (error) {
        feedback.textContent = `Could not start speech recognition: ${error.message}. You can still read the line aloud.`;
        feedback.classList.add("error");
      }
    }

    function updateTranscriptLine(content, line, track) {
      content.replaceChildren();
      const text = tracks[track] ? line[tracks[track]] : "Study text hidden.";
      if (!text) {
        content.textContent = "Translation not provided.";
        return;
      }
      const terms = clip.vocabulary.map(item => item.word).sort((a, b) => b.length - a.length);
      if (!terms.length) {
        content.textContent = text;
        return;
      }
      const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
      text.split(pattern).forEach(part => {
        const vocabulary = clip.vocabulary.find(item => item.word.toLocaleLowerCase() === part.toLocaleLowerCase());
        if (!vocabulary) {
          content.append(document.createTextNode(part));
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "word";
        button.textContent = part;
        button.setAttribute("aria-label", `Define ${part}`);
        button.addEventListener("click", () => openVocabulary(vocabulary));
        content.append(button);
      });
    }

    function openVocabulary(item) {
      selectedVocabulary = item;
      element("vocabularyWord").textContent = item.word;
      element("vocabularyTranslation").textContent = item.translation;
      element("vocabularyDefinition").textContent = item.definition;
      element("vocabularyStatus").textContent = "";
      element("saveWord").disabled = savedWords.has(item.word);
      element("saveWord").textContent = savedWords.has(item.word) ? "Saved" : "Save word";
      element("vocabularyDialog").showModal();
    }

    async function saveVocabulary() {
      if (!selectedVocabulary) return;
      const key = wordKey(selectedVocabulary.word);
      if (!key) throw new Error("This word cannot be saved.");
      await saveVocabularyWord({
        db: firebase.database(),
        code: context.code,
        key: key.slice(0, 64),
        entry: {
          ...selectedVocabulary,
          savedAt: new Date().toISOString(),
          sourceClipId: clip.id
        }
      });
      savedWords.add(selectedVocabulary.word);
      element("saveWord").disabled = true;
      element("saveWord").textContent = "Saved";
      element("vocabularyStatus").textContent = "Saved to your vocabulary deck.";
    }

    function addVideoFallback() {
      const iframe = document.createElement("iframe");
      const source = new URL(clipEmbedUrl(clip));
      source.searchParams.set("origin", location.origin);
      iframe.src = source.href;
      iframe.title = `Official video: ${clip.source.videoTitle}`;
      iframe.loading = "lazy";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      element("media").replaceChildren(iframe);
      element("playerStatus").textContent = "Video controls are available in the official player. Advanced playback controls are unavailable.";
    }

    function loadYouTubeApi() {
      if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
      return new Promise((resolve, reject) => {
        const previousReady = window.onYouTubeIframeAPIReady;
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => reject(new Error("The official video player could not be loaded."));
        window.onYouTubeIframeAPIReady = () => {
          if (typeof previousReady === "function") previousReady();
          resolve(window.YT);
        };
        document.head.append(script);
      });
    }

    async function startVideo() {
      if (videoRequested) return;
      videoRequested = true;
      element("playerStatus").textContent = "Loading the official video player…";
      try {
        const youtube = await loadYouTubeApi();
        const target = document.createElement("div");
        target.id = "youtubePlayer";
        element("media").replaceChildren(target);
        player = new youtube.Player("youtubePlayer", {
          videoId: clip.source.videoId,
          playerVars: {
            start: clip.startSeconds,
            end: clip.endSeconds,
            rel: 0,
            playsinline: 1,
            origin: location.origin
          },
          events: {
            onReady: event => {
              element("playerStatus").textContent = "Video ready. Select a transcript line to read it aloud, or play the clip.";
              event.target.setPlaybackRate(Number(element("speed").value));
            },
            onError: () => {
              element("playerStatus").textContent = "The video is unavailable in the official player. Open the source video in a new tab.";
              const link = document.createElement("a");
              link.href = clip.source.sourceUrl;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "Open official video";
              element("playerStatus").append(" ", link);
            }
          }
        });
      } catch (error) {
        element("playerStatus").textContent = error.message;
        addVideoFallback();
      }
    }

    async function startLoop(line, button) {
      if (clip.transcriptType !== "verified") return;
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
        if (player) player.pauseVideo();
        button.textContent = "Loop this line";
        element("playerStatus").textContent = "Line loop stopped.";
        return;
      }
      if (!player) await startVideo();
      if (!player) return;
      clearInterval(loopTimer);
      player.seekTo(line.startSeconds, true);
      player.playVideo();
      loopTimer = setInterval(() => {
        if (player.getCurrentTime() >= line.endSeconds) player.seekTo(line.startSeconds, true);
      }, 250);
      button.textContent = "Stop looping";
      element("playerStatus").textContent = "Looping the selected verified transcript line.";
    }

    function renderExercises() {
      const root = element("exercises");
      root.replaceChildren();
      answers = {};
      clip.exercises.forEach((exercise, index) => {
        const section = document.createElement("section");
        section.className = "exercise";
        const label = document.createElement("label");
        label.textContent = `${index + 1}. ${exercise.prompt}`;
        label.htmlFor = `answer-${exercise.id}`;
        const feedback = document.createElement("p");
        feedback.className = "feedback";
        feedback.id = `feedback-${exercise.id}`;
        if (["listen-pick", "check-understanding"].includes(exercise.type)) {
          const options = document.createElement("div");
          options.className = "options";
          exercise.options.forEach(option => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = option;
            button.addEventListener("click", () => {
              answers[exercise.id] = option;
              options.querySelectorAll("button").forEach(candidate => candidate.disabled = true);
              feedback.textContent = normalizeAnswer(option) === normalizeAnswer(exercise.answer) ? "Correct!" : "Try again next time.";
              feedback.classList.toggle("success", normalizeAnswer(option) === normalizeAnswer(exercise.answer));
              checkComplete();
            });
            options.append(button);
          });
          section.append(label, options, feedback);
        } else {
          const input = document.createElement("input");
          input.id = `answer-${exercise.id}`;
          input.autocomplete = "off";
          input.setAttribute("aria-label", exercise.prompt);
          const submit = document.createElement("button");
          submit.type = "button";
          submit.textContent = "Check";
          submit.addEventListener("click", () => {
            if (!input.value.trim()) {
              feedback.textContent = "Enter an answer first.";
              input.focus();
              return;
            }
            answers[exercise.id] = input.value;
            input.disabled = true;
            submit.disabled = true;
            const correct = normalizeAnswer(input.value) === normalizeAnswer(exercise.answer);
            feedback.textContent = correct ? "Correct!" : "Answer saved for your review.";
            feedback.classList.toggle("success", correct);
            checkComplete();
          });
          section.append(label, input, submit, feedback);
        }
        root.append(section);
      });
      element("complete").disabled = clip.exercises.length === 0;
    }

    function checkComplete() {
      element("complete").disabled = Object.keys(answers).length !== clip.exercises.length;
    }

    async function completeLesson() {
      const questions = clip.exercises.map(exercise => ({
        id: exercise.id,
        prompt: exercise.prompt,
        answer: exercise.answer,
        options: exercise.options
      }));
      const game = { id: clip.id, type: "fill-gap", title: `Clip Lab: ${clip.title}`, questions };
      const result = evaluateGame(game, answers);
      result.timeSpentSeconds = Math.round((Date.now() - gameStartedAt) / 1000);
      await saveGameProgress({ db: firebase.database(), code: context.code, game, result });
      element("complete").disabled = true;
      element("result").textContent = `Lesson complete: ${result.score}/${result.total} correct. XP and review progress saved.`;
      element("result").classList.add("success");
    }

    async function initialize() {
      if (!lessonId || !/^[A-Za-z0-9_-]+$/.test(lessonId)) throw new Error("A valid lesson is required.");
      firebase.initializeApp(firebaseConfig);
      const auth = firebase.auth();
      const db = firebase.database();
      context = await resolveStudentContext({ auth, db, lessonId });
      const [record, lessonSnapshot] = await Promise.all([
        loadProtectedContent(db, context.lessonId, "clip"),
        db.ref(`studentCurriculum/${context.code}/${context.lessonId}`).once("value")
      ]);
      clip = validateClip(record.content);
      const lesson = lessonSnapshot.val();
      if (!lesson || lesson.published === false || lesson.clipId !== clip.id) {
        throw new Error("This clip is not assigned to your account.");
      }
      element("backLink").href = `portal.html?code=${encodeURIComponent(context.code)}`;
      element("practiceLink").href = `practice.html?code=${encodeURIComponent(context.code)}&lesson=${encodeURIComponent(context.lessonId)}`;
      element("title").textContent = clip.title;
      element("level").textContent = clip.level;
      element("description").textContent = `${clip.source.channel} · ${clip.source.videoTitle}`;
      element("transcriptNote").textContent = clip.transcriptNote;
      const tags = [...clip.genre, ...clip.grammarPoints, ...clip.vocabularyThemes];
      tags.forEach(value => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = value;
        element("tags").append(tag);
      });
      clip.transcript.forEach(line => element("transcript").append(makeTranscriptLine(line)));
      renderExercises();
      element("speed").addEventListener("change", () => {
        if (player && typeof player.setPlaybackRate === "function") player.setPlaybackRate(Number(element("speed").value));
      });
      document.querySelectorAll("[data-track]").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll("[data-track]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        const track = button.dataset.track;
        document.querySelectorAll(".line-text").forEach(content => {
          const line = clip.transcript.find(item => item.id === content.dataset.lineId);
          updateTranscriptLine(content, line, track);
        });
      }));
      element("saveWord").addEventListener("click", () => saveVocabulary().catch(error => {
        element("vocabularyStatus").textContent = `Could not save word: ${error.message}`;
        element("vocabularyStatus").classList.add("error");
      }));
      element("closeDialog").addEventListener("click", () => element("vocabularyDialog").close());
      element("complete").addEventListener("click", () => completeLesson().catch(error => {
        element("result").textContent = `Could not save progress: ${error.message}`;
        element("result").classList.add("error");
      }));
      element("shadowNotice").textContent = window.SpeechRecognition || window.webkitSpeechRecognition
        ? "Tap a word to open its vocabulary card. Read the practice sentence aloud to shadow it."
        : "Speech recognition is not available in this browser. You can read the practice sentence aloud without automatic feedback.";
      element("status").hidden = true;
      element("clipContent").hidden = false;
    }

    element("loadVideo").addEventListener("click", startVideo, { once: true });
    initialize().catch(showError);
  

if (typeof showError === "function") globalThis["showError"] = showError;
if (typeof wordKey === "function") globalThis["wordKey"] = wordKey;
if (typeof makeTranscriptLine === "function") globalThis["makeTranscriptLine"] = makeTranscriptLine;
if (typeof shadowPractice === "function") globalThis["shadowPractice"] = shadowPractice;
if (typeof updateTranscriptLine === "function") globalThis["updateTranscriptLine"] = updateTranscriptLine;
if (typeof openVocabulary === "function") globalThis["openVocabulary"] = openVocabulary;
if (typeof saveVocabulary === "function") globalThis["saveVocabulary"] = saveVocabulary;
if (typeof addVideoFallback === "function") globalThis["addVideoFallback"] = addVideoFallback;
if (typeof loadYouTubeApi === "function") globalThis["loadYouTubeApi"] = loadYouTubeApi;
if (typeof startVideo === "function") globalThis["startVideo"] = startVideo;
if (typeof startLoop === "function") globalThis["startLoop"] = startLoop;
if (typeof renderExercises === "function") globalThis["renderExercises"] = renderExercises;
if (typeof checkComplete === "function") globalThis["checkComplete"] = checkComplete;
if (typeof completeLesson === "function") globalThis["completeLesson"] = completeLesson;
if (typeof initialize === "function") globalThis["initialize"] = initialize;
if (typeof element === "function") globalThis["element"] = element;
