// Checks every clip's video against YouTube's oEmbed endpoint:  node scripts/check-clips.mjs [--write]
// For each clip it asks whether the video exists and may be embedded (YouTube answers 200 for embeddable videos, 401 or 404
// otherwise), and compares the real channel and title with what the clip file says. It cannot watch the video, so it never
// marks line timing as verified; that is the teacher's check in the authoring tool.
// No network? Every clip is reported as "unverified" (never as fine). With --write the result is saved to docs/clip-check.json.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const folder = new URL("../content/clips/", import.meta.url);
const normal = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const similar = (a, b) => { const x = normal(a); const y = normal(b); return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x)); };

export async function checkClip(clip, fetchImpl = fetch, now = new Date()) {
  const base = { id: clip.id, videoId: clip.source.videoId, checkedAt: now.toISOString().slice(0, 10) };
  if (clip.source.provider !== "youtube") return { ...base, status: "link-only", note: "Not embedded; the link was not checked." };
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(clip.source.sourceUrl)}`;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) return { ...base, status: "fail", http: response.status, note: response.status === 401 ? "The owner has disabled embedding." : response.status === 404 ? "The video does not exist or is private." : `Unexpected answer ${response.status}.` };
    const data = await response.json();
    return { ...base, status: "ok", http: 200, oembedTitle: data.title, oembedChannel: data.author_name, channelMatches: similar(data.author_name, clip.source.channel), titleMatches: similar(data.title, clip.source.videoTitle) };
  } catch (error) {
    return { ...base, status: "unverified", note: `No answer from YouTube (${error.message}). Check again with network access.` };
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:")}` || process.argv[1].endsWith("check-clips.mjs")) {
  const results = [];
  for (const file of readdirSync(folder).filter(name => name.endsWith(".json"))) {
    const clip = JSON.parse(readFileSync(new URL(file, folder), "utf8"));
    const result = await checkClip(clip);
    results.push(result);
    const flags = [result.status, result.channelMatches === false ? "CHANNEL DIFFERS" : "", result.titleMatches === false ? "TITLE DIFFERS" : "", result.note || ""].filter(Boolean).join(" · ");
    console.log(`${clip.id.padEnd(34)} ${clip.source.videoId}  ${flags}`);
  }
  if (process.argv.includes("--write")) { writeFileSync(new URL("../docs/clip-check.json", import.meta.url), `${JSON.stringify(results, null, 2)}\n`); console.log("Saved docs/clip-check.json"); }
  const bad = results.filter(result => result.status === "fail" || result.channelMatches === false || result.titleMatches === false);
  if (bad.length) { console.log(`${bad.length} clip(s) need attention.`); process.exitCode = 1; }
  else if (results.some(result => result.status === "unverified")) console.log("Some clips could not be checked (no network). They stay marked unverified.");
}
