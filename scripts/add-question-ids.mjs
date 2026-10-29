import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDirectory = join(root, "content");
const questionArrays = new Set([
  "readingQ",
  "contextQ",
  "testMcq",
  "testShort",
  "testTfng",
  "testComplete",
  "questions"
]);
const nestedQuestionGroups = new Set(["g6", "g7", "g10", "sbPp", "sbPs"]);

function parseWithOffsets(source) {
  let index = 0;

  function skipWhitespace() {
    while (/\s/.test(source[index] || "")) index += 1;
  }

  function parseString() {
    const start = index++;
    while (index < source.length) {
      if (source[index] === "\\") index += 2;
      else if (source[index++] === '"') break;
    }
    return { type: "string", start, end: index, value: JSON.parse(source.slice(start, index)) };
  }

  function parseValue() {
    skipWhitespace();
    const start = index;
    if (source[index] === "{") {
      index += 1;
      const properties = new Map();
      skipWhitespace();
      while (source[index] !== "}") {
        const key = parseString().value;
        skipWhitespace();
        index += 1;
        const value = parseValue();
        properties.set(key, value);
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
        } else break;
      }
      index += 1;
      return { type: "object", start, end: index, properties };
    }
    if (source[index] === "[") {
      index += 1;
      const items = [];
      skipWhitespace();
      while (source[index] !== "]") {
        items.push(parseValue());
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
        } else break;
      }
      index += 1;
      return { type: "array", start, end: index, items };
    }
    if (source[index] === '"') return parseString();
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    return { type: "primitive", start, end: index };
  }

  return parseValue();
}

function addIdsToSource(source, fileName) {
  const tree = parseWithOffsets(source);
  const lessonId = basename(fileName, ".json");
  const insertions = [];
  const collectionNodes = [];

  for (const [key, node] of tree.properties) {
    if (questionArrays.has(key) && node.type === "array") {
      collectionNodes.push([key, node]);
    } else if (nestedQuestionGroups.has(key) && node.type === "object") {
      for (const [group, items] of node.properties) {
        if (items.type === "array") collectionNodes.push([`${key}.${group}`, items]);
      }
    }
  }

  for (const [collection, array] of collectionNodes) {
    array.items.forEach((item, index) => {
      if (item.type !== "object" || item.properties.has("id")) return;
      const lineStart = source.lastIndexOf("\n", item.start - 1) + 1;
      const openingIndent = source.slice(lineStart, item.start).match(/^\s*/)[0];
      const afterBrace = source[item.start + 1];
      const newline = afterBrace === "\r" ? "\r\n" : "\n";
      const id = `${lessonId}.${collection}.${String(index + 1).padStart(3, "0")}`;
      const insertion = afterBrace === "\n" || afterBrace === "\r"
        ? `${newline}${openingIndent}  "id": ${JSON.stringify(id)},`
        : ` "id": ${JSON.stringify(id)},`;
      insertions.push({ offset: item.start + 1, value: insertion });
    });
  }

  let result = source;
  insertions.sort((a, b) => b.offset - a.offset).forEach(({ offset, value }) => {
    result = result.slice(0, offset) + value + result.slice(offset);
  });
  return result;
}

for (const name of (await readdir(contentDirectory)).filter(file => file.endsWith(".json"))) {
  const path = join(contentDirectory, name);
  const source = await readFile(path, "utf8");
  const result = addIdsToSource(source, name);
  if (result !== source) await writeFile(path, result, "utf8");
}
