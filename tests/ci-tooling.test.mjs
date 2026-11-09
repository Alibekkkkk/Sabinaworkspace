import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SUITE } from "../scripts/run-e2e.mjs";
import { BROWSER_MODULES, TARGET, parseCoverage } from "../scripts/coverage.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const scripts = JSON.parse(read("package.json")).scripts;

test("the end-to-end runner lists every browser script, and every listed script exists", () => {
  const listed = new Set(SUITE.map(([, script]) => script));
  for (const [name, command] of Object.entries(scripts)) {
    if (!/^test:.*-e2e$/.test(name)) continue;
    const script = command.replace("node ", ""); assert.ok(listed.has(script), `${name} (${script}) is missing from the SUITE in scripts/run-e2e.mjs`);
  }
  for (const script of listed) assert.ok(existsSync(fileURLToPath(new URL(script, root))), `${script} exists`);
  assert.equal(scripts["test:e2e"], "node scripts/run-e2e.mjs");
});

test("every browser script pins the browser language, so the English text it checks is what it sees", () => {
  for (const [, script] of SUITE) assert.match(read(script), /--lang=en-US/, `${script} must launch the browser with --lang=en-US`);
});

test("the CI workflow runs the unit tests, generated-file checks, rules, coverage, the browser suite and the budgets", () => {
  const workflow = read(".github/workflows/ci.yml");
  for (const command of ["npm test", "npm run check:sw", "node scripts/build-preload.mjs --check", "npm run check:budgets", "npm run lint:content", "npm run check:clips", "npm run check:manga", "npm run coverage", "npm run test:rules", "scripts/run-e2e.mjs --serve", "npm run perf:budgets"]) assert.ok(workflow.includes(command), `ci.yml should run ${command}`);
  assert.match(workflow, /emulators:exec --only database,auth/); assert.match(workflow, /upload-artifact@v4/); assert.match(workflow, /if: failure\(\)/); assert.match(workflow, /java-version: 21/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/, "the workflow token is read-only");
});

test("the coverage report is parsed into file paths, and the logic and browser modules are told apart", () => {
  const report = ["ℹ file                            | line % | branch % | funcs % | uncovered lines", "ℹ js                              |        |          |         | ", "ℹ  audience.js                    | 100.00 |   100.00 |  100.00 | ", "ℹ  clips                          |        |          |         | ", "ℹ   catalog.js                    |  91.50 |    84.21 |  100.00 | ", "ℹ  games                          |        |          |         | ", "ℹ   types                         |        |          |         | ", "ℹ    pairs.js                     |  37.41 |    92.00 |   71.43 | 38-76", "ℹ scripts                         |        |          |         | ", "ℹ  run.mjs                        |  10.00 |    10.00 |   10.00 | "].join("\n");
  assert.deepEqual(parseCoverage(report).map(file => file.path), ["js/audience.js", "js/clips/catalog.js", "js/games/types/pairs.js", "scripts/run.mjs"]);
  assert.equal(parseCoverage(report)[1].line, 91.5);
  const browser = path => BROWSER_MODULES.some(pattern => pattern.test(path));
  assert.ok(browser("js/games/types/pairs.js") && browser("js/pages/lesson.js") && browser("js/whiteboard/renderer.js")); assert.ok(!browser("js/manga/learning.js") && !browser("js/games/rewards.js") && !browser("js/schedule.js"));
  assert.equal(TARGET, 80);
});
