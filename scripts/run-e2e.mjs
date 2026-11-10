// Runs every browser end-to-end script one after another and prints one summary:  npm run dev   then   npm run test:e2e
//   npm run test:e2e                     all of them
//   npm run test:e2e -- manga offline    only the ones whose name contains one of the words
//   node scripts/run-e2e.mjs --serve     start the demo site itself (for CI: run it inside `firebase emulators:exec`)
// The scripts use puppeteer-core with a locally installed Chrome or Edge (set CHROME_PATH to choose one). A failed script does not
// stop the rest. Exit code 1 if any script failed or the site is not reachable.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const SITE = process.env.SITE || "http://127.0.0.1:5050/";
const SCRIPT_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 8 * 60 * 1000);

// One entry per user journey the acceptance review needs (see docs/ACCEPTANCE.md).
export const SUITE = Object.freeze([
  ["sign in with a code, lesson clock start/pause/stop/adjust, dashboard commands, summary total", "scripts/clock-e2e.mjs"],
  ["lesson sections: order, grammar topics, games and listening inside the lesson, teacher preview, dashboard frame", "scripts/lesson-sections-e2e.mjs"],
  ["grammar ladder, word families, reading questions", "scripts/ladder-e2e.mjs"],
  ["word family helper", "scripts/word-family-e2e.mjs"],
  ["reading questions", "scripts/reading-tasks-e2e.mjs"],
  ["listening trainer round", "scripts/listening-e2e.mjs"],
  ["dashboard listening card", "scripts/dashboard-listening-e2e.mjs"],
  ["listening from a recording: link, transcript, sentences, save, student hears the recording", "scripts/listening-recording-e2e.mjs"],
  ["whiteboard draw, persist, modes", "scripts/whiteboard-e2e.mjs"],
  ["whiteboard on phones and tablets", "scripts/whiteboard-devices-e2e.mjs"],
  ["games and rewards", "scripts/games-e2e.mjs"],
  ["games by keyboard only", "scripts/games-keyboard-e2e.mjs"],
  ["lesson stages and game mode", "scripts/lesson-games-e2e.mjs"],
  ["clip page", "scripts/clips-e2e.mjs"],
  ["clips tab, filters, due dates, teacher card", "scripts/clips-tab-e2e.mjs"],
  ["manga: Gaziz only, three modes, learning loop, teacher card", "scripts/manga-e2e.mjs"],
  ["offline reload and the service worker", "scripts/offline-e2e.mjs"],
  ["privacy export and delete", "scripts/privacy-e2e.mjs"],
  ["languages, error boundary, blocked storage, two tabs, clock skew", "scripts/robustness-e2e.mjs"]
].filter((entry, index, all) => all.findIndex(other => other[1] === entry[1]) === index));

async function reachable() { try { return (await fetch(`${SITE}portal.html`)).ok; } catch (error) { return false; } }
const run = (script, extra = {}) => new Promise(resolve => {
  const started = Date.now(); const child = spawn(process.execPath, [script], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...extra } });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  // A script that hangs must not hold the whole suite: stop it after SCRIPT_TIMEOUT_MS and count it as failed.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; output += " FAILED: timed out "; child.kill(); }, SCRIPT_TIMEOUT_MS);
  child.on("close", code => { clearTimeout(timer); resolve({ code: timedOut ? 1 : code, seconds: Math.round((Date.now() - started) / 1000), output }); });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const words = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
  let server = null;
  if (process.argv.includes("--serve")) {
    server = spawn(process.execPath, ["scripts/dev.mjs"], { cwd: root, stdio: "ignore" });
    for (let i = 0; i < 60 && !(await reachable()); i += 1) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!(await reachable())) { console.error(`The demo site is not reachable at ${SITE}. Start it first with: npm run dev`); server && server.kill(); process.exit(1); }
  const chosen = SUITE.filter(([name, script]) => !words.length || words.some(word => `${name} ${script}`.includes(word)));
  const results = [];
  for (const [name, script] of chosen) {
    process.stdout.write(`${name} ... `); const result = await run(script); results.push({ name, script, ...result });
    console.log(`${result.code === 0 ? "passed" : "FAILED"} (${result.seconds} s)`);
    if (result.code !== 0) console.log(result.output.split("\n").filter(line => /FAIL|Error|failed/.test(line)).slice(0, 8).map(line => `    ${line}`).join("\n"));
  }
  server && server.kill();
  const failed = results.filter(result => result.code !== 0);
  console.log(`\n${results.length - failed.length} of ${results.length} end-to-end scripts passed.${failed.length ? ` Failed: ${failed.map(result => result.script).join(", ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}
