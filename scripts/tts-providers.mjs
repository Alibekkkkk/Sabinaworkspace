// Request builders and helpers for scripts/generate-listening-audio.mjs. Pure functions (no network, no keys),
// so they can be tested. Nothing here reads the environment: the script passes the key in.
export const MAX_AUDIO_BYTES = 60 * 1024; // size budget per sentence
export const SLOW_RATE = 0.75;

export const escapeXml = text => String(text).replace(/[<>&'"]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]);

// SSML with a calm, clear British delivery. rate 1 = normal, 0.75 = slow.
export function buildSsml(text, voice, rate = 1) {
  const percent = Math.round((rate - 1) * 100);
  const prosody = `rate="${percent >= 0 ? "+" : ""}${percent}%"`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="${escapeXml(voice)}"><prosody ${prosody}>${escapeXml(text)}</prosody></voice></speak>`;
}

// Each builder returns { url, init } for fetch(); the response body is the mp3 (ElevenLabs/Azure) or base64 JSON (Google).
export function azureRequest({ text, voice, region, key, rate = 1 }) {
  if (!/^[a-z0-9-]{3,30}$/.test(region || "")) throw new Error("TTS_REGION must be an Azure region such as uksouth.");
  return {
    url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    init: {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "learning-studio-listening" },
      body: buildSsml(text, voice, rate)
    }
  };
}

export function googleRequest({ text, voice, key, rate = 1 }) {
  return {
    url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { text }, voice: { languageCode: "en-GB", name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: rate, sampleRateHertz: 24000 } })
    },
    base64Field: "audioContent"
  };
}

// ElevenLabs has no speaking-rate control, so the slow file is made by ffmpeg (see slowArgs).
export function elevenLabsRequest({ text, voice, key }) {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`,
    init: {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" })
    }
  };
}

export function buildRequest(provider, options) {
  if (provider === "azure") return azureRequest(options);
  if (provider === "google") return googleRequest(options);
  if (provider === "elevenlabs") return elevenLabsRequest(options);
  throw new Error(`Unknown TTS_PROVIDER "${provider}". Use azure, google or elevenlabs.`);
}

export const providerSupportsRate = provider => provider === "azure" || provider === "google";

// ffmpeg argument lists (the script runs ffmpeg only when it is installed).
export const loudnormArgs = (input, output) => ["-y", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1", "-b:a", "48k", output];
export const slowArgs = (input, output) => ["-y", "-i", input, "-af", `atempo=${SLOW_RATE}`, "-ar", "24000", "-ac", "1", "-b:a", "48k", output];

// Estimated word timings (no provider boundary data over REST): syllable heuristic scaled to the audio length.
// The script flags them with timingsEstimated: true so nothing pretends they are measured.
export function countSyllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
export function estimateWordTimings(text, durationSeconds) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const weights = tokens.map(token => countSyllables(token) + (/[.,!?;:]$/.test(token) ? 0.6 : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cursor = 0;
  return tokens.map((token, index) => {
    const span = (weights[index] / total) * durationSeconds;
    const timing = { i: index, start: Number(cursor.toFixed(3)), end: Number((cursor + span).toFixed(3)) };
    cursor += span;
    return timing;
  });
}

// mp3 length from its size and constant bitrate (kbit/s) when ffprobe is not available.
export const estimateDuration = (bytes, kbps = 48) => (bytes * 8) / (kbps * 1000);
export const withinBudget = bytes => bytes <= MAX_AUDIO_BYTES;
