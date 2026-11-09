// Generates normal and slow (0.75x) British neural-voice audio for a listening pack.
//   TTS_PROVIDER=azure TTS_KEY=... TTS_REGION=uksouth node scripts/generate-listening-audio.mjs content/listening/sabina.json
//   (google: TTS_PROVIDER=google TTS_KEY=...   elevenlabs: TTS_PROVIDER=elevenlabs TTS_KEY=... TTS_VOICE=<voice id>)
// The key is read from the environment only. Never put it in a file in the repository.
// Without a key the script stops with exit code 2 and writes nothing: audio is never faked. The page then plays the
// clearly labelled device voice instead.
// Output goes to content/audio/<item-id>.mp3 and <item-id>-slow.mp3; the pack is updated with audio paths,
// estimated word timings (flagged) and the provider in `audioCredits`. ffmpeg, when installed, normalises loudness.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRequest, estimateDuration, estimateWordTimings, loudnormArgs, MAX_AUDIO_BYTES, providerSupportsRate, SLOW_RATE, slowArgs, withinBudget } from "./tts-providers.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_VOICES = { azure: { nora: "en-GB-SoniaNeural", arthur: "en-GB-RyanNeural" }, google: { nora: "en-GB-Neural2-A", arthur: "en-GB-Neural2-B" } };
const TERMS = {
  azure: "Audio generated with Azure AI Speech neural voices; check your Azure terms before redistributing outside this site.",
  google: "Audio generated with Google Cloud Text-to-Speech; check the Google Cloud terms before redistributing outside this site.",
  elevenlabs: "Audio generated with ElevenLabs; the licence depends on your ElevenLabs plan, check it before redistributing."
};

const packPath = process.argv[2] ? resolve(process.argv[2]) : "";
const provider = (process.env.TTS_PROVIDER || "").toLowerCase();
const key = process.env.TTS_KEY || "";
if (!packPath || !existsSync(packPath)) { console.error("Usage: node scripts/generate-listening-audio.mjs content/listening/<pack>.json"); process.exit(1); }
if (!provider || !key) {
  console.error("NEEDS KEY: set TTS_PROVIDER (azure, google or elevenlabs) and TTS_KEY in your environment, then run again.");
  console.error("Nothing was written. Until then the trainer uses the device voice and says so on screen.");
  process.exit(2);
}

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error;
if (!hasFfmpeg) console.warn("ffmpeg not found: loudness is not normalised and the ElevenLabs slow version cannot be made.");

const pack = JSON.parse(readFileSync(packPath, "utf8"));
const character = pack.voice && pack.voice.character === "arthur" ? "arthur" : "nora";
const voice = process.env.TTS_VOICE || (DEFAULT_VOICES[provider] && DEFAULT_VOICES[provider][character]) || pack.voice.id;
const audioDir = join(root, "content", "audio");
mkdirSync(audioDir, { recursive: true });

async function synthesize(text, rate) {
  const request = buildRequest(provider, { text, voice, region: process.env.TTS_REGION, key, rate });
  const response = await fetch(request.url, request.init);
  if (!response.ok) throw new Error(`${provider} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  if (request.base64Field) return Buffer.from((await response.json())[request.base64Field], "base64");
  return Buffer.from(await response.arrayBuffer());
}
function ffmpeg(args) { const result = spawnSync("ffmpeg", args, { stdio: "ignore" }); if (result.status !== 0) throw new Error("ffmpeg failed"); }
function finish(buffer, target, { slowFrom } = {}) {
  const raw = `${target}.raw.mp3`;
  writeFileSync(raw, buffer);
  if (slowFrom && hasFfmpeg) ffmpeg(slowArgs(raw, `${target}.tmp.mp3`));
  else if (hasFfmpeg) ffmpeg(loudnormArgs(raw, `${target}.tmp.mp3`));
  else writeFileSync(`${target}.tmp.mp3`, buffer);
  renameSync(`${target}.tmp.mp3`, target);
  unlinkSync(raw);
  return statSync(target).size;
}

let written = 0;
for (const item of pack.items) {
  const normalPath = join(audioDir, `${item.id}.mp3`);
  const slowPath = join(audioDir, `${item.id}-slow.mp3`);
  const normalBytes = finish(await synthesize(item.text, 1), normalPath);
  let slowBytes = 0;
  if (providerSupportsRate(provider)) slowBytes = finish(await synthesize(item.text, SLOW_RATE), slowPath);
  else if (hasFfmpeg) slowBytes = finish(readFileSync(normalPath), slowPath, { slowFrom: normalPath });
  item.audio = { normal: `audio/${item.id}.mp3`, ...(slowBytes ? { slow: `audio/${item.id}-slow.mp3` } : {}) };
  item.wordTimings = estimateWordTimings(item.text, estimateDuration(normalBytes));
  item.timingsEstimated = true;
  for (const [label, bytes] of [["normal", normalBytes], ["slow", slowBytes]]) if (bytes && !withinBudget(bytes)) console.warn(`${item.id} ${label}: ${bytes} bytes is over the ${MAX_AUDIO_BYTES} byte budget.`);
  written += 1;
  console.log(`${item.id}: ${normalBytes} bytes${slowBytes ? `, slow ${slowBytes} bytes` : ", no slow version"}`);
}
pack.voice = { ...pack.voice, id: voice, provider };
pack.audioCredits = TERMS[provider];
writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`Done: ${written} sentence(s). Review ${packPath}, then run npm run lint:listening and commit the audio files.`);
