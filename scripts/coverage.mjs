// Line coverage of the unit tests, from Node's built-in coverage (no extra dependency):  npm run coverage
// Prints the files under js/ and the average for the "logic modules" (everything except modules that mostly draw on the screen
// or talk to the browser, which the end-to-end scripts cover). Exits 1 if the logic average is under TARGET percent.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const TARGET = 80;
// Modules that mainly build DOM, canvas, audio or network calls: measured by the browser scripts, not by unit tests.
export const BROWSER_MODULES = Object.freeze([/^js\/games\/types\//, /^js\/games\/ui\.js$/, /^js\/games\/(settings|runtime|panels|lesson-layer|game-mode-card|mastery-card)\.js$/, /^js\/whiteboard\/(renderer|sync|images|export|app|board|dashboard-card|snapshot)\.js$/, /^js\/listening\/(audio|speaking|character|dictation)\.js$/, /^js\/reading-prefs\.js$/, /^js\/celebrate\.js$/, /^js\/student-context\.js$/, /^js\/(pages|clips\/(exercise-ui|dashboard-card)|manga\/(reader-ui|learning-ui|dashboard-card))/, /-ui\.js$/, /-card\.js$/, /^js\/(clock-ui|clock-controls|dashboard-clock|lesson-clock-ui|pwa|theme|charts|ui|storage|weekly-summary|placement-page|word-family-ui)\.js$/]);

export function parseCoverage(text) {
  const files = []; const stack = [];
  for (const line of text.split("\n")) {
    const match = /^ℹ (\s*)(\S[^|]*?)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|/.exec(line); if (!match) continue;
    const depth = match[1].length; const name = match[2].trim();
    if (match[3] === "") { stack[depth] = name; stack.length = depth + 1; continue; }
    files.push({ path: [...stack.slice(0, depth), name].join("/"), line: Number(match[3]), branch: Number(match[4]), funcs: Number(match[5]) });
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const unit = JSON.parse(readFileSync(root + "package.json", "utf8")).scripts["test:unit"].replace(/^node --test /, "").split(/\s+/);
  const run = spawnSync(process.execPath, ["--test", "--experimental-test-coverage", ...unit], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = parseCoverage(`${run.stdout}\n${run.stderr}`).filter(file => file.path.startsWith("js/"));
  if (!files.length) { console.error("No coverage report was produced."); process.exit(1); }
  const logic = files.filter(file => !BROWSER_MODULES.some(pattern => pattern.test(file.path)));
  const mean = list => list.reduce((sum, file) => sum + file.line, 0) / Math.max(1, list.length);
  const low = logic.filter(file => file.line < TARGET).sort((a, b) => a.line - b.line);
  console.log(`js/ files: ${files.length}, mean line coverage ${mean(files).toFixed(1)}%`);
  console.log(`logic modules: ${logic.length}, mean line coverage ${mean(logic).toFixed(1)}% (target ${TARGET}%)`);
  console.log(`browser-facing modules (covered by the end-to-end scripts): ${files.length - logic.length}, mean ${mean(files.filter(file => !logic.includes(file))).toFixed(1)}%`);
  if (low.length) { console.log(`logic modules under ${TARGET}%:`); for (const file of low) console.log(`  ${file.path.padEnd(40)} ${file.line.toFixed(1)}%`); }
  process.exit(run.status !== 0 || mean(logic) < TARGET ? 1 : 0);
}
