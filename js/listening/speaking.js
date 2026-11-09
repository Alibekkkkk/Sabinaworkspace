// Optional speaking (shadowing) layer on top of the browser's SpeechRecognition. Coaching only.
// Privacy: the browser may send the audio to its vendor to transcribe it, so nothing starts without a one-time,
// plain-language consent. Audio is never recorded or stored by this app; only the transcript text is compared on
// screen and it is not saved.
const CONSENT_KEY = "listening.speakingConsent.v1";

export function recognitionClass() {
  return typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
export const speakingSupported = () => Boolean(recognitionClass());

export function hasConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === "yes"; } catch (error) { return false; }
}
export function giveConsent() {
  try { localStorage.setItem(CONSENT_KEY, "yes"); } catch (error) { /* consent then lasts for this visit only */ }
}
export function revokeConsent() {
  try { localStorage.removeItem(CONSENT_KEY); } catch (error) { /* nothing stored */ }
}

export const CONSENT_TEXT = [
  "To check your speaking, your browser listens through the microphone and turns your voice into text.",
  "Your browser's company (for example Google or Apple) may process that audio on its servers to do this.",
  "This app does not record or save your voice. The words it hears are shown on this screen and are not stored.",
  "You can always choose \"Type instead\"."
];

// Listens once. Resolves with the final transcript; whenInterim receives the live text. Rejects with a readable message.
export function listenOnce({ lang = "en-GB", whenInterim = () => {}, timeoutMs = 12000 } = {}) {
  const Recognition = recognitionClass();
  return new Promise((resolve, reject) => {
    if (!Recognition) { reject(new Error("Speaking practice is not available in this browser. Type instead.")); return; }
    const recognition = new Recognition();
    recognition.lang = lang; recognition.interimResults = true; recognition.maxAlternatives = 1; recognition.continuous = false;
    let finalText = ""; let settled = false;
    const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); try { recognition.stop(); } catch (e) { /* already stopped */ } if (error) reject(error); else resolve(finalText.trim()); };
    const timer = setTimeout(() => finish(), timeoutMs);
    recognition.onresult = event => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const piece = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += `${piece} `; else interim += piece;
      }
      whenInterim(`${finalText}${interim}`.trim());
    };
    recognition.onerror = event => {
      const reasons = { "not-allowed": "The microphone is blocked. Allow it in your browser, or type instead.", "service-not-allowed": "Speech recognition is blocked on this device. Type instead.", "no-speech": "I could not hear anything. Try again, closer to the microphone.", "audio-capture": "No microphone was found. Type instead.", network: "Speech recognition needs an internet connection. Type instead." };
      finish(new Error(reasons[event.error] || "Speech recognition stopped. Type instead."));
    };
    recognition.onend = () => finish();
    try { recognition.start(); } catch (error) { finish(new Error("Speech recognition could not start. Type instead.")); }
  });
}
