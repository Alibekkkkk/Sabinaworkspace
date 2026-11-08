import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = path => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("dashboard sends only versioned commands stamped with the server clock", () => {
  const dashboard = read("js/pages/dashboard.js");
  assert.doesNotMatch(dashboard, /['"]\/command['"]/, "legacy single command node must not be written");
  assert.match(dashboard, /createdAt: firebase\.database\.ServerValue\.TIMESTAMP/);
  for (const type of ["resetStage", "goto", "resetVocab", "resetAll"]) {
    assert.ok(dashboard.includes(`'${type}'`), `dashboard should send ${type}`);
  }
});

test("lesson page applies each command once, acknowledges it, and judges age on the server clock", () => {
  const lesson = read("js/pages/lesson.js");
  assert.doesNotMatch(lesson, /child\('command'\)/, "legacy single command node must not be read");
  assert.doesNotMatch(lesson, /Date\.now\(\)\s*-\s*10000/, "client-clock freshness check must be gone");
  assert.match(lesson, /\.info\/serverTimeOffset/);
  assert.match(lesson, /child\('ack'\)\.set\(true\)/);
  assert.match(lesson, /cmd\.ack===true/);
});

test("dashboard subscribes to the compact sessionSummary, never to the whole sessions tree", () => {
  const dashboard = read("js/pages/dashboard.js");
  assert.doesNotMatch(dashboard, /fbDb\.ref\('sessions'\)/, "must not download every student's full session");
  assert.match(dashboard, /fbDb\.ref\('sessionSummary'\)\.on\('value'/);
  assert.match(dashboard, /'sessions\/' \+ code \+ '\/state\/notes'/, "notes load on demand for the selected student");
  assert.match(read("js/pages/lesson.js"), /sessionSummary\/'\+studentContext\.code/, "lesson page maintains the summary");
  assert.match(read("js/pages/homework.js"), /sessionSummary\/' \+ studentContext\.code/, "homework page maintains the summary");
});
