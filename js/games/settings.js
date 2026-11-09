// Calm-play settings and the small shared services games use: sound, haptics and the confetti wrapper.
// Settings are per device (localStorage, optional): "reduce animation", "no timers" and "no sound".
import { confetti } from "../celebrate.js";

export const SETTINGS_KEY = "games.settings.v1";
export const DEFAULT_SETTINGS = Object.freeze({ calm: false, noTimers: false, muted: false, vibrate: true });

export function loadSettings(storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY));
    return normaliseSettings(saved);
  } catch (error) { return { ...DEFAULT_SETTINGS }; }
}

export function normaliseSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = typeof input[key] === "boolean" ? input[key] : DEFAULT_SETTINGS[key];
  return out;
}

export function saveSettings(settings, storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normaliseSettings(settings))); } catch (error) { /* not remembered */ }
}

// Timed modes become untimed when "no timers" is on. Returns the seconds to use, or 0 for no timer.
export function timerSeconds(settings, seconds) { return settings && settings.noTimers ? 0 : Math.max(0, Number(seconds) || 0); }

let audio = null;
const TONES = { good: [[660, 0.09], [880, 0.12]], bad: [[220, 0.16]], win: [[523, 0.1], [659, 0.1], [784, 0.18]], tick: [[440, 0.04]], hit: [[330, 0.08], [165, 0.1]] };

export function createServices(settings) {
  return {
    sound(name) {
      if (settings.muted || typeof window === "undefined") return;
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        audio = audio || new Context();
        let at = audio.currentTime;
        for (const [frequency, length] of TONES[name] || []) {
          const oscillator = audio.createOscillator(); const gain = audio.createGain();
          oscillator.frequency.value = frequency; oscillator.type = "sine"; gain.gain.value = 0.05;
          oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + length); at += length;
        }
      } catch (error) { /* sound is optional */ }
    },
    haptic(pattern = 25) { if (settings.vibrate && !settings.muted && typeof navigator !== "undefined" && navigator.vibrate) try { navigator.vibrate(pattern); } catch (error) { /* optional */ } },
    celebrate(size = "small") { if (settings.calm) return; confetti(size === "epic" ? 120 : size === "big" ? 70 : 24); }
  };
}

export function applyCalm(settings, root = (typeof document !== "undefined" ? document.documentElement : null)) {
  if (root) root.dataset.calm = String(Boolean(settings.calm));
}
