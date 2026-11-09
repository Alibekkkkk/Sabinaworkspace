// Teacher dashboard card "Listening practice": rounds, accuracy, accuracy trend, the words missed most often and
// the sentences that still need work. DOM APIs and textContent only.
import { sparkline } from "./charts.js";
import { summarizeListening, TREND_TEXT, WEAK_BELOW } from "./listening-summary.js";

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

let textsPromise = null;
// Sentence text for ids, read from the public listening packs named in content/manifest.json. Cached; failures give an empty map.
export function loadListeningTexts(base = "") {
  if (!textsPromise) {
    textsPromise = (async () => {
      const texts = new Map();
      try {
        const manifest = await (await fetch(`${base}content/manifest.json`)).json();
        const files = [...new Set(Object.values(manifest).map(entry => entry && entry.listeningFile).filter(Boolean))];
        for (const file of files) {
          const pack = await (await fetch(`${base}content/${file}`)).json();
          for (const item of pack.items || []) texts.set(item.id, item.text);
        }
      } catch (error) { /* the card still works with ids only */ }
      return texts;
    })();
  }
  return textsPromise;
}

export function renderListeningCard(host, progress, texts = new Map()) {
  const summary = summarizeListening(progress, texts);
  host.replaceChildren();
  if (!summary.rounds && !summary.weakWords.length && !summary.sentencesPracticed) {
    host.append(el("p", "No listening practice yet. It appears here after the student finishes a round in the Listening trainer."));
    return summary;
  }
  const line = el("p", `${summary.rounds} round${summary.rounds === 1 ? "" : "s"} · ${Math.round(summary.accuracy * 100)}% of words correct · ${summary.minutes} min` +
    `${summary.lastAt ? ` · last ${new Date(summary.lastAt).toLocaleDateString()}` : ""}. ${summary.sentencesPracticed} sentence${summary.sentencesPracticed === 1 ? "" : "s"} practised, ${summary.sentencesMastered} at 90% or better.`);
  host.append(line);

  if (summary.trend.values.length) {
    host.append(el("h3", `Accuracy by round: ${summary.trend.values.length >= 4 ? TREND_TEXT[summary.trend.direction] : "not enough rounds for a trend yet"}`));
    host.append(sparkline(summary.trend.values, { title: `Listening accuracy over the last ${summary.trend.values.length} rounds, oldest to newest. ${summary.trend.values.map(value => `${Math.round(value * 100)}%`).join(", ")}.` }));
  }

  host.append(el("h3", "Words missed most often"));
  if (!summary.weakWords.length) host.append(el("p", "No missed words in the review queue."));
  else {
    const list = el("ul", undefined, "listening-weak-words");
    for (const entry of summary.weakWords) {
      const item = el("li", `${entry.word} · missed ${entry.count} time${entry.count === 1 ? "" : "s"}`);
      if (entry.example) item.append(el("small", ` · “${entry.example}”`));
      list.append(item);
    }
    host.append(list);
  }

  host.append(el("h3", `Sentences still below ${Math.round(WEAK_BELOW * 100)}%`));
  if (!summary.weakSentences.length) host.append(el("p", "None: every practised sentence has reached 70% or better."));
  else {
    const list = el("ul", undefined, "listening-weak-sentences");
    for (const entry of summary.weakSentences) {
      const item = el("li", `${entry.text || entry.id} · best ${Math.round(entry.bestAccuracy * 100)}% · ${entry.attempts} attempt${entry.attempts === 1 ? "" : "s"}`);
      list.append(item);
    }
    host.append(list);
  }
  return summary;
}
