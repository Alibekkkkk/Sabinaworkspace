// Wrapper around the official YouTube IFrame Player (privacy-enhanced domain, no autoplay) for a clip window.
// The page talks to this wrapper, never to YT directly, so the logic can be tested with a fake player.
import { SPEEDS, activeLineIndex, nextLineIndex, previousTarget, tick } from "./lines.js";

export const POLL_MS = 250; // about 4 times a second
export const API_URL = "https://www.youtube.com/iframe_api";
export const EMBED_HOST = "https://www.youtube-nocookie.com";

export function loadYouTubeApi(win = window, timeoutMs = 10000) {
  if (win.YT && win.YT.Player) return Promise.resolve(win.YT);
  return new Promise((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(new Error("The official video player did not load in time.")), timeoutMs);
    win.onYouTubeIframeAPIReady = () => { clearTimeout(timer); if (typeof previous === "function") previous(); resolve(win.YT); };
    const script = win.document.createElement("script"); script.src = API_URL;
    script.addEventListener("error", () => { clearTimeout(timer); reject(new Error("The official video player could not be loaded (it may be blocked on this network).")); });
    win.document.head.append(script);
  });
}

export const ERROR_TEXT = Object.freeze({
  2: "The video address is not valid.", 5: "The video could not be played in this browser.",
  100: "The video was removed or made private.", 101: "The owner does not allow this video to be played here.", 150: "The owner does not allow this video to be played here."
});

export function createClipPlayer({ clip, target, YT, origin = "", whenLine = () => {}, whenState = () => {}, whenError = () => {}, whenTime = () => {} }) {
  const lines = clip.transcript; const start = clip.startSeconds; const end = clip.endSeconds;
  let player = null; let timer = 0; let loopLine = -1; let lastLine = -2; let speed = 1; let ready = false; let destroyed = false;
  const verified = Boolean(clip.timingVerified);

  const time = () => (player && typeof player.getCurrentTime === "function" ? Number(player.getCurrentTime()) || 0 : start);
  function watch() {
    if (!player || destroyed) return;
    const now = time(); whenTime(now);
    const step = tick({ lines: verified ? lines : [], time: now, start, end, loopLine: verified ? loopLine : -1 });
    if (step.action === "seek") { player.seekTo(step.to, true); return; }
    if (step.action === "stop") { stopPolling(); player.pauseVideo(); player.seekTo(start, true); whenState("ended"); return; }
    if (verified && step.index !== lastLine) { lastLine = step.index; whenLine(step.index); }
  }
  function startPolling() { stopPolling(); timer = setInterval(watch, POLL_MS); }
  function stopPolling() { clearInterval(timer); timer = 0; }

  const api = {
    get ready() { return ready; }, get speed() { return speed; }, get loopLine() { return loopLine; }, get verified() { return verified; },
    play() { if (player) { if (time() >= end - 0.3) player.seekTo(start, true); player.playVideo(); } },
    pause() { if (player) player.pauseVideo(); },
    toggle() { if (!player) return; if (api.state() === "playing") api.pause(); else api.play(); },
    state() { return player && typeof player.getPlayerState === "function" && player.getPlayerState() === 1 ? "playing" : "paused"; },
    seekTo(seconds) { if (player) player.seekTo(Math.min(Math.max(seconds, start), end), true); },
    seekToLine(index, { play = false } = {}) { const line = lines[index]; if (!line || !player) return; player.seekTo(line.start, true); lastLine = -2; whenLine(index); if (play) player.playVideo(); },
    nextLine() { const i = nextLineIndex(lines, activeLineIndex(lines, time())); api.seekToLine(i, { play: true }); },
    previousLine() { api.seekToLine(previousTarget(lines, time()), { play: true }); },
    loop(index) { if (!verified) return false; loopLine = loopLine === index ? -1 : index; if (loopLine >= 0) api.seekToLine(loopLine, { play: true }); whenState(loopLine >= 0 ? "looping" : "playing"); return loopLine >= 0; },
    setSpeed(rate) { if (!SPEEDS.includes(rate)) return; speed = rate; if (player) player.setPlaybackRate(rate); },
    currentTime: time,
    destroy() { destroyed = true; stopPolling(); if (player && typeof player.destroy === "function") try { player.destroy(); } catch (error) { /* already gone */ } player = null; }
  };

  try {
    player = new YT.Player(target, {
      videoId: clip.source.videoId, host: EMBED_HOST,
      playerVars: { start: Math.floor(start), end: Math.ceil(end), rel: 0, playsinline: 1, autoplay: 0, modestbranding: 1, origin },
      events: {
        onReady: () => { ready = true; player.setPlaybackRate(speed); whenState("ready"); },
        onStateChange: event => { const playing = event.data === 1; if (playing) startPolling(); else if (event.data === 2 || event.data === 0) stopPolling(); whenState(playing ? "playing" : event.data === 0 ? "ended" : "paused"); },
        onError: event => { whenError({ code: event.data, message: ERROR_TEXT[event.data] || "The video could not be played." }); }
      }
    });
  } catch (error) { whenError({ code: 0, message: error.message }); }
  return api;
}
