// Validates every listening pack in content/listening (schema, gap indices, audio files exist).   npm run lint:listening
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateListeningPack } from "../js/listening/schema.js";

const content = fileURLToPath(new URL("../content/", import.meta.url));
export function lintListening(directory = join(content, "listening")) {
  return readdirSync(directory).filter(file => file.endsWith(".json")).map(file => {
    let errors;
    try { errors = validateListeningPack(JSON.parse(readFileSync(join(directory, file), "utf8")), { fileExists: path => existsSync(join(content, path)) }); }
    catch (error) { errors = [`not valid JSON: ${error.message}`]; }
    return { file, errors };
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = lintListening();
  for (const result of results) { console.log(`${result.errors.length ? "FAIL" : "ok  "} ${result.file}`); for (const message of result.errors) console.log(`   error: ${message}`); }
  process.exit(results.some(result => result.errors.length) ? 1 : 0);
}
