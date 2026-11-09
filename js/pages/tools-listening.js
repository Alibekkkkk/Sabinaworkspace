// Listening pack helper on tools/import-content.html: paste sentences, pick gaps automatically (content words first,
// lesson target words before the rest), preview them, then copy the finished JSON into content/listening/<pack>.json.
// Nothing is uploaded; audio comes later from scripts/generate-listening-audio.mjs.
import { draftItemsFromSentences, tokenize, validateListeningPack } from "../listening/schema.js";

const $ = id => document.getElementById(id);
const preview = $("listeningPreview");
const output = $("listeningOutput");
const status = $("listeningStatus");

function slug(text) { return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }

function previewItem(item) {
  const row = document.createElement("li");
  const words = tokenize(item.text);
  const sentence = document.createElement("span");
  words.forEach((word, index) => {
    const part = document.createElement("span");
    part.textContent = `${word} `;
    if (item.gaps.medium.includes(index)) part.className = "listening-gap-medium";
    if (item.gaps.easy.includes(index)) part.className = "listening-gap-easy";
    sentence.append(part);
  });
  if (!sentence.childNodes.length) sentence.textContent = item.text;
  const note = document.createElement("small");
  note.textContent = ` Easy hides: ${item.gaps.easy.map(index => words[index]).join(", ")} · Medium hides ${item.gaps.medium.length} words`;
  row.append(sentence, note);
  return row;
}

$("listeningBuild").addEventListener("click", () => {
  const sentences = $("listeningSentences").value.split(/\r?\n/);
  const targets = $("listeningTargets").value.split(/[,\n]/).map(entry => entry.trim().toLowerCase()).filter(Boolean);
  const title = $("listeningTitle").value.trim() || "Listening pack";
  const level = $("listeningLevel").value;
  const character = $("listeningCharacter").value;
  const id = slug($("listeningId").value || title) || "listening-pack";
  const items = draftItemsFromSentences(sentences, { prefix: id.slice(0, 20), targets, credits: "original sentence written for this lesson" });
  const pack = { schemaVersion: 1, id, title, level, status: "draft", voice: { id: character === "arthur" ? "en-GB-RyanNeural" : "en-GB-SoniaNeural", provider: "browser", character }, items };
  const problems = validateListeningPack(pack);
  preview.replaceChildren(...items.map(previewItem));
  output.value = JSON.stringify(pack, null, 2);
  status.textContent = problems.length
    ? `Fix before use: ${problems.slice(0, 4).join(" ")}`
    : `${items.length} sentences, all valid. Check the gaps, add translations if you like, save as content/listening/${id}.json, then run npm run lint:listening. The pack stays a draft until you set status to "approved".`;
});
