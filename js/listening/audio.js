// Audio playback for the listening trainer: pre-generated neural mp3 when the pack has it, otherwise (or when the
// file cannot be played) the browser's speech synthesis, labelled as a device voice because quality varies by device.
// The mouth animation is driven by the audio amplitude (Web Audio AnalyserNode), by word timings, or, for the device
// voice, by its word-boundary events.
const FEMALE = /sonia|libby|maisie|hazel|susan|serena|kate|fiona|female|uk english female/i;
const MALE = /ryan|george|thomas|daniel|arthur|oliver|male|uk english male/i;

// Best British voice available. Pure: takes the list from speechSynthesis.getVoices().
export function pickBritishVoice(voices, character = "nora") {
  const list = Array.isArray(voices) ? voices : [];
  const wantedGender = character === "arthur" ? MALE : FEMALE;
  const otherGender = character === "arthur" ? FEMALE : MALE;
  const scored = list.map(voice => {
    const lang = String(voice.lang || "").replace("_", "-").toLowerCase();
    const name = String(voice.name || "");
    let score = 0;
    if (lang === "en-gb") score += 60; else if (lang.startsWith("en")) score += 5; else return { voice, score: -1 };
    if (/natural|online|neural/i.test(name)) score += 25;
    if (/google uk english/i.test(name)) score += 20;
    if (/microsoft/i.test(name)) score += 10;
    if (wantedGender.test(name)) score += 15;
    if (otherGender.test(name) && !wantedGender.test(name)) score -= 10;
    if (voice.localService === false) score -= 1;
    return { voice, score };
  }).filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].voice : null;
}

// charIndex of a speech-synthesis boundary event -> index of the whitespace-separated word.
export function wordIndexAt(text, charIndex) {
  let index = 0; let position = 0;
  for (const token of String(text).split(/(\s+)/)) {
    if (/^\s+$/.test(token)) { position += token.length; continue; }
    if (charIndex < position + token.length) return index;
    position += token.length; index += 1;
  }
  return Math.max(0, index - 1);
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

// options: { item, character, baseUrl, source, whenAmplitude(0..1), whenWord(index), whenSource(kind, message), whenState("speaking"|"idle") }
// source: the set's recording ({ url }); an item with a clip then plays its own stretch of it.
export function createPlayer(options) {
  const { item, character = "nora", baseUrl = "", source = null, whenAmplitude = () => {}, whenWord = () => {}, whenSource = () => {}, whenState = () => {} } = options;
  let audio = null; let context = null; let analyser = null; let frame = 0; let pulse = 0; let token = 0; let clipTimer = 0;

  function stopMeters() { cancelAnimationFrame(frame); clearInterval(pulse); whenAmplitude(0); }
  function meter() {
    if (!analyser) { pulse = setInterval(() => whenAmplitude(Math.random() * 0.8 + 0.1), 120); return; }
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) { const centred = (value - 128) / 128; sum += centred * centred; }
      whenAmplitude(Math.min(1, Math.sqrt(sum / data.length) * 4));
      frame = requestAnimationFrame(tick);
    };
    tick();
  }

  function stop() {
    token += 1;
    clearInterval(clipTimer);
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio = null; }
    if (speechSupported()) window.speechSynthesis.cancel();
    stopMeters();
    whenState("idle");
  }

  function playDevice(slow, mine, reason) {
    return new Promise(resolve => {
      if (!speechSupported()) { whenSource("none", "This browser cannot play audio or speech."); whenState("idle"); resolve(false); return; }
      const speak = () => {
        if (mine !== token) { resolve(false); return; }
        const utterance = new SpeechSynthesisUtterance(item.text);
        const voice = pickBritishVoice(window.speechSynthesis.getVoices(), character);
        utterance.lang = "en-GB";
        if (voice) utterance.voice = voice;
        utterance.rate = slow ? 0.7 : 0.92;
        utterance.pitch = character === "arthur" ? 0.9 : 1;
        utterance.onboundary = event => { if (event.name === "word" || event.charIndex !== undefined) { whenWord(wordIndexAt(item.text, event.charIndex)); whenAmplitude(0.9); setTimeout(() => whenAmplitude(0.25), 90); } };
        utterance.onend = () => { if (mine === token) { stopMeters(); whenState("idle"); } resolve(true); };
        utterance.onerror = () => { if (mine === token) { stopMeters(); whenState("idle"); } resolve(false); };
        whenSource("device", reason || `Device voice${voice ? ` (${voice.name})` : ""}: quality depends on your device.`);
        whenState("speaking");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      };
      if (window.speechSynthesis.getVoices().length) speak();
      else { let done = false; const runOnce = () => { if (done) return; done = true; speak(); }; window.speechSynthesis.addEventListener("voiceschanged", runOnce, { once: true }); setTimeout(runOnce, 400); }
    });
  }

  async function playFile(slow, mine) {
    const path = slow && item.audio && item.audio.slow ? item.audio.slow : item.audio.normal;
    audio = new Audio(`${baseUrl}${path}`);
    audio.preload = "auto";
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        context = context || new AudioContextClass();
        analyser = context.createAnalyser(); analyser.fftSize = 512;
        const source = context.createMediaElementSource(audio);
        source.connect(analyser); analyser.connect(context.destination);
        if (context.state === "suspended") await context.resume();
      }
    } catch (error) { analyser = null; }
    const timings = Array.isArray(item.wordTimings) ? item.wordTimings : [];
    audio.addEventListener("timeupdate", () => { if (mine !== token) return; const now = audio.currentTime; const hit = timings.find(timing => now >= timing.start && now < timing.end); if (hit) whenWord(hit.i); });
    return new Promise(resolve => {
      audio.addEventListener("ended", () => { if (mine === token) { stopMeters(); whenState("idle"); } resolve(true); }, { once: true });
      audio.addEventListener("error", () => resolve(false), { once: true });
      audio.play().then(() => { if (mine !== token) return; whenSource("neural", "Neural British voice"); whenState("speaking"); meter(); }).catch(() => resolve(false));
    });
  }

  // One sentence of a longer recording: seek to clip.start, stop at clip.end. The recording usually lives on another site, so
  // it is never routed through Web Audio (that would silence it); the mouth moves with a simple pulse instead.
  function playClip(slow, mine) {
    const clip = item.clip;
    audio = new Audio(); audio.preload = "auto"; audio.src = source.url;
    analyser = null;
    return new Promise(resolve => {
      let finished = false;
      const element = audio;
      const finish = ok => {
        if (finished) return; finished = true; clearInterval(clipTimer);
        element.pause();
        if (mine === token) { stopMeters(); whenState("idle"); }
        resolve(ok);
      };
      element.addEventListener("ended", () => finish(true), { once: true });
      element.addEventListener("error", () => finish(false), { once: true });
      const begin = () => {
        if (mine !== token) { finish(false); return; }
        try { element.currentTime = clip.start; } catch { /* a server without seeking plays from the start */ }
        element.playbackRate = slow ? 0.75 : 1;
        element.play().then(() => {
          if (mine !== token) { finish(false); return; }
          whenSource("recording", "Recording");
          whenState("speaking"); meter();
          clipTimer = setInterval(() => { if (element.currentTime >= clip.end) finish(true); }, 40);
        }).catch(() => finish(false));
      };
      if (element.readyState >= 1) begin(); else element.addEventListener("loadedmetadata", begin, { once: true });
    });
  }

  async function play({ slow = false } = {}) {
    stop();
    const mine = token;
    if (item.clip && source && source.url) {
      const ok = await playClip(slow, mine);
      if (ok || mine !== token) return ok;
      stopMeters();
      return playDevice(slow, mine, "The recording could not be played, so the device voice reads the sentence instead.");
    }
    if (item.audio && item.audio.normal) {
      const ok = await playFile(slow, mine);
      if (ok || mine !== token) return ok;
      stopMeters();
      return playDevice(slow, mine, "The audio file could not be played, so the device voice is used instead.");
    }
    return playDevice(slow, mine);
  }

  return { play, stop };
}
