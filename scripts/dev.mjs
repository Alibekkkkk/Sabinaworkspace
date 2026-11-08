// Local development server. Run through `npm run dev`, which starts the Firebase emulators first
// and then this script. It serves the repository root and, ONLY for this local server, rewrites:
//   - every page's Content-Security-Policy so the browser may talk to the local emulators
//   - js/config.js so Firebase Auth and Realtime Database use the emulators
// Production files on disk are never changed.
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PORT = Number(process.env.PORT || 5050);
const DB = process.env.DB_EMULATOR_HOST || "127.0.0.1:9000";
const AUTH = process.env.AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };

function emulatorConfig(source) {
  const [dbHost, dbPort] = DB.split(":");
  return `${source}
// --- injected by scripts/dev.mjs (local development only) ---
if (typeof firebase !== "undefined" && !globalThis.__emulatorsConnected) {
  globalThis.__emulatorsConnected = true;
  const initializeApp = firebase.initializeApp.bind(firebase);
  firebase.initializeApp = (...args) => {
    const app = initializeApp(...args);
    app.auth().useEmulator("http://${AUTH}");
    app.database().useEmulator("${dbHost}", ${Number(dbPort)});
    return app;
  };
}
`;
}

function relaxCsp(html) {
  return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (match, start, policy, end) => {
    const add = directive => {
      const extra = { "connect-src": `http://${DB} ws://${DB} http://${AUTH}` }[directive];
      return extra ? policy.replace(new RegExp(`(${directive} [^;]*)`), `$1 ${extra}`) : policy;
    };
    return start + add("connect-src") + end;
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
  const file = resolve(join(root, requested));
  if (!file.startsWith(root + sep) || !existsSync(file) || /(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(requested)) {
    response.writeHead(404).end("Not found");
    return;
  }
  let body = readFileSync(file);
  const type = TYPES[extname(file)] || "application/octet-stream";
  if (extname(file) === ".html") body = relaxCsp(body.toString("utf8"));
  else if (requested.replace(/\\/g, "/") === "js/config.js") body = emulatorConfig(body.toString("utf8"));
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
});

await seedEmulator({ databaseHost: DB, authHost: AUTH });
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nLocal site:   http://127.0.0.1:${PORT}/portal.html`);
  console.log(`Teacher:      http://127.0.0.1:${PORT}/dashboard.html  (e-mail ${DEMO_TEACHER.email}; password in scripts/seed-emulator.mjs)`);
  console.log(`Students:     sign in on the portal with a code: ${DEMO_STUDENTS.map(student => student.code).join(", ")}`);
  console.log("Press Ctrl+C to stop the server and the emulators.\n");
});
