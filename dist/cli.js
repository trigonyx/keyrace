#!/usr/bin/env node

// src/cli.tsx
import fs10 from "fs";
import { render } from "ink";
import { spawn as spawn2 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import path3 from "path";

// ../termcore/src/app/paths.ts
import crypto from "crypto";
import os2 from "os";
import path2 from "path";

// ../termcore/src/app/suite.ts
import os from "os";
import path from "path";
var SUITE = {
  termchat: { name: "termchat", tcpPort: 5050, udpPort: 5051, envPrefix: "TERMCHAT" },
  keyrace: { name: "keyrace", tcpPort: 5052, udpPort: 5053, envPrefix: "KEYRACE" },
  termdrop: { name: "termdrop", tcpPort: 5054, udpPort: 5055, envPrefix: "TERMDROP" },
  termhub: { name: "termhub", tcpPort: 5056, udpPort: 5057, envPrefix: "TERMHUB" }
};
var LEGACY_APPS = ["termchat", "keyrace", "termdrop"];
var isSuiteApp = (v) => typeof v === "string" && Object.hasOwn(SUITE, v);
function defineApp(name, pkg, protocol = `${name}/1`) {
  const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? `OWNER/${name}`;
  return { ...SUITE[name], protocol, version: pkg.version, repo };
}
function resolveHomes(app, home, env = process.env) {
  const hubOverride = home ?? env.TERMHUB_HOME;
  const hub = path.resolve(hubOverride ?? path.join(os.homedir(), ".termhub"));
  const appOverride = home ? void 0 : env[`${SUITE[app].envPrefix}_HOME`];
  const appDir2 = path.resolve(appOverride ?? (hubOverride ? path.join(hub, app) : path.join(os.homedir(), `.${app}`)));
  return { hub, app: app === "termhub" ? hub : appDir2 };
}
function legacyDirs(home, env = process.env) {
  return Object.fromEntries(LEGACY_APPS.map((a) => [a, resolveHomes(a, home, env).app]));
}

// ../termcore/src/app/paths.ts
function hubPaths(dir, legacy) {
  return {
    dir,
    identity: path2.join(dir, "identity.json"),
    profile: path2.join(dir, "profile.json"),
    friends: path2.join(dir, "friends.json"),
    peers: path2.join(dir, "peers.json"),
    settings: path2.join(dir, "settings.json"),
    links: path2.join(dir, "links.json"),
    migration: path2.join(dir, "migration.json"),
    runDir: path2.join(dir, "run"),
    legacyDir: path2.join(dir, "legacy"),
    locksDir: path2.join(dir, ".locks"),
    legacy
  };
}
var MAX_SOCKET_PATH = 100;
function socketPath(root, app, platform = process.platform) {
  const tag = crypto.createHash("sha256").update(root).digest("hex").slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\${app}-${tag}`;
  const inHome = path2.join(root, `${app}.sock`);
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path2.join(os2.tmpdir(), `${app}-${tag}.sock`);
}
function basePaths(app, home, env = process.env) {
  const homes = resolveHomes(app, home, env);
  return {
    home: homes.app,
    hub: hubPaths(homes.hub, legacyDirs(home, env)),
    config: path2.join(homes.app, "config.json"),
    log: path2.join(homes.app, `${app}.log`),
    lock: path2.join(homes.app, `${app}.lock`),
    socket: socketPath(homes.app, app)
  };
}

// src/core/paths.ts
function resolvePaths(home, env = process.env) {
  const base = basePaths("keyrace", home, env);
  return { ...base, results: path3.join(base.home, "results.jsonl") };
}

// ../termcore/src/app/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os3 from "os";
import path4 from "path";

// ../termcore/src/app/version.ts
var repoConfigured = (app) => !app.repo.startsWith("OWNER/");
var installSpec = (app) => `https://github.com/${app.repo}/tarball/main`;
var installCmd = (app) => `npm i -g ${installSpec(app)}`;

// ../termcore/src/app/update.ts
function npmCommand(env = process.env) {
  if (env.TERMHUB_NPM) return { cmd: env.TERMHUB_NPM, shell: false };
  const win = process.platform === "win32";
  return { cmd: win ? "npm.cmd" : "npm", shell: win };
}
function runNpm(args, opts = {}) {
  return new Promise((resolve) => {
    const { cmd, shell } = npmCommand();
    let output = "";
    const take = (d) => {
      const s = String(d);
      output += s;
      opts.onOutput?.(s);
    };
    try {
      const p = spawn(cmd, args, { stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"], shell });
      p.stdout?.on("data", take);
      p.stderr?.on("data", take);
      p.on("error", (err) => resolve({ ok: false, output: `${output}
${err.message}` }));
      p.on("close", (code) => resolve({ ok: code === 0, output }));
    } catch (err) {
      resolve({ ok: false, output: err.message });
    }
  });
}
var VERSION_RE = /^\d+\.\d+\.\d+$/;
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path4.resolve(p);
  }
};
var isRoot = () => process.getuid?.() === 0;
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;
function createUpdater(app) {
  const { name, envPrefix: P } = app;
  const env = (key) => process.env[`${P}_${key}`];
  const VERSION2 = app.version;
  const INSTALL_SPEC2 = installSpec(app);
  const INSTALL_CMD2 = installCmd(app);
  const REPO_CONFIGURED2 = repoConfigured(app);
  const latestUrl2 = () => env("UPDATE_URL") || `https://raw.githubusercontent.com/${app.repo}/main/package.json`;
  async function fetchLatestVersion2(fetchImpl = fetch, timeoutMs = 5e3) {
    if (!REPO_CONFIGURED2 && !env("UPDATE_URL")) return null;
    try {
      const res = await fetchImpl(latestUrl2(), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      const version = (await res.json())?.version;
      return typeof version === "string" && VERSION_RE.test(version) ? version : null;
    } catch {
      return null;
    }
  }
  async function checkForUpdate2(fetchImpl) {
    if (env("NO_UPDATE_CHECK") === "1") return null;
    const latest = await fetchLatestVersion2(fetchImpl);
    return latest && compareVersions(latest, VERSION2) > 0 ? latest : null;
  }
  function installKind2(script = process.argv[1] ?? "") {
    let real = script;
    try {
      real = fs.realpathSync(script);
    } catch {
    }
    return real.split(path4.sep).join("/").includes(`/node_modules/${name}/`) ? "npm" : "source";
  }
  const SOURCE_HINT2 = `This ${name} runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD2}\`.`;
  const releaseSpec2 = (version) => `https://github.com/${app.repo}/tarball/v${version}`;
  const appDir2 = () => env("APP_DIR") || path4.join(os3.homedir(), `.${name}`, "app");
  const specFor = (version) => env("INSTALL_SPEC") || (version ? releaseSpec2(version) : INSTALL_SPEC2);
  function localInstall2(dir = appDir2()) {
    const root = path4.join(dir, "node_modules", name);
    try {
      const pkg = JSON.parse(fs.readFileSync(path4.join(root, "package.json"), "utf8"));
      const cli = path4.join(root, "dist", "cli.js");
      if (pkg?.name !== name || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
      return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
    } catch {
      return null;
    }
  }
  function newerLocalInstall2(self, ownVersion = VERSION2) {
    const local = localInstall2();
    if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
    return realpath(local.cli) === realpath(self) ? null : local;
  }
  function installedInto(script) {
    let dir = path4.dirname(realpath(script));
    while (path4.dirname(dir) !== dir) {
      if (path4.basename(dir) === name && path4.basename(path4.dirname(dir)) === "node_modules") return path4.dirname(dir);
      dir = path4.dirname(dir);
    }
    return null;
  }
  function installTarget2(script = process.argv[1] ?? "", root = isRoot()) {
    const modules = installedInto(script);
    if (!modules) return "global";
    if (realpath(modules).startsWith(realpath(appDir2()) + path4.sep)) return "local";
    if (root) return "global";
    try {
      fs.accessSync(modules, fs.constants.W_OK);
      return "global";
    } catch {
      return "local";
    }
  }
  function npmInstall(spec, inherit, target, onOutput) {
    const dir = appDir2();
    const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
      // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
      ["install", "--prefix", dir, "--cache", path4.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
    );
    try {
      if (target === "local") fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      return Promise.resolve({ ok: false, output: err.message });
    }
    return runNpm(args, { inherit, onOutput });
  }
  async function runInstall2({
    inherit,
    version,
    target: forced,
    onOutput
  }) {
    if (!REPO_CONFIGURED2 && !env("INSTALL_SPEC")) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
    const attempt = async (target2) => {
      if (version && !env("INSTALL_SPEC")) {
        const res2 = await npmInstall(specFor(version), inherit, target2, onOutput);
        if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
      }
      return npmInstall(specFor(), inherit, target2, onOutput);
    };
    const target = forced ?? installTarget2();
    const res = await attempt(target);
    if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) {
      onOutput?.(`
No permission for npm's global folder \u2013 installing into ${appDir2()} instead.
`);
      return attempt("local");
    }
    return res;
  }
  async function runUninstall({ target, inherit = false, onOutput }) {
    if (target === "global") return runNpm(["rm", "-g", name], { inherit, onOutput });
    try {
      fs.rmSync(appDir2(), { recursive: true, force: true });
      const msg = `Removed ${appDir2()}
`;
      onOutput?.(msg);
      return { ok: true, output: msg };
    } catch (err) {
      return { ok: false, output: err.message };
    }
  }
  function installedVersion2(script = process.argv[1] ?? "") {
    return new Promise((resolve) => {
      execFile(process.execPath, [script, "--version"], { timeout: 15e3, env: { ...process.env, [`${P}_NO_UPDATE_CHECK`]: "1" } }, (err, stdout) => {
        const version = new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
        resolve(err || !version ? null : version);
      });
    });
  }
  const staleInstallHint2 = (installed) => `npm finished, but ${name} ${installed} is still the version that starts. Try \`${name} update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
  function installHint2(output) {
    if (PERMISSION_RE.test(output)) {
      return `npm isn't allowed to write to ${appDir2()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.${name}\`, then run /update again.`;
    }
    return null;
  }
  return {
    VERSION: VERSION2,
    INSTALL_SPEC: INSTALL_SPEC2,
    INSTALL_CMD: INSTALL_CMD2,
    REPO_CONFIGURED: REPO_CONFIGURED2,
    SOURCE_HINT: SOURCE_HINT2,
    latestUrl: latestUrl2,
    fetchLatestVersion: fetchLatestVersion2,
    checkForUpdate: checkForUpdate2,
    installKind: installKind2,
    releaseSpec: releaseSpec2,
    appDir: appDir2,
    localInstall: localInstall2,
    newerLocalInstall: newerLocalInstall2,
    installTarget: installTarget2,
    runInstall: runInstall2,
    runUninstall,
    installedVersion: installedVersion2,
    staleInstallHint: staleInstallHint2,
    installHint: installHint2
  };
}

// package.json
var package_default = {
  name: "keyrace",
  version: "2.1.0",
  description: "Multiplayer typing races for your local network, right in the terminal.",
  repository: {
    type: "git",
    url: "git+https://github.com/trigonyx/keyrace.git"
  },
  homepage: "https://github.com/trigonyx/keyrace#readme",
  bugs: {
    url: "https://github.com/trigonyx/keyrace/issues"
  },
  type: "module",
  bin: {
    keyrace: "dist/cli.js"
  },
  files: [
    "dist"
  ],
  engines: {
    node: ">=22"
  },
  scripts: {
    dev: "tsx src/cli.tsx",
    build: "tsup",
    start: "node dist/cli.js",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    release: "node scripts/release.mjs"
  },
  dependencies: {
    chalk: "5.6.2",
    ink: "6.8.0",
    react: "19.2.0",
    "string-width": "8.1.0",
    "wrap-ansi": "9.0.2"
  },
  devDependencies: {
    "@types/node": "24.9.1",
    "@types/react": "19.2.2",
    "ink-testing-library": "4.0.0",
    termcore: "file:../termcore",
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/app.ts
var APP = defineApp("keyrace", package_default);

// src/core/update.ts
var {
  latestUrl,
  fetchLatestVersion,
  checkForUpdate,
  installKind,
  SOURCE_HINT,
  releaseSpec,
  appDir,
  localInstall,
  newerLocalInstall,
  installTarget,
  runInstall,
  installedVersion,
  staleInstallHint,
  installHint
} = createUpdater(APP);

// src/core/version.ts
var VERSION = APP.version;
var REPO = APP.repo;
var REPO_CONFIGURED = repoConfigured(APP);
var INSTALL_SPEC = installSpec(APP);
var INSTALL_CMD = installCmd(APP);

// ../termcore/src/app/instance.ts
import fs3 from "fs";
import net from "net";
import path6 from "path";

// ../termcore/src/app/storage.ts
import fs2 from "fs";
import path5 from "path";
function readJson(file, fallback) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    try {
      fs2.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
    }
    return fallback;
  }
}
var tmpSeq = 0;
function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}
function writeFileAtomic(file, content) {
  ensureDir(path5.dirname(file));
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    fs2.writeFileSync(tmp, content, { mode: 384 });
    fs2.renameSync(tmp, file);
  } catch (err) {
    fs2.rmSync(tmp, { force: true });
    throw err;
  }
}
function appendJsonl(file, entry) {
  ensureDir(path5.dirname(file));
  fs2.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 384 });
}
function readJsonl(file) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function writeJsonlAtomic(file, entries) {
  writeFileAtomic(file, entries.map((e) => JSON.stringify(e) + "\n").join(""));
}
function ensureDir(dir) {
  fs2.mkdirSync(dir, { recursive: true, mode: 448 });
}

// ../termcore/src/app/instance.ts
var STARTUP_GRACE = 1e4;
var MAX_REQUEST = 1024 * 1024;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function probeSocket(socket, timeoutMs = 1e3) {
  return new Promise((resolve) => {
    const c2 = net.connect(socket);
    const done = (ok) => {
      clearTimeout(timer);
      c2.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c2.once("connect", () => done(true));
    c2.once("error", () => done(false));
  });
}
function readLock(file) {
  try {
    const o = JSON.parse(fs3.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.startedAt === "number" && typeof o.socket === "string" ? o : null;
  } catch {
    return null;
  }
}
async function acquireLock(lockFile, socket, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path6.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = { pid: process.pid, startedAt: now(), socket };
    try {
      fs3.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx", mode: 384 });
      return {
        release: () => {
          if (readLock(lockFile)?.pid === process.pid) fs3.rmSync(lockFile, { force: true });
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock(lockFile);
    const stale = !holder || holder.pid === process.pid || !isAlive(holder.pid) || !await probe(holder.socket) && now() - holder.startedAt > STARTUP_GRACE;
    if (!stale) return { holder };
    fs3.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}
async function startInstanceServer(socket, onRequest) {
  if (process.platform !== "win32") {
    ensureDir(path6.dirname(socket));
    fs3.rmSync(socket, { force: true });
  }
  const server = net.createServer((conn) => {
    conn.on("error", () => {
    });
    if (!onRequest) {
      conn.end();
      return;
    }
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5e3, () => conn.destroy());
    conn.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      let reply = "";
      try {
        reply = onRequest(buf.slice(0, nl));
      } catch {
      }
      conn.end(reply + "\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") fs3.chmodSync(socket, 384);
  server.on("error", () => {
  });
  server.unref();
  return server;
}

// src/ui/App.tsx
import { Box as Box19, Text as Text20, useApp, useInput as useInput10 } from "ink";
import { useCallback, useEffect as useEffect6, useMemo, useRef as useRef5, useState as useState9 } from "react";

// src/commands/builtin.ts
import net2 from "net";

// ../termcore/src/friends/state.ts
var REL_STATES = ["accepted", "outgoing", "none"];
var CONTACT_STATES = ["accepted", "outgoing", "incoming", "declined", "blocked"];
var STATE_RANK = { blocked: 5, accepted: 4, outgoing: 3, incoming: 2, declined: 1 };
function strongerState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}
function reconcile(mine, theirs) {
  const peerWants = theirs === "accepted" || theirs === "outgoing";
  switch (mine) {
    case "blocked":
      return "blocked";
    case "accepted":
    case "outgoing":
      return peerWants ? "accepted" : "outgoing";
    case "incoming":
      return peerWants ? "incoming" : null;
    case "declined":
      return peerWants ? "incoming" : "declined";
    case null:
      return peerWants ? "incoming" : null;
  }
}
function relStateFor(state) {
  return state === "accepted" || state === "outgoing" ? state : "none";
}

// ../termcore/src/friends/merge.ts
var max = (a, b) => a === void 0 ? b : b === void 0 ? a : Math.max(a, b);
var min = (a, b) => Math.min(a, b);
var fresher = (a, b) => (b.lastSeen ?? 0) > (a.lastSeen ?? 0) ? b : a;
function mergeFriends(a, b, id = a.id) {
  const recent = fresher(a, b);
  const apps = { ...b.apps };
  for (const [app, fields] of Object.entries(a.apps ?? {})) {
    apps[app] = { ...apps[app], ...fields };
  }
  const ports = { ...b.ports, ...a.ports };
  const out = {
    id,
    publicKey: a.publicKey || b.publicKey,
    name: recent.name,
    state: strongerState(a.state, b.state),
    lastActivity: max(a.lastActivity, b.lastActivity) ?? Date.now(),
    createdAt: min(a.createdAt, b.createdAt)
  };
  const alias = a.alias ?? b.alias;
  if (alias) out.alias = alias;
  const color = a.color ?? b.color;
  if (color) out.color = color;
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen = max(a.lastSeen, b.lastSeen);
  if (lastSeen !== void 0) out.lastSeen = lastSeen;
  if (recent.status) out.status = recent.status;
  if (recent.statusMsg) out.statusMsg = recent.statusMsg;
  if (Object.keys(apps).length) out.apps = apps;
  return out;
}
function mergePeers(a, b, id = a.id) {
  const recent = fresher(a, b);
  const out = { id, name: recent.name };
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  const ports = { ...b.ports, ...a.ports };
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen = max(a.lastSeen, b.lastSeen);
  if (lastSeen !== void 0) out.lastSeen = lastSeen;
  return out;
}

// ../termcore/src/friends/book.ts
var SHARED = /* @__PURE__ */ new Set(["publicKey", "name", "alias", "state", "color", "lastIp", "lastSeen", "lastActivity", "createdAt", "status", "statusMsg"]);
function displayName(c2) {
  return c2.alias || c2.name;
}
function viewOf(f, app) {
  const { ports, apps, ...rest } = f;
  const port = ports?.[app];
  return { ...apps?.[app], ...rest, ...port ? { lastPort: port } : {} };
}
function applyPatch(f, patch, app) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (SHARED.has(k)) {
      if (v === void 0) delete f[k];
      else f[k] = v;
    } else if (k === "lastPort") {
      const ports = { ...f.ports };
      if (typeof v === "number" && v > 0) ports[app] = v;
      else delete ports[app];
      if (Object.keys(ports).length) f.ports = ports;
      else delete f.ports;
    } else {
      const fields = { ...f.apps?.[app] };
      if (v === void 0) delete fields[k];
      else fields[k] = v;
      const apps = { ...f.apps };
      if (Object.keys(fields).length) apps[app] = fields;
      else delete apps[app];
      if (Object.keys(apps).length) f.apps = apps;
      else delete f.apps;
    }
  }
}
var ContactBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
    this.rebuild(file.get());
    file.on("change", (v) => this.rebuild(v));
  }
  views = /* @__PURE__ */ new Map();
  version = 0;
  rebuild(v) {
    this.views = new Map(v.friends.map((f) => [f.id, viewOf(f, this.app)]));
    this.version++;
  }
  get(id) {
    return this.views.get(id);
  }
  all() {
    return [...this.views.values()];
  }
  /** The entry as stored (all apps' fields). */
  raw(id) {
    return this.file.get().friends.find((f) => f.id === id);
  }
  upsert(id, patch) {
    return this.mutate(id, () => patch);
  }
  /**
   * Decides a change from the newest stored entry (read under the lock): `fn` returns a patch,
   * `null` to remove the entry, or `undefined` for no change. Returns the entry afterwards.
   */
  mutate(id, fn) {
    let result;
    this.file.update((d) => {
      const i = d.friends.findIndex((f) => f.id === id);
      const prev = i >= 0 ? d.friends[i] : void 0;
      const patch = fn(prev ? viewOf(prev, this.app) : void 0);
      if (patch === null) {
        if (i >= 0) d.friends.splice(i, 1);
        result = void 0;
        return;
      }
      if (patch === void 0) {
        result = prev;
        return;
      }
      const p = patch;
      if (!prev && (p.publicKey === void 0 || !p.name || !p.state)) {
        result = void 0;
        return;
      }
      const now = Date.now();
      const next = prev ? structuredClone(prev) : { id, publicKey: "", name: "", state: p.state, lastActivity: now, createdAt: now };
      applyPatch(next, patch, this.app);
      if (i >= 0) d.friends[i] = next;
      else d.friends.push(next);
      result = next;
    });
    return result ? viewOf(result, this.app) : void 0;
  }
  /**
   * Ports of their other apps (from their discovery announcement): another app of ours can
   * then dial them right away. Only known entries, only when something changed.
   */
  setPorts(id, ports) {
    const cur = this.raw(id);
    if (!cur || Object.entries(ports).every(([app, port]) => cur.ports?.[app] === port)) return;
    this.file.update((d) => {
      const f = d.friends.find((x) => x.id === id);
      if (f) f.ports = { ...f.ports, ...ports };
    });
  }
  remove(id) {
    if (this.views.has(id) || this.raw(id)) this.mutate(id, () => null);
  }
  /** Someone has a new id (a verified link): their entry moves there, merged with one that may exist. */
  relink(oldId, newId, newPublicKey) {
    let moved = false;
    this.file.update((d) => {
      const old = d.friends.find((f) => f.id === oldId);
      if (!old) return;
      const existing = d.friends.find((f) => f.id === newId);
      const merged = existing ? mergeFriends(existing, old, newId) : { ...old, id: newId };
      merged.publicKey = newPublicKey;
      d.friends = [...d.friends.filter((f) => f.id !== oldId && f.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};
var PeerBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
  }
  view(p) {
    const { ports, ...rest } = p;
    const port = ports?.[this.app];
    return { ...rest, ...port ? { lastPort: port } : {} };
  }
  get(id) {
    const p = this.file.get().peers.find((x) => x.id === id);
    return p ? this.view(p) : void 0;
  }
  update(id, patch) {
    const prev = this.file.get().peers.find((x) => x.id === id);
    const port = patch.lastPort;
    const unchanged = prev && (patch.name === void 0 || patch.name === prev.name) && (patch.lastIp === void 0 || patch.lastIp === prev.lastIp) && (patch.lastSeen === void 0 || patch.lastSeen === prev.lastSeen) && (port === void 0 || port === prev.ports?.[this.app]);
    if (unchanged) return;
    this.file.update((d) => {
      let p = d.peers.find((x) => x.id === id);
      if (!p) {
        p = { id, name: patch.name ?? "Unknown" };
        d.peers.push(p);
      }
      if (patch.name !== void 0) p.name = patch.name;
      if (patch.lastIp !== void 0) p.lastIp = patch.lastIp;
      if (patch.lastSeen !== void 0) p.lastSeen = patch.lastSeen;
      if (port) p.ports = { ...p.ports, [this.app]: port };
    });
  }
  relink(oldId, newId) {
    let moved = false;
    this.file.update((d) => {
      const old = d.peers.find((p) => p.id === oldId);
      if (!old) return;
      const existing = d.peers.find((p) => p.id === newId);
      const merged = existing ? mergePeers(existing, old, newId) : { ...old, id: newId };
      d.peers = [...d.peers.filter((p) => p.id !== oldId && p.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};

// ../termcore/src/net/identity.ts
import crypto2 from "crypto";
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[value << 5 - bits & 31];
  return out;
}
function fingerprint(publicRaw) {
  return base32(crypto2.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto2.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto2.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function isIdentityFile(o) {
  const f = o;
  return !!f && f.v === 1 && typeof f.publicKey === "string" && typeof f.privateKey === "string" && !!f.publicKey && !!f.privateKey;
}
function identityFromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto2.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function generateIdentityFile() {
  const { privateKey } = crypto2.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  return { v: 1, publicKey: jwk.x, privateKey: jwk.d };
}
function readIdentity(file) {
  const existing = readJson(file, null);
  if (!isIdentityFile(existing)) return null;
  try {
    return identityFromFile(existing);
  } catch {
    return null;
  }
}
function loadOrCreateIdentity(file) {
  const existing = readIdentity(file);
  if (existing) return existing;
  const created = generateIdentityFile();
  writeJsonAtomic(file, created);
  return identityFromFile(created);
}

// ../termcore/src/ui/theme.ts
import chalk from "chalk";

// ../termcore/src/app/sanitize.ts
var ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[PX^_][^\u001b]*(?:\u001b\\)?|[@-Z\\-_])?/g;
var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
var BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
var MAX_NAME = 32;
function sanitizeText(input) {
  return input.replace(/\r\n?/g, "\n").replace(ANSI, "").replace(CONTROL, "").replace(BIDI, "").replace(/\t/g, "    ");
}
function cleanName(input) {
  if (typeof input !== "string") return "Unknown";
  const name = sanitizeText(input).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || "Unknown";
}

// ../termcore/src/friends/profile.ts
var STATUSES = ["available", "busy", "dnd"];
var MAX_STATUS_MSG = 60;
var PROFILE_COLORS = [
  { name: "coral", hex: "#f7768e" },
  { name: "orange", hex: "#ff9e64" },
  { name: "amber", hex: "#e0af68" },
  { name: "lime", hex: "#b9e66b" },
  { name: "green", hex: "#9ece6a" },
  { name: "teal", hex: "#73daca" },
  { name: "cyan", hex: "#7dcfff" },
  { name: "blue", hex: "#7aa2f7" },
  { name: "indigo", hex: "#8f8cf2" },
  { name: "purple", hex: "#bb9af7" },
  { name: "pink", hex: "#ff8fc7" },
  { name: "sand", hex: "#d8c4a0" }
];
function normalizeColor(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  const named = PROFILE_COLORS.find((c2) => c2.name === v);
  if (named) return named.hex;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (!m) return null;
  return "#" + (m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1]);
}
var isStatus = (v) => typeof v === "string" && STATUSES.includes(v);
function cleanStatusMsg(input) {
  if (typeof input !== "string") return void 0;
  const msg = [...sanitizeText(input).replace(/\s+/g, " ").trim()].slice(0, MAX_STATUS_MSG).join("");
  return msg || void 0;
}

// ../termcore/src/ui/theme.ts
var DEFAULT_ACCENT = "#D97757";
var theme = {
  accent: DEFAULT_ACCENT,
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8",
  /** text on an accent background */
  onAccent: "#1E1E1E",
  /** text still to type (keyrace) */
  text: "#D4D4D4",
  /** text typed correctly (keyrace) */
  typed: "#FFFFFF"
};
function setAccent(hex) {
  const next = normalizeColor(hex) ?? DEFAULT_ACCENT;
  if (next.toLowerCase() === theme.accent.toLowerCase()) return false;
  theme.accent = next;
  return true;
}
var c = {
  get accent() {
    return chalk.hex(theme.accent);
  },
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic
};
var icons = {
  pointer: "\u276F",
  online: "\u25CF",
  offline: "\u25CB",
  away: "\u25D0",
  busy: "\u25D1",
  dnd: "\u2298",
  send: "\u25B6",
  racing: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  done: "\u2713",
  delivered: "\u2713",
  read: "\u2713\u2713",
  error: "\u2717",
  info: "\xB7",
  star: "\u2605",
  up: "\u2191",
  down: "\u2193",
  file: "\u25AA",
  group: "#",
  left: "\u23CF",
  flag: "\u{1F3C1}"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function idHex(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}
var profileColor = null;
function setPersonColors(lookup) {
  profileColor = lookup;
}
function senderHex(id) {
  return profileColor?.(id) ?? idHex(id);
}
function personHex(id, color) {
  return color ?? senderHex(id);
}

// ../termcore/src/ui/presence.ts
function presenceDot(p) {
  if (!p.online) return { icon: icons.offline, color: theme.faint };
  if (p.status === "dnd") return { icon: icons.dnd, color: theme.error };
  if (p.status === "busy") return { icon: icons.busy, color: theme.warning };
  if (p.away) return { icon: icons.away, color: theme.dim };
  return { icon: icons.online, color: theme.success };
}
function statusText(status, msg) {
  const label = status === "busy" ? "busy" : status === "dnd" ? "do not disturb" : "";
  return [label, msg].filter(Boolean).join(" \xB7 ");
}

// src/game/stats.ts
var bestKey = (mode, param) => `${mode}:${param}`;
function beats(mode, a, b) {
  if (mode === "sudden") return a.timeMs > b.timeMs || a.timeMs === b.timeMs && a.words > b.words;
  return a.wpm > b.wpm;
}
function counts(mode, r) {
  if (r.status === "left") return false;
  if (mode === "race") return r.completed;
  return r.words > 0 || r.timeMs > 0;
}
function computeStats(records, myId) {
  const stats = { races: 0, wins: 0, winRate: 0, solo: 0, bests: /* @__PURE__ */ new Map(), avgAcc: null, avgWpm: null, bestWpm: 0, h2h: /* @__PURE__ */ new Map() };
  let accSum = 0;
  let wpmSum = 0;
  let runs = 0;
  for (const rec of [...records].sort((a, b) => a.ts - b.ts)) {
    const me = rec.players.find((p) => p.id === myId);
    if (!me) continue;
    const others = rec.players.filter((p) => p.id !== myId);
    const multi = !rec.solo && others.length > 0;
    if (multi) {
      stats.races++;
      if (me.place === 1 && me.status !== "left") stats.wins++;
    } else stats.solo++;
    if (me.status !== "left") {
      runs++;
      accSum += me.acc;
      wpmSum += me.wpm;
      stats.bestWpm = Math.max(stats.bestWpm, me.wpm);
    }
    if (counts(rec.mode, me)) {
      const key = bestKey(rec.mode, rec.param);
      const prev = stats.bests.get(key);
      const run = { wpm: me.wpm, words: me.words, acc: me.acc, timeMs: me.timeMs, ts: rec.ts };
      if (!prev || beats(rec.mode, run, prev)) stats.bests.set(key, run);
    }
    if (!multi) continue;
    for (const o of others) {
      const h = stats.h2h.get(o.id) ?? { id: o.id, name: o.name, wins: 0, losses: 0, races: 0, myBestWpm: 0, theirBestWpm: 0 };
      h.name = o.name;
      h.races++;
      if (me.place < o.place) h.wins++;
      else h.losses++;
      if (me.status !== "left") h.myBestWpm = Math.max(h.myBestWpm, me.wpm);
      if (o.status !== "left") h.theirBestWpm = Math.max(h.theirBestWpm, o.wpm);
      h.last = { ts: rec.ts, mode: rec.mode, param: rec.param, myPlace: me.place, theirPlace: o.place, players: rec.players.length };
      stats.h2h.set(o.id, h);
    }
  }
  stats.winRate = stats.races ? stats.wins / stats.races : 0;
  stats.avgAcc = runs ? accSum / runs : null;
  stats.avgWpm = runs ? wpmSum / runs : null;
  return stats;
}
function isNewBest(before, rec) {
  const me = rec.players.find((p) => p.id === rec.me);
  if (!me || !counts(rec.mode, me)) return false;
  const prev = before.bests.get(bestKey(rec.mode, rec.param));
  return !prev || beats(rec.mode, me, prev);
}
function leaderboard(stats, me, friends) {
  const rows = [{ id: me.id, name: me.name, bestWpm: stats.bestWpm, isMe: true }];
  for (const [id, name] of friends) {
    const h = stats.h2h.get(id);
    if (h && h.theirBestWpm > 0) rows.push({ id, name, bestWpm: h.theirBestWpm, isMe: false });
  }
  return rows.sort((a, b) => b.bestWpm - a.bestWpm || Number(b.isMe) - Number(a.isMe));
}
function isRaceRecord(r) {
  const o = r;
  return !!o && o.v === 1 && typeof o.ts === "number" && typeof o.me === "string" && ["sprint", "race", "sudden"].includes(o.mode) && Array.isArray(o.players) && o.players.every((p) => p && typeof p.id === "string" && typeof p.place === "number" && typeof p.wpm === "number");
}

// src/game/types.ts
var MODES = ["sprint", "race", "sudden"];
var SPRINT_DURATIONS = [30, 60, 120];
var RACE_TARGETS = [25, 50, 100];
var PARAMS = {
  sprint: SPRINT_DURATIONS,
  race: RACE_TARGETS,
  sudden: [0]
};
var DEFAULT_PARAM = { sprint: 60, race: 50, sudden: 0 };
var RACE_TIME_LIMIT_MS = 5 * 6e4;
var SUDDEN_TIME_LIMIT_MS = 10 * 6e4;
var WALL = {
  graceMs: 3e3,
  startWpm: 20,
  stepWpm: 5,
  stepMs: 1e4
};
var MAX_PLAUSIBLE_WPM = 350;
var MODE_LABEL = { sprint: "Sprint", race: "Race", sudden: "Sudden Death" };
var MODE_BLURB = {
  sprint: "most correct words in the time",
  race: "first to type the words wins",
  sudden: "one typo and you're out \xB7 outrun the wall"
};
function isValidSettings(mode, param) {
  return typeof mode === "string" && MODES.includes(mode) && PARAMS[mode].includes(param);
}
function settingsLabel(s) {
  if (s.mode === "sprint") return `${MODE_LABEL.sprint} \xB7 ${s.param}s`;
  if (s.mode === "race") return `${MODE_LABEL.race} \xB7 ${s.param} words`;
  return MODE_LABEL.sudden;
}
function settingsPhrase(s) {
  if (s.mode === "sprint") return `a ${s.param}s sprint`;
  if (s.mode === "race") return `a ${s.param}-word race`;
  return "a sudden death race";
}
function runLimitMs(s) {
  if (s.mode === "sprint") return s.param * 1e3;
  if (s.mode === "race") return RACE_TIME_LIMIT_MS;
  return SUDDEN_TIME_LIMIT_MS;
}
function wpmOf(chars, ms) {
  if (ms <= 0) return 0;
  return chars / 5 / (Math.max(ms, 1e3) / 6e4);
}
function accuracyOf(correctKeys, keys) {
  return keys > 0 ? correctKeys / keys : 1;
}

// ../termcore/src/ui/format.ts
var pad = (n) => String(n).padStart(2, "0");
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function clock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var daysAgo = (ts, now) => Math.round((startOfDay(now) - startOfDay(ts)) / 864e5);
function shortTime(ts, now = Date.now()) {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return clock(ts);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[d.getDay()];
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
function duration(ms) {
  const s = Math.max(0, ms) / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function clockDown(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1e3);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
var pct = (x) => `${Math.round(x * 100)}%`;

// ../termcore/src/ui/commands/parse.ts
function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const name = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();
  return { name, args: tokenize(rest), rest };
}
function tokenize(text) {
  const args = [];
  let current = "";
  let quote = null;
  let inToken = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) args.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) args.push(current);
  return args;
}

// ../termcore/src/ui/commands/registry.ts
var CommandRegistry = class {
  constructor(commands, rules) {
    this.commands = commands;
    this.rules = rules;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  fits(c2, where) {
    return c2.scope === "global" || !this.rules || where === void 0 || this.rules.inScope(c2.scope, where);
  }
  /** Commands available here (all of them without a place). */
  available(where) {
    return this.commands.filter((c2) => this.fits(c2, where));
  }
  /** Commands available here, filtered by prefix. */
  suggest(prefix, where) {
    const p = prefix.toLowerCase();
    return this.available(where).filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
  }
  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input, ctx) {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;
    if (!parsed.name) {
      ui.print("Type a command, e.g. /help", "error");
      return true;
    }
    const where = this.rules?.where(ctx);
    const cmd = this.available(where).find((c2) => c2.name === parsed.name || c2.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
      return true;
    }
    if (!this.fits(cmd, where)) {
      ui.print(this.rules.outOfScope(cmd.name, cmd.scope, where), "error");
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ""}`.trim(), "error");
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err) {
      ui.print(`/${cmd.name} failed: ${err.message}`, "error");
    }
    return true;
  }
};

// src/commands/registry.ts
var CommandRegistry2 = class extends CommandRegistry {
};

// src/commands/builtin.ts
var STATE_LABEL = {
  accepted: "friend",
  outgoing: "request sent",
  incoming: "wants to be friends",
  declined: "declined your request",
  blocked: "blocked"
};
async function friendOf(ctx, title, filter = () => true) {
  const sel = ctx.selectedId ? ctx.store.contacts.get(ctx.selectedId) : void 0;
  if (sel && filter(sel.state)) return sel.id;
  const options = ctx.store.contacts.all().filter((c2) => filter(c2.state)).map((c2) => ({ id: c2.id, label: displayName(c2), hint: STATE_LABEL[c2.state] })).sort((a, b) => a.label.localeCompare(b.label));
  if (!options.length) throw new Error("No friend to choose from");
  const ids = await ctx.ui.pick(title, options, false);
  return ids?.[0] ?? null;
}
function parseAddress(input) {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1];
  const port = m[2] ? Number(m[2]) : APP.tcpPort;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net2.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}
function bestLines(ctx) {
  const stats = ctx.store.stats();
  const lines = [];
  for (const mode of Object.keys(PARAMS)) {
    for (const param of PARAMS[mode]) {
      const b = stats.bests.get(bestKey(mode, param));
      if (!b) continue;
      const label = settingsLabel({ mode, param });
      const value = mode === "sudden" ? `**${duration(b.timeMs)}** survived \xB7 ${b.words} words \xB7 ${Math.round(b.wpm)} wpm` : mode === "race" ? `**${Math.round(b.wpm)} wpm** \xB7 ${duration(b.timeMs)} \xB7 ${pct(b.acc)}` : `**${Math.round(b.wpm)} wpm** \xB7 ${b.words} words \xB7 ${pct(b.acc)}`;
      lines.push(`- ${label}: ${value} _${shortTime(b.ts)}_`);
    }
  }
  return lines;
}
var builtinCommands = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show all commands and shortcuts",
    scope: "global",
    run(ctx) {
      const cmds = registry.available();
      const width = Math.max(...cmds.map((c2) => `/${c2.name} ${c2.usage ?? ""}`.length));
      const lines = cmds.map((c2) => `\`${`/${c2.name} ${c2.usage ?? ""}`.trimEnd().padEnd(width)}\`  ${c2.description}`);
      ctx.ui.print(
        [
          "### Commands",
          "",
          ...lines.map((l) => `- ${l}`),
          "",
          "**Keys:** `\u2191\u2193` select \xB7 `enter` start a race / accept / invite \xB7 `s` solo practice \xB7 `x` decline \xB7 `a` add by IP \xB7 `r` rename \xB7 `d` remove \xB7 `/` command \xB7 `q` quit",
          "**Racing:** type the words, `space` ends a word, `backspace` fixes the current word (`alt+backspace` clears it), `esc` gives up"
        ].join("\n")
      );
    }
  },
  {
    name: "race",
    aliases: ["new", "play"],
    description: "Start a race and invite friends",
    scope: "global",
    async run(ctx) {
      await ctx.ui.newRace();
    }
  },
  {
    name: "solo",
    aliases: ["practice"],
    description: "Solo practice (counts for your bests, not for wins)",
    scope: "global",
    async run(ctx) {
      const s = await ctx.ui.chooseMode("Solo practice");
      if (s) ctx.store.games.solo(s);
    }
  },
  {
    name: "me",
    aliases: ["id"],
    description: "Show your name, ID and address",
    scope: "global",
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(", ") : "no network";
      const status = statusText(me.status, me.statusMsg);
      ctx.ui.print(
        [
          `### ${me.name}`,
          "",
          `- **ID** \`${formatId(me.id, true)}\``,
          ...status ? [`- **Status** ${status}`] : [],
          `- **Reachable at** ${addr}`,
          "",
          "_Name, ID and friends are shared by termchat, keyrace and termdrop (~/.termhub)._"
        ].join("\n")
      );
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name (in all apps)",
    scope: "global",
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now ${name}`, "success");
    }
  },
  {
    name: "add",
    usage: "<ip[:port]>",
    minArgs: 1,
    description: "Add a friend by IP (if they don't show up under Nearby)",
    scope: "global",
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]);
      ctx.ui.print(`Connecting to ${host}:${port} \u2026`);
      await ctx.store.addByAddress(host, port);
    }
  },
  {
    name: "rename",
    usage: "[nickname]",
    description: "Your own nickname for the selected friend (empty = their own name)",
    scope: "global",
    async run(ctx, _args, rest) {
      const id = await friendOf(ctx, "Rename which friend?");
      if (!id) return;
      ctx.store.rename(id, rest);
      ctx.ui.print(rest ? `Now shown as ${ctx.store.friend(id)?.display}` : "Nickname removed", "success");
    }
  },
  {
    name: "remove",
    description: "Remove the selected friend",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Remove which friend?");
      if (!id) return;
      const f = ctx.store.friend(id);
      if (await ctx.ui.confirm(`Remove ${f.display} as a friend?`)) ctx.store.removeFriend(id);
    }
  },
  {
    name: "block",
    description: "Block the selected friend",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Block whom?", (s) => s !== "blocked");
      if (!id) return;
      const f = ctx.store.friend(id);
      if (await ctx.ui.confirm(`Block ${f.display}?`)) ctx.store.block(id);
    }
  },
  {
    name: "unblock",
    description: "Unblock someone you blocked",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Unblock whom?", (s) => s === "blocked");
      if (id) ctx.store.unblock(id);
    }
  },
  {
    name: "whois",
    aliases: ["info"],
    description: "Friend details and safety code",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Show whom?");
      if (!id) return;
      const f = ctx.store.friend(id);
      const code = ctx.store.safetyCodeWith(id);
      const lines = [
        `### ${f.display}${f.alias ? ` _(calls themselves ${f.name})_` : ""}`,
        "",
        `- **ID** \`${formatId(f.id, true)}\``,
        `- **Status** ${f.racing ? "racing" : f.away ? "away" : f.online ? "online" : "offline"}${f.online && statusText(f.status, f.statusMsg) ? ` \xB7 ${statusText(f.status, f.statusMsg)}` : ""} \xB7 ${STATE_LABEL[f.state] ?? f.state}`,
        `- **Address** ${f.lastIp ? `\`${f.lastIp}:${f.lastPort ?? "?"}\`` : "unknown"}`,
        `- **Safety code** ${code ? `\`${code}\`` : "not connected yet"}`,
        "",
        "_Compare the safety code in person. If it matches, nobody is sitting in the middle._"
      ];
      ctx.ui.print(lines.join("\n"));
    }
  },
  {
    name: "stats",
    description: "Your stats, bests and head-to-head records",
    scope: "global",
    run(ctx) {
      const s = ctx.store.stats();
      const lines = [
        "### Your stats",
        "",
        `- **Races** ${s.races} \xB7 **wins** ${s.wins} (${pct(s.winRate)}) \xB7 **solo runs** ${s.solo}`,
        `- **Average** ${s.avgWpm === null ? "\u2013" : `${Math.round(s.avgWpm)} wpm`} \xB7 ${s.avgAcc === null ? "\u2013" : `${pct(s.avgAcc)} accuracy`}`,
        "",
        "### Personal bests",
        "",
        ...bestLines(ctx).length ? bestLines(ctx) : ["_No runs yet \u2013 press `s` for solo practice._"]
      ];
      const h2h = [...s.h2h.values()].sort((a, b) => b.races - a.races);
      if (h2h.length) {
        lines.push("", "### Head to head", "");
        for (const h of h2h) {
          const name = ctx.store.contacts.get(h.id) ? ctx.store.peerName(h.id) : h.name;
          lines.push(
            `- **${name}**  you ${h.wins} : ${h.losses} \xB7 best ${Math.round(h.myBestWpm)} vs ${Math.round(h.theirBestWpm)} wpm` + (h.last ? ` _\xB7 last: ${MODE_LABEL[h.last.mode]} ${shortTime(h.last.ts)}_` : "")
          );
        }
      }
      ctx.ui.print(lines.join("\n"));
    }
  },
  {
    name: "notifications",
    aliases: ["notify"],
    usage: "[on|off]",
    description: "Desktop notifications while the app is in the background (all apps)",
    scope: "global",
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== "on" && arg !== "off") throw new Error("Usage: /notifications on|off");
      if (arg) ctx.store.setNotifications(arg === "on");
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? "on" : "off"}`, "info");
    }
  },
  {
    name: "update",
    description: "Install the latest keyrace version from GitHub",
    scope: "global",
    async run(ctx) {
      if (installKind() === "source") return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print("Checking for updates \u2026");
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub \u2013 are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`keyrace ${VERSION} is up to date`, "success");
        return;
      }
      if (!await ctx.ui.confirm(`Update keyrace ${VERSION} \u2192 ${latest}?`)) return;
      ctx.ui.print(`Installing keyrace ${latest} \u2026 (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split("\n").slice(-6).join("\n");
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:
${tail}`);
      }
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart keyrace now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated \u2013 restart keyrace to use ${latest}`, "success");
      }
    }
  },
  {
    name: "quit",
    aliases: ["exit", "q"],
    description: "Quit keyrace",
    scope: "global",
    run(ctx) {
      ctx.ui.quit();
    }
  }
];
var registry = new CommandRegistry2(builtinCommands);

// ../termcore/src/app/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text, kind = "info", extra) {
    this.current = { ...extra, text, kind };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
    }, this.ms);
    this.timer.unref();
    this.changed();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
};

// ../termcore/src/friends/net.ts
import fs9 from "fs";

// ../termcore/src/app/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body, app = "termhub") {
  const cmd = process.platform === "darwin" ? ["osascript", ["-e", MAC_SCRIPT, title, body]] : process.platform === "linux" ? ["notify-send", [`--app-name=${app}`, "--", title, body]] : null;
  if (!cmd) return;
  try {
    execFile2(cmd[0], [...cmd[1]], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// ../termcore/src/app/run.ts
import fs4 from "fs";
import path7 from "path";
function registerRun(runDir, info) {
  const file = path7.join(runDir, `${info.app}.json`);
  const entry = { ...info, pid: process.pid, startedAt: Date.now() };
  try {
    writeJsonAtomic(file, entry);
  } catch {
    return () => {
    };
  }
  return () => {
    try {
      if (readJson(file, null)?.pid === process.pid) fs4.rmSync(file, { force: true });
    } catch {
    }
  };
}
function runningApps(runDir, isAlive = pidAlive) {
  let files = [];
  try {
    files = fs4.readdirSync(runDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const r = readJson(path7.join(runDir, f), null);
      if (r && isSuiteApp(r.app) && Number.isInteger(r.pid) && Number.isInteger(r.port) && isAlive(r.pid)) out.push(r);
    } catch {
    }
  }
  return out;
}
function runningPorts(runDir) {
  return Object.fromEntries(runningApps(runDir).map((r) => [r.app, r.port]));
}

// ../termcore/src/net/dialer.ts
var MAX_BACKOFF = 3e4;
var MAX_BACKOFF_NEARBY = 5e3;
var CALLBACK_TTL = 15e3;
var MAX_CALLBACKS_PER_MINUTE = 10;
var Dialer = class {
  constructor(d) {
    this.d = d;
  }
  states = /* @__PURE__ */ new Map();
  /** Peers that asked us to connect to them (id → when). */
  callbacks = /* @__PURE__ */ new Map();
  callbackTimes = [];
  /** Friends we already told that they can't be reached. */
  warned = /* @__PURE__ */ new Set();
  /** We dialed this id and someone else answered – that session waits for their link. */
  relinking = /* @__PURE__ */ new Map();
  timer = null;
  start(intervalMs = 1500) {
    this.timer = setInterval(() => this.loop(), intervalMs);
    this.timer.unref();
    this.loop();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  /** A session came up: forget backoff and callbacks for that peer. */
  connected(id) {
    this.states.delete(id);
    this.callbacks.delete(id);
    this.warned.delete(id);
    this.relinking.delete(id);
  }
  /** A connection turned out to be useless (e.g. someone else answered): back off as after a failed dial. */
  failed(id) {
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    ds.backoff = Math.min(ds.backoff * 2, MAX_BACKOFF);
    ds.next = Date.now() + ds.backoff;
    this.states.set(id, ds);
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  wanted(id) {
    const state = this.d.stateOf(id);
    return state === "accepted" || state === "outgoing" || state !== "blocked" && (this.d.alsoWants?.(id) ?? false);
  }
  wantsConnection(id) {
    return !this.d.network.isOnline(id) && this.wanted(id);
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.stateOf(id) === "blocked") return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 6e4);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }
  loop() {
    for (const id of this.d.candidates()) this.tryDial(id);
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.find(id);
    const port = p && (this.d.portOf ? this.d.portOf(p) : p.port);
    if (p && port) return { ip: p.ip, port, discovered: true };
    const last = this.d.lastAddress(id);
    return last ? { ...last, discovered: false } : null;
  }
  tryDial(id) {
    const { network } = this.d;
    if (network.isOnline(id) || this.relinking.get(id)?.isOpen) return;
    const state = this.d.stateOf(id);
    const now = Date.now();
    const calledBack = state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!this.wanted(id) && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then((s) => {
      this.states.delete(id);
      if (s.peerId !== id) this.relinking.set(id, s);
    }).catch((err) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const s = this.d.stateOf(id);
      const waiting = s === "outgoing" || s === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(id, { ip: t.ip, port: t.port, error: err.message });
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// ../termcore/src/net/discovery.ts
import dgram from "dgram";
import os4 from "os";
import { EventEmitter } from "events";
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var MAX_WAS = 4;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os4.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((b, i) => (b | ~mask[i] & 255) & 255).join(".");
      out.push({ address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out;
}
var toInt = (ip) => ip.split(".").reduce((n, b) => n * 256 + Number(b), 0);
var toIp = (n) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join(".");
function prefixLength(netmask) {
  let n = toInt(netmask);
  let bits = 0;
  while (n & 2147483648) {
    bits++;
    n = n << 1 >>> 0;
  }
  return bits;
}
function isPrivate(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 172 && b >= 16 && b < 32 || a === 192 && b === 168 || a === 100 && b >= 64 && b < 128;
}
function* scanOrder(ifaces) {
  const ranges = ifaces.flatMap((i) => {
    const prefix = prefixLength(i.netmask);
    if (prefix > 30 || i.address.startsWith("169.254.")) return [];
    const mask = prefix < MIN_SCAN_PREFIX ? 4294901760 : toInt(i.netmask);
    const ip = toInt(i.address);
    const net4 = (ip & mask) >>> 0;
    const broadcast = (net4 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net4, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net4, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net4; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net4) yield toIp(ip - d);
    }
  });
  const seen = /* @__PURE__ */ new Set();
  while (gens.length) {
    for (let i = 0; i < gens.length; i++) {
      const r = gens[i].next();
      if (r.done) gens.splice(i--, 1);
      else if (!seen.has(r.value)) {
        seen.add(r.value);
        yield r.value;
      }
    }
  }
}
function udpTransport(port) {
  return ({ onMessage, onError, onReady }) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let bound = false;
    socket.on("error", (err) => {
      if (!bound) onError(err);
    });
    socket.on("message", (buf, rinfo) => onMessage(buf, rinfo.address));
    socket.bind(port, () => {
      bound = true;
      try {
        socket.setBroadcast(true);
      } catch {
      }
      onReady();
    });
    return {
      send(buf, address, to = port) {
        try {
          socket.send(buf, to, address, () => {
          });
        } catch {
        }
      },
      close() {
        try {
          socket.close();
        } catch {
        }
      }
    };
  };
}
function parseApps(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseWas(v, own) {
  if (!Array.isArray(v)) return void 0;
  const out = v.slice(0, MAX_WAS).filter((x) => typeof x === "string" && PEER_ID_RE.test(x) && x !== own);
  return out.length ? out : void 0;
}
var sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var Discovery = class extends EventEmitter {
  constructor(myId, getName, getPort, opts) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
    this.listApps = new Set(opts.listApps ?? [opts.app]);
    this.udpPort = opts.udpPort ?? SUITE[opts.app].udpPort;
  }
  transport = null;
  timer = null;
  scanTimer = null;
  scanQueue = null;
  lastScanEnd = 0;
  lastHints = 0;
  netSignature = "";
  /** address → when we last asked it directly */
  probed = /* @__PURE__ */ new Map();
  peers = /* @__PURE__ */ new Map();
  listApps;
  udpPort;
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.udpPort);
    this.transport = open({
      onMessage: (buf, address) => this.onMessage(buf, address),
      onError: (err) => {
        this.emit("log", `Discovery unavailable: ${err.message}`);
        this.stop();
      },
      onReady: () => {
        this.netSignature = this.signature();
        this.announce(true);
        this.probeHints();
        this.startScan();
        this.timer = setInterval(() => this.tick(), ANNOUNCE_INTERVAL);
        this.timer.unref();
      }
    });
  }
  /** The peer that is (or used to be, see `was`) `id`. */
  find(id) {
    const direct = this.peers.get(id);
    if (direct) return direct;
    for (const p of this.peers.values()) if (p.was?.includes(id)) return p;
    return void 0;
  }
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      const m = p.app === this.opts.app ? msg : { ...msg, q: 1 };
      this.sendTo(this.opts.wants?.(p.id) ? { ...m, c: 1 } : m, p.ip, p.app);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.find(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip, p.app);
  }
  tick() {
    const now = Date.now();
    const signature = this.signature();
    if (signature !== this.netSignature) {
      this.netSignature = signature;
      this.emit("log", "Network changed \u2013 searching again");
      this.probed.clear();
      this.announce(true);
      this.probeHints();
      this.startScan();
    } else {
      this.announce(false);
      if (now - this.lastHints >= HINT_INTERVAL) this.probeHints();
      if (!this.scanQueue && this.peers.size === 0 && now - this.lastScanEnd >= RESCAN_ALONE) this.startScan();
    }
    for (const [ip, at] of this.probed) if (now - at >= REPROBE_AFTER) this.probed.delete(ip);
    this.expire();
  }
  message(query) {
    const msg = { app: this.opts.app, v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    const apps = this.opts.apps?.();
    if (apps && Object.keys(apps).length) msg.apps = apps;
    const was = this.opts.was?.().slice(0, MAX_WAS);
    if (was?.length) msg.was = was;
    return msg;
  }
  /**
   * Sends to `address` on the port of `app` (default: ours). Queries to other apps' ports ask
   * for the answer on ours (`rp`).
   */
  sendTo(msg, address, app = this.opts.app, port) {
    const to = port ?? (app === this.opts.app ? this.udpPort : SUITE[app].udpPort);
    const out = to === this.udpPort ? msg : { ...msg, rp: this.udpPort };
    this.transport?.send(Buffer.from(JSON.stringify(out)), address, to);
  }
  /** Sends a query to `address` on our port and on every port in `alsoAsk`. */
  query(address) {
    const msg = this.message(true);
    this.sendTo(msg, address);
    for (const other of this.opts.alsoAsk ?? []) this.sendTo(msg, address, other.app, other.udpPort);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether the app runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.query(ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
    if (this.opts.alsoAsk?.length) {
      const msg = this.message(true);
      for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) {
        for (const other of this.opts.alsoAsk) this.sendTo(msg, target, other.app, other.udpPort);
      }
    }
  }
  startScan() {
    this.scanQueue = scanOrder(this.interfaces());
    if (!this.scanTimer) {
      this.scanTimer = setInterval(() => this.scanStep(), SCAN_TICK);
      this.scanTimer.unref();
    }
    this.emit("change");
  }
  scanStep() {
    const known = new Set([...this.peers.values()].map((p) => p.ip));
    for (let sent = 0; sent < SCAN_BATCH; ) {
      const next = this.scanQueue?.next();
      if (!next || next.done) {
        this.scanQueue = null;
        this.lastScanEnd = Date.now();
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.emit("change");
        return;
      }
      if (known.has(next.value)) continue;
      this.query(next.value);
      sent++;
    }
  }
  onMessage(buf, address) {
    if (buf.length > MAX_PACKET) return;
    let msg;
    try {
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }
    if (!msg || !isSuiteApp(msg.app) || msg.v !== 1 || typeof msg.id !== "string" || !PEER_ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const rp = Number.isInteger(msg.rp) && msg.rp >= 1024 && msg.rp <= 65535 ? msg.rp : void 0;
    if (!this.listApps.has(msg.app)) {
      if (msg.q && rp) this.sendTo(this.message(false), address, this.opts.app, rp);
      return;
    }
    const prev = this.peers.get(msg.id);
    const apps = parseApps(msg.apps);
    const was = parseWas(msg.was, msg.id);
    const peer = {
      id: msg.id,
      name: cleanName(msg.name),
      ip: address,
      port,
      lastSeen: Date.now(),
      app: msg.app,
      ...apps ? { apps } : {},
      ...was ? { was } : {}
    };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name || prev.app !== peer.app || !sameJson(prev.apps, peer.apps) || !sameJson(prev.was, peer.was)) {
      this.emit("change");
    }
    if (msg.q) this.sendTo(this.message(false), address, msg.app, rp);
    if (msg.c === 1) this.emit("callback", msg.id);
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === "string" && IPV4_RE.test(ip) && nearby(ip)) this.probe(ip);
      }
    }
  }
  expire() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change");
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.scanQueue = null;
    this.transport?.close();
    this.transport = null;
  }
};

// ../termcore/src/net/network.ts
import net3 from "net";
import { EventEmitter as EventEmitter4 } from "events";

// ../termcore/src/net/framing.ts
import { EventEmitter as EventEmitter2 } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload2) {
  if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload2.length, 0);
  return Buffer.concat([header, payload2]);
}
var FrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len > MAX_FRAME) throw new FrameTooLargeError(len);
      if (this.buffer.length < 4 + len) break;
      frames.push(Buffer.from(this.buffer.subarray(4, 4 + len)));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
};
var FrameSocket = class extends EventEmitter2 {
  constructor(socket) {
    super();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      let frames;
      try {
        frames = this.decoder.push(chunk);
      } catch (err) {
        this.destroy(err);
        return;
      }
      for (const f of frames) this.deliver(f);
    });
    socket.on("error", (err) => this.finish(err));
    socket.on("close", () => this.finish(void 0));
  }
  decoder = new FrameDecoder();
  queue = [];
  waiter = null;
  streaming = false;
  closed = false;
  closeError;
  get isClosed() {
    return this.closed;
  }
  get remoteAddress() {
    return (this.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  }
  deliver(frame) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(frame);
    } else if (this.streaming) {
      this.emit("frame", frame);
    } else {
      this.queue.push(frame);
    }
  }
  read(timeoutMs) {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closeError ?? new Error("Connection closed"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Handshake timed out"));
      }, timeoutMs);
      this.waiter = {
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      };
    });
  }
  /** From now on, frames are delivered as events (including already buffered ones). */
  startStreaming() {
    this.streaming = true;
    const pending2 = this.queue;
    this.queue = [];
    for (const f of pending2) this.emit("frame", f);
  }
  send(payload2) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload2));
    return true;
  }
  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload2) {
    if (this.closed) return false;
    if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload2.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload2);
    this.socket.uncork();
    return ok;
  }
  /** Resolves once the socket's send buffer has room again (or the connection is gone). */
  drained() {
    if (this.closed || !this.socket.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.socket.off("drain", done);
        this.off("close", done);
        resolve();
      };
      this.socket.on("drain", done);
      this.on("close", done);
    });
  }
  /** Stops reading from the socket (the receiver's disk can't keep up). */
  pause() {
    this.socket.pause();
  }
  resume() {
    if (!this.closed) this.socket.resume();
  }
  /** Graceful close: buffered data is still sent. */
  end() {
    if (!this.closed) this.socket.end();
  }
  destroy(err) {
    this.socket.destroy();
    this.finish(err);
  }
  finish(err) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err ?? new Error("Connection closed"));
    }
    this.emit("close", err);
  }
};

// ../termcore/src/net/handshake.ts
import crypto4 from "crypto";

// ../termcore/src/net/channel.ts
import crypto3 from "crypto";
var TAG_LEN = 16;
var CipherState = class {
  constructor(key) {
    this.key = key;
    if (key.length !== 32) throw new Error("Key must be 32 bytes");
  }
  counter = 0n;
  nextNonce() {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.counter, 4);
    this.counter++;
    return nonce;
  }
  encrypt(plain) {
    const cipher = crypto3.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN) throw new Error("Frame too short");
    const decipher = crypto3.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
};

// ../termcore/src/net/handshake.ts
var HANDSHAKE_TIMEOUT = 5e3;
var XID_RE = /^[A-Za-z0-9_-]{12,32}$/;
var HandshakeError = class extends Error {
};
function parseHello(frame, protocol) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== protocol || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError(`Not a ${protocol.split("/")[0]} peer or incompatible version`);
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(protocol, role, transcript) {
  return Buffer.concat([Buffer.from(`${protocol} auth ${role}`), transcript]);
}
async function performHandshake(fs11, opts) {
  const { protocol, me, myName, initiator, xid } = opts;
  const timeoutMs = opts.timeoutMs ?? HANDSHAKE_TIMEOUT;
  const { privateKey: ephPriv, publicKey: ephPub } = crypto4.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto4.randomBytes(16);
  fs11.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: protocol, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs11.read(timeoutMs), protocol);
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto4.createHash("sha256").update(protocol).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto4.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto4.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto4.hkdfSync("sha256", shared, transcript, `${protocol} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto4.sign(null, authPayload(protocol, myRole, transcript), me.privateKey);
  fs11.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({
          pub: me.publicRaw.toString("base64url"),
          name: myName,
          sig: sig.toString("base64url"),
          ...initiator && xid ? { x: xid } : {}
        })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs11.read(timeoutMs)).toString("utf8"));
  } catch (err) {
    if (err instanceof Error && /timed out|closed/.test(err.message)) throw err;
    throw new HandshakeError("Authentication failed");
  }
  if (typeof auth.pub !== "string" || typeof auth.sig !== "string") {
    throw new HandshakeError("Authentication failed");
  }
  const peerPublicRaw = Buffer.from(auth.pub, "base64url");
  if (peerPublicRaw.length !== 32) throw new HandshakeError("Invalid identity key");
  let valid = false;
  try {
    valid = crypto4.verify(
      null,
      authPayload(protocol, peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  let peerXid;
  if (auth.x !== void 0) {
    if (initiator || typeof auth.x !== "string" || !XID_RE.test(auth.x)) throw new HandshakeError("Invalid transfer id");
    peerXid = auth.x;
  }
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv, ...peerXid ? { xid: peerXid } : {} };
}

// ../termcore/src/net/peer.ts
import { EventEmitter as EventEmitter3 } from "events";
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter3 {
  constructor(fs11, hs, initiator, parse, tag, expected) {
    super();
    this.fs = fs11;
    this.hs = hs;
    this.initiator = initiator;
    this.parse = parse;
    this.tag = tag;
    this.expected = expected;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs11.on("frame", (frame) => this.onFrame(frame));
    fs11.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
    this.timer = setInterval(() => this.tick(), PING_INTERVAL / 3);
    this.timer.unref();
  }
  peerId;
  peerPublicRaw;
  peerName;
  openedAt = Date.now();
  lastActivity = Date.now();
  rateCount = 0;
  rateStart = Date.now();
  timer;
  closed = false;
  /** Call only once all listeners are attached – otherwise early frames are lost. */
  start() {
    this.fs.startStreaming();
  }
  get remoteAddress() {
    return this.fs.remoteAddress;
  }
  /** The other side's port – for a connection we opened, the port they listen on. */
  get remotePort() {
    return this.fs.socket.remotePort ?? 0;
  }
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(Buffer.from(JSON.stringify(msg), "utf8")));
  }
  close(reason = "Connection closed", graceful = true) {
    if (this.closed) return;
    if (graceful) {
      this.send({ t: "bye" });
      this.fs.end();
      setTimeout(() => this.fs.destroy(), 1e3).unref();
    } else {
      this.fs.destroy();
    }
    this.finish(reason);
  }
  onFrame(frame) {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.rateStart > RATE_WINDOW) {
      this.rateStart = now;
      this.rateCount = 0;
    }
    if (++this.rateCount > RATE_MAX) {
      this.close("Peer is sending too much data", false);
      return;
    }
    let plain;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.close("Received tampered data", false);
      return;
    }
    this.lastActivity = now;
    const msg = this.parse(plain);
    if (!msg) return;
    if (msg.t === "ping") {
      this.send({ t: "pong" });
      return;
    }
    if (msg.t === "pong") return;
    if (msg.t === "bye") {
      this.close("Peer closed the connection", false);
      return;
    }
    this.emit("message", msg);
  }
  tick() {
    const idle = Date.now() - this.lastActivity;
    if (idle > IDLE_TIMEOUT) this.close("Timed out", false);
    else if (idle > PING_INTERVAL) this.send({ t: "ping" });
  }
  finish(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit("close", reason);
  }
};

// ../termcore/src/net/network.ts
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter4 {
  constructor(opts) {
    super();
    this.opts = opts;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  get me() {
    return this.opts.me;
  }
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net3.createServer((socket) => this.onIncoming(socket));
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve(server);
      });
    });
    try {
      this.server = await tryListen(preferredPort);
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      this.emit("log", `Port ${preferredPort} in use, using a free port`);
      this.server = await tryListen(0);
    }
    this.server.on("error", (err) => this.emit("log", `Server error: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  handshake(fs11, initiator, xid) {
    return performHandshake(fs11, { protocol: this.opts.protocol, me: this.opts.me, myName: this.opts.getName(), initiator, xid });
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately (unless acceptMismatch says otherwise).
   */
  async dial(host, port, expectedId, tag) {
    const fs11 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs11, true);
      let expected;
      if (expectedId && hs.peerId !== expectedId) {
        if (!this.opts.acceptMismatch?.(expectedId, hs.peerId)) throw new HandshakeError("Someone else is now reachable at this address");
        expected = expectedId;
      }
      return this.register(new Session(fs11, hs, true, this.opts.parse, tag, expected));
    } catch (err) {
      fs11.destroy();
      throw err;
    }
  }
  /** Opens a connection for one purpose (`xid`) to exactly this peer. */
  async dialPurpose(host, port, expectedId, xid) {
    const fs11 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs11, true, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError("Someone else is now reachable at this address");
      return { fs: fs11, hs, xid };
    } catch (err) {
      fs11.destroy();
      throw err;
    }
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net3.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error("Connection timed out"));
      }, DIAL_TIMEOUT);
      s.once("connect", () => {
        clearTimeout(timer);
        s.removeAllListeners("error");
        resolve(s);
      });
      s.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs11 = new FrameSocket(socket);
    try {
      const hs = await this.handshake(fs11, false);
      if (hs.xid) {
        if (!this.emit("purpose", { fs: fs11, hs, xid: hs.xid })) fs11.destroy();
      } else {
        this.register(new Session(fs11, hs, false, this.opts.parse));
      }
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs11.remoteAddress}: ${err.message}`);
      fs11.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const me = this.opts.me.id;
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = me < session.peerId ? me : session.peerId;
      const initiatorOf = (s) => s.initiator ? me : s.peerId;
      const keepExisting = initiatorOf(existing) === winner && initiatorOf(session) !== winner;
      if (keepExisting) {
        session.close("Duplicate connection", false);
        return existing;
      }
      this.sessions.set(session.peerId, session);
      existing.close("Duplicate connection", false);
    } else {
      this.sessions.set(session.peerId, session);
    }
    session.on("close", (reason) => {
      if (this.sessions.get(session.peerId) === session) {
        this.sessions.delete(session.peerId);
        this.emit("offline", session.peerId, reason);
      }
    });
    this.emit("session", session);
    session.start();
    return session;
  }
  disconnect(id) {
    this.sessions.get(id)?.close();
  }
  async stop() {
    for (const s of this.sessions.values()) s.close("App closed");
    await new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref();
    });
    this.server = null;
  }
};

// ../termcore/src/store/hub.ts
import fs8 from "fs";
import path11 from "path";

// ../termcore/src/friends/links.ts
import crypto5 from "crypto";
var B64_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
var B64_SIG_RE = /^[A-Za-z0-9_-]{86}$/;
var MAX_LINKS = 8;
function payload(old, next, ts) {
  return Buffer.from(`termhub/link/1
${old}
${next}
${ts}`);
}
function createLink(oldId, newId, ts = Date.now()) {
  const old = oldId.publicRaw.toString("base64url");
  const next = newId.publicRaw.toString("base64url");
  const p = payload(old, next, ts);
  return {
    v: 1,
    old,
    new: next,
    ts,
    so: crypto5.sign(null, p, oldId.privateKey).toString("base64url"),
    sn: crypto5.sign(null, p, newId.privateKey).toString("base64url")
  };
}
function parseLink(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  if (typeof o.old !== "string" || !B64_KEY_RE.test(o.old) || typeof o.new !== "string" || !B64_KEY_RE.test(o.new)) return null;
  if (o.old === o.new) return null;
  if (typeof o.so !== "string" || !B64_SIG_RE.test(o.so) || typeof o.sn !== "string" || !B64_SIG_RE.test(o.sn)) return null;
  if (typeof o.ts !== "number" || !Number.isSafeInteger(o.ts) || o.ts < 0) return null;
  return { v: 1, old: o.old, new: o.new, ts: o.ts, so: o.so, sn: o.sn };
}
function verifyLink(link) {
  try {
    const p = payload(link.old, link.new, link.ts);
    const oldKey = Buffer.from(link.old, "base64url");
    const newKey = Buffer.from(link.new, "base64url");
    if (oldKey.length !== 32 || newKey.length !== 32) return false;
    return crypto5.verify(null, p, publicKeyFromRaw(oldKey), Buffer.from(link.so, "base64url")) && crypto5.verify(null, p, publicKeyFromRaw(newKey), Buffer.from(link.sn, "base64url"));
  } catch {
    return false;
  }
}
var linkOldId = (l) => fingerprint(Buffer.from(l.old, "base64url"));
var linkNewId = (l) => fingerprint(Buffer.from(l.new, "base64url"));
function resolveId(id, byOld) {
  const seen = /* @__PURE__ */ new Set();
  let cur = id;
  while (byOld.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = byOld.get(cur);
  }
  return cur;
}

// ../termcore/src/store/files.ts
var ANIMATIONS = ["nonstop", "brief", "off"];
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var IPV4_RE2 = /^\d{1,3}(\.\d{1,3}){3}$/;
function parsePorts(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseApps2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, fields] of Object.entries(v)) {
    if (isSuiteApp(k) && fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length) {
      out[k] = fields;
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function compact(o) {
  for (const k of Object.keys(o)) if (o[k] === void 0) delete o[k];
  return o;
}
function parseFriend(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  if (!CONTACT_STATES.includes(o.state)) return null;
  const now = Date.now();
  return compact({
    id: o.id,
    publicKey: typeof o.publicKey === "string" ? o.publicKey : "",
    name: cleanName(o.name),
    alias: typeof o.alias === "string" && o.alias.trim() ? cleanName(o.alias) : void 0,
    state: o.state,
    color: normalizeColor(o.color) ?? void 0,
    lastIp: typeof o.lastIp === "string" && IPV4_RE2.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen),
    lastActivity: num(o.lastActivity) ?? now,
    createdAt: num(o.createdAt) ?? now,
    status: isStatus(o.status) && o.status !== "available" ? o.status : void 0,
    statusMsg: cleanStatusMsg(o.statusMsg),
    apps: parseApps2(o.apps)
  });
}
function parseKnownPeer(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  return compact({
    id: o.id,
    name: cleanName(o.name),
    lastIp: typeof o.lastIp === "string" && IPV4_RE2.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen)
  });
}
function uniqueById(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of list) {
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
function parseFriendsFile(raw) {
  const list = raw?.friends;
  return { v: 1, friends: Array.isArray(list) ? uniqueById(list.map(parseFriend)) : [] };
}
function parsePeersFile(raw) {
  const list = raw?.peers;
  return { v: 1, peers: Array.isArray(list) ? uniqueById(list.map(parseKnownPeer)) : [] };
}
function parseProfile(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim()) return null;
  return compact({
    v: 1,
    name: cleanName(o.name),
    color: normalizeColor(o.color) ?? void 0,
    status: isStatus(o.status) ? o.status : "available",
    statusMsg: cleanStatusMsg(o.statusMsg)
  });
}
var DEFAULT_SETTINGS = { v: 1, animations: "brief", notifications: true };
function parseSettings(raw) {
  const o = raw ?? {};
  return compact({
    v: 1,
    accent: normalizeColor(o.accent) ?? void 0,
    animations: ANIMATIONS.includes(o.animations) ? o.animations : DEFAULT_SETTINGS.animations,
    notifications: typeof o.notifications === "boolean" ? o.notifications : DEFAULT_SETTINGS.notifications
  });
}
function parseLinksFile(raw) {
  const o = raw ?? {};
  const links = (v) => Array.isArray(v) ? v.map(parseLink).filter((l) => l !== null) : [];
  return { v: 1, mine: links(o.mine), known: links(o.known) };
}

// ../termcore/src/store/migrate.ts
import crypto6 from "crypto";
import fs6 from "fs";
import path9 from "path";

// ../termcore/src/store/lock.ts
import fs5 from "fs";
import path8 from "path";
var sleepCell = new Int32Array(new SharedArrayBuffer(4));
var sleepSync = (ms) => void Atomics.wait(sleepCell, 0, 0, ms);
function readLock2(file) {
  try {
    const o = JSON.parse(fs5.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.ts === "number" && typeof o.token === "string" ? o : null;
  } catch {
    return null;
  }
}
function withLock(lockFile, fn, timings = {}) {
  const timeoutMs = timings.timeoutMs ?? 1e4;
  const staleMs = timings.staleMs ?? 15e3;
  ensureDir(path8.dirname(lockFile));
  const mine = { pid: process.pid, ts: Date.now(), token: Math.random().toString(36).slice(2) };
  const start3 = Date.now();
  let delay = 1;
  for (; ; ) {
    mine.ts = Date.now();
    try {
      fs5.writeFileSync(lockFile, JSON.stringify(mine), { flag: "wx", mode: 384 });
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock2(lockFile);
    const stale = holder ? holder.pid !== process.pid && !pidAlive(holder.pid) || Date.now() - holder.ts > staleMs : Date.now() - start3 > 200;
    if (stale) {
      const again = readLock2(lockFile);
      if (!holder || again && again.token === holder.token) {
        try {
          fs5.unlinkSync(lockFile);
        } catch {
        }
      }
      continue;
    }
    if (Date.now() - start3 > timeoutMs) throw new Error(`Timed out waiting for ${path8.basename(lockFile)}`);
    sleepSync(delay);
    delay = Math.min(delay * 2, 25);
  }
  try {
    return fn();
  } finally {
    if (readLock2(lockFile)?.token === mine.token) {
      try {
        fs5.unlinkSync(lockFile);
      } catch {
      }
    }
  }
}

// ../termcore/src/store/migrate.ts
var LEGACY_FILES = ["identity.json", "config.json", "contacts.json", "peers.json"];
var BASE_CONTACT_FIELDS = /* @__PURE__ */ new Set(["id", "publicKey", "name", "alias", "state", "lastIp", "lastPort", "lastSeen", "lastActivity", "createdAt"]);
var lockOf = (paths, file) => path9.join(paths.locksDir, `${path9.basename(file)}.lock`);
var hash = (s) => s === null ? void 0 : crypto6.createHash("sha256").update(s).digest("hex").slice(0, 32);
function readText(file) {
  try {
    return fs6.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
function parseArray(raw) {
  if (raw === null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function readLegacy(app, dir) {
  const idRaw = readJson(path9.join(dir, "identity.json"), null);
  const identityFile = isIdentityFile(idRaw) ? idRaw : null;
  let identity = null;
  try {
    identity = identityFile ? identityFromFile(identityFile) : null;
  } catch {
    identity = null;
  }
  let config = null;
  try {
    const c2 = readJson(path9.join(dir, "config.json"), null);
    config = c2 && typeof c2 === "object" ? c2 : null;
  } catch {
    config = null;
  }
  return {
    app,
    dir,
    identityFile: identity ? identityFile : null,
    identity,
    config,
    contactsRaw: readText(path9.join(dir, "contacts.json")),
    peersRaw: readText(path9.join(dir, "peers.json"))
  };
}
function friendFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const fields = {};
  for (const [k, v] of Object.entries(c2)) {
    if (!BASE_CONTACT_FIELDS.has(k) && v !== void 0 && v !== null && v !== false && v !== 0 && v !== "") fields[k] = v;
  }
  const port = Number(c2.lastPort);
  return parseFriend({
    ...c2,
    ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0,
    apps: Object.keys(fields).length ? { [app]: fields } : void 0
  });
}
function peerFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const port = Number(c2.lastPort);
  return parseKnownPeer({ ...c2, ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0 });
}
function mergeInto(map, entries, merge, skip, mapId) {
  for (const e of entries) {
    if (!e) continue;
    const id = mapId(e.id);
    if (skip.has(id)) continue;
    const entry = id === e.id ? e : { ...e, id };
    const prev = map.get(id);
    map.set(id, prev ? merge(prev, entry) : entry);
  }
}
function backup(paths, l, suffix = "") {
  const dest = path9.join(paths.legacyDir, l.app);
  for (const f of LEGACY_FILES) {
    const src = path9.join(l.dir, f);
    if (!fs6.existsSync(src)) continue;
    ensureDir(dest);
    const target = path9.join(dest, suffix ? f.replace(/\.json$/, `.${suffix}.json`) : f);
    if (!suffix && fs6.existsSync(target)) continue;
    fs6.copyFileSync(src, target);
    fs6.chmodSync(target, 384);
  }
}
function migrate(paths) {
  return withLock(path9.join(paths.locksDir, "migration.lock"), () => fs6.existsSync(paths.identity) ? catchUp(paths) : fullMigration(paths), {
    timeoutMs: 6e4,
    staleMs: 12e4
  });
}
function fullMigration(paths) {
  const legacy = LEGACY_APPS.map((app) => readLegacy(app, paths.legacy[app]));
  const masterSrc = legacy.find((l) => l.identity);
  const nothing = { migrated: false, caughtUp: [], master: null, links: 0, friends: 0 };
  if (!masterSrc) return nothing;
  const masterFile = masterSrc.identityFile ?? generateIdentityFile();
  const master = identityFromFile(masterFile);
  const now = Date.now();
  const links = [];
  const myIds = /* @__PURE__ */ new Set([master.id]);
  for (const l of legacy) {
    if (!l.identity) continue;
    myIds.add(l.identity.id);
    if (l.identity.id !== master.id && !links.some((x) => linkOldId(x) === l.identity.id)) links.push(createLink(l.identity, master, now));
  }
  const friends = /* @__PURE__ */ new Map();
  const peers = /* @__PURE__ */ new Map();
  for (const l of legacy) {
    mergeInto(friends, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(l.app, c2)), mergeFriends, myIds, (id) => id);
    mergeInto(peers, parseArray(l.peersRaw).map((p) => peerFromLegacy(l.app, p)), mergePeers, myIds, (id) => id);
  }
  const pick = (get) => {
    for (const l of legacy) {
      const v = get(l);
      if (v !== void 0) return v;
    }
    return void 0;
  };
  const nameRaw = pick((l) => typeof l.config?.name === "string" && l.config.name.trim() ? l.config.name : void 0);
  const name = nameRaw ? cleanName(nameRaw) : void 0;
  const effects = legacy[0]?.config?.effects;
  const settings = {
    v: 1,
    animations: ANIMATIONS.includes(effects) ? effects : "brief",
    notifications: pick((l) => typeof l.config?.notifications === "boolean" ? l.config.notifications : void 0) ?? true
  };
  for (const l of legacy) backup(paths, l);
  ensureDir(paths.dir);
  writeJsonAtomic(paths.friends, parseFriendsFile({ friends: [...friends.values()] }));
  writeJsonAtomic(paths.peers, parsePeersFile({ peers: [...peers.values()] }));
  if (!fs6.existsSync(paths.settings)) writeJsonAtomic(paths.settings, settings);
  writeJsonAtomic(paths.links, { v: 1, mine: links, known: [] });
  if (name) writeJsonAtomic(paths.profile, { v: 1, name, status: "available" });
  const record = {
    v: 1,
    at: now,
    master: { app: masterSrc.app, id: master.id },
    sources: Object.fromEntries(legacy.map((l) => [l.app, sourceOf(l)]))
  };
  writeJsonAtomic(paths.migration, record);
  writeJsonAtomic(paths.identity, masterFile);
  return { migrated: true, caughtUp: [], master: record.master, links: links.length, friends: friends.size, ...name ? { name } : {} };
}
var sourceOf = (l) => ({
  ...l.identity ? { id: l.identity.id } : {},
  ...l.contactsRaw !== null ? { contacts: hash(l.contactsRaw) } : {},
  ...l.peersRaw !== null ? { peers: hash(l.peersRaw) } : {}
});
function catchUp(paths) {
  const master = readIdentity(paths.identity);
  const record = readJson(paths.migration, null);
  const report = { migrated: false, caughtUp: [], master: record?.master ?? null, links: 0, friends: 0 };
  if (!master) return report;
  const sources = { ...record?.sources };
  const linksFile = parseLinksFile(readJson(paths.links, null));
  const byOld = new Map([...linksFile.mine, ...linksFile.known].map((l) => [linkOldId(l), linkNewId(l)]));
  const myIds = /* @__PURE__ */ new Set([master.id, ...linksFile.mine.map(linkOldId)]);
  let changedRecord = !record;
  let friendsTouched = false;
  for (const app of LEGACY_APPS) {
    const l = readLegacy(app, paths.legacy[app]);
    const seen = sources[app] ?? {};
    const now = sourceOf(l);
    if (l.identity && l.identity.id !== master.id && !byOld.has(l.identity.id)) {
      const link = createLink(l.identity, master);
      linksFile.mine.push(link);
      byOld.set(l.identity.id, master.id);
      myIds.add(l.identity.id);
      report.links++;
    }
    if (l.identity) myIds.add(l.identity.id);
    const contactsChanged = now.contacts !== void 0 && now.contacts !== seen.contacts;
    const peersChanged = now.peers !== void 0 && now.peers !== seen.peers;
    if (contactsChanged || peersChanged) {
      backup(paths, l, String(Date.now()));
      const mapId = (id) => resolveId(id, byOld);
      if (contactsChanged) {
        withLock(lockOf(paths, paths.friends), () => {
          const file = parseFriendsFile(readJson(paths.friends, null));
          const map = new Map(file.friends.map((f) => [f.id, f]));
          mergeInto(map, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(app, c2)), mergeFriends, myIds, mapId);
          writeJsonAtomic(paths.friends, { v: 1, friends: [...map.values()] });
        });
        friendsTouched = true;
      }
      if (peersChanged) {
        withLock(lockOf(paths, paths.peers), () => {
          const file = parsePeersFile(readJson(paths.peers, null));
          const map = new Map(file.peers.map((p) => [p.id, p]));
          mergeInto(map, parseArray(l.peersRaw).map((p) => peerFromLegacy(app, p)), mergePeers, myIds, mapId);
          writeJsonAtomic(paths.peers, { v: 1, peers: [...map.values()] });
        });
      }
      report.caughtUp.push(app);
    }
    if (JSON.stringify(now) !== JSON.stringify(seen)) {
      sources[app] = now;
      changedRecord = true;
    }
  }
  if (report.links) {
    withLock(lockOf(paths, paths.links), () => {
      const current = parseLinksFile(readJson(paths.links, null));
      const mine = [...current.mine, ...linksFile.mine.filter((l) => !current.mine.some((m) => m.old === l.old))];
      writeJsonAtomic(paths.links, { ...current, mine });
    });
  }
  if (changedRecord || report.links) {
    writeJsonAtomic(paths.migration, {
      v: 1,
      at: record?.at ?? Date.now(),
      master: record?.master ?? { app: "new", id: master.id },
      sources
    });
  }
  report.friends = friendsTouched ? parseFriendsFile(readJson(paths.friends, null)).friends.length : 0;
  return report;
}

// ../termcore/src/store/shared.ts
import { EventEmitter as EventEmitter5 } from "events";
import fs7 from "fs";
import path10 from "path";
var DEBOUNCE_MS = 30;
var POLL_MS = 1500;
var stampOf = (file) => {
  try {
    const s = fs7.statSync(file);
    return { mtimeMs: s.mtimeMs, size: s.size, ino: s.ino };
  } catch {
    return null;
  }
};
var sameStamp = (a, b) => a === b || !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino;
var SharedFile = class extends EventEmitter5 {
  constructor(file, opts) {
    super();
    this.file = file;
    this.opts = opts;
    this.lockFile = path10.join(opts.locksDir, `${path10.basename(file)}.lock`);
    this.stamp = stampOf(file);
    this.value = opts.parse(readJson(file, null));
    this.text = JSON.stringify(this.value);
  }
  value;
  text;
  stamp;
  watcher = null;
  poll = null;
  debounce = null;
  lockFile;
  get() {
    return this.value;
  }
  /** Reads the file again if it changed on disk. Returns whether the value changed. */
  refresh() {
    const stamp = stampOf(this.file);
    if (sameStamp(stamp, this.stamp)) return false;
    this.stamp = stamp;
    return this.adopt(this.opts.parse(readJson(this.file, null)), true);
  }
  adopt(value, external) {
    const text = JSON.stringify(value);
    if (text === this.text) return false;
    this.value = value;
    this.text = text;
    this.emit("change", value, external);
    return true;
  }
  /**
   * Locked read-modify-write. `fn` gets a private copy of the newest value; it may change it in
   * place (return nothing) or return a replacement. Nothing is written if nothing changed.
   * Returns the new value.
   */
  update(fn) {
    return withLock(this.lockFile, () => {
      const current = this.opts.parse(readJson(this.file, null));
      const draft = structuredClone(current);
      const next = this.opts.parse(fn(draft) ?? draft);
      const text = JSON.stringify(next);
      if (text !== JSON.stringify(current)) {
        writeFileAtomic(this.file, JSON.stringify(next, null, 2));
      }
      this.stamp = stampOf(this.file);
      if (JSON.stringify(current) !== this.text) this.adopt(current, true);
      this.adopt(next, false);
      return next;
    });
  }
  /** Writes a value as is (under the lock) – for files only one process creates (migration). */
  replace(value) {
    this.update(() => value);
  }
  watch() {
    if (this.watcher || this.poll) return;
    const schedule = () => {
      if (this.debounce) return;
      this.debounce = setTimeout(() => {
        this.debounce = null;
        this.refresh();
      }, DEBOUNCE_MS);
      this.debounce.unref();
    };
    try {
      fs7.mkdirSync(path10.dirname(this.file), { recursive: true, mode: 448 });
      const name = path10.basename(this.file);
      this.watcher = fs7.watch(path10.dirname(this.file), { persistent: false }, (_ev, f) => {
        if (!f || f === name) schedule();
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      this.watcher = null;
    }
    this.poll = setInterval(() => this.refresh(), POLL_MS);
    this.poll.unref();
  }
  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    this.poll = null;
    this.debounce = null;
  }
};

// ../termcore/src/store/hub.ts
var Hub = class {
  /** Opens an existing hub (after `prepare` and onboarding). Throws if there's no profile yet. */
  constructor(paths) {
    this.paths = paths;
    const identity = readIdentity(paths.identity);
    if (!identity) throw new Error("No profile found");
    this.identity = identity;
    const locksDir = paths.locksDir;
    this.profile = new SharedFile(paths.profile, { locksDir, parse: parseProfile });
    if (!this.profile.get()) throw new Error("No profile found");
    this.friends = new SharedFile(paths.friends, { locksDir, parse: parseFriendsFile });
    this.peers = new SharedFile(paths.peers, { locksDir, parse: parsePeersFile });
    this.settings = new SharedFile(paths.settings, { locksDir, parse: parseSettings });
    this.links = new SharedFile(paths.links, { locksDir, parse: parseLinksFile });
  }
  identity;
  profile;
  friends;
  peers;
  settings;
  links;
  /**
   * Run once at startup, before anything reads the hub: migrates the apps' old data on the
   * first start of a new version (see migrate.ts).
   */
  static prepare(paths) {
    return migrate(paths);
  }
  /** Is there a complete profile (identity + name)? Otherwise the app shows its onboarding. */
  static hasProfile(paths) {
    return readIdentity(paths.identity) !== null && parseProfile(readJson(paths.profile, null)) !== null;
  }
  /** The name, if there's a profile. */
  static profileName(paths) {
    return parseProfile(readJson(paths.profile, null))?.name ?? null;
  }
  /** Creates identity (if there's none yet) and profile on first launch (termhub also asks for a color). */
  static createProfile(paths, name, color) {
    const identity = loadOrCreateIdentity(paths.identity);
    const prev = parseProfile(readJson(paths.profile, null));
    const hex = normalizeColor(color);
    writeJsonAtomic(paths.profile, { ...prev ?? { v: 1, status: "available" }, name: cleanName(name), ...hex ? { color: hex } : {} });
    return identity;
  }
  /** Follows file changes by the other apps. */
  watch() {
    for (const f of this.files()) f.watch();
  }
  close() {
    for (const f of this.files()) {
      f.unwatch();
      f.removeAllListeners();
    }
  }
  files() {
    return [this.profile, this.friends, this.peers, this.settings, this.links];
  }
  get me() {
    return this.profile.get();
  }
  setProfile(patch) {
    return this.profile.update((p) => {
      const next = { ...p ?? { v: 1, name: "Unknown", status: "available" } };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  setSettings(patch) {
    return this.settings.update((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  /** My own links (sent to everyone I connect to). */
  myLinks() {
    return this.links.get().mine;
  }
  /** My old ids. */
  myOldIds() {
    return this.myLinks().map(linkOldId);
  }
  /** Remembers a verified link of someone else. */
  addKnownLink(link) {
    this.links.update((l) => {
      if (l.known.some((k) => k.old === link.old && k.new === link.new)) return;
      l.known = [...l.known.filter((k) => k.old !== link.old), link];
    });
  }
  /** old id → new id, for my links and everyone else's. */
  linkMap() {
    const { mine, known } = this.links.get();
    return new Map([...mine, ...known].map((l) => [linkOldId(l), linkNewId(l)]));
  }
};
function rekeyedFile(appHome) {
  return path11.join(appHome, "rekeyed.json");
}
function applyLinks(hub, appHome, rekey) {
  const file = rekeyedFile(appHome);
  const done = new Set(readJson(file, []).filter((x) => typeof x === "string"));
  const applied = [];
  for (const [oldId, newId] of hub.linkMap()) {
    if (done.has(`${oldId}>${newId}`)) continue;
    rekey(oldId, newId);
    done.add(`${oldId}>${newId}`);
    applied.push(oldId);
  }
  if (applied.length) {
    fs8.mkdirSync(appHome, { recursive: true, mode: 448 });
    writeJsonAtomic(file, [...done]);
  }
  return applied;
}
function migrationNotice(friends) {
  return `Your profile and ${friends === 1 ? "1 friend" : `${friends} friends`} moved to ~/.termhub \u2013 shared by termchat, keyrace, termdrop and termhub`;
}

// ../termcore/src/friends/wire.ts
var NO_EXTENSION = { parse: () => null };
function parseJsonObject(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function parseWire(buf, ext = NO_EXTENSION) {
  const o = parseJsonObject(buf);
  if (!o || typeof o.t !== "string") return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      const color = normalizeColor(o.color);
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
        ...color ? { color } : {}
      };
    }
    case "presence": {
      if (typeof o.away !== "boolean") return null;
      const msg = cleanStatusMsg(o.msg);
      return {
        ...ext.presence?.(o) ?? {},
        t: "presence",
        away: o.away,
        ...isStatus(o.status) ? { status: o.status } : {},
        ...msg ? { msg } : {}
      };
    }
    case "links": {
      if (!Array.isArray(o.links) || o.links.length > MAX_LINKS) return null;
      const links = o.links.map(parseLink).filter((l) => l !== null);
      return { t: "links", links };
    }
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return ext.parse(o);
  }
}

// ../termcore/src/friends/net.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var RELINK_TIMEOUT = 5e3;
var FIRST_MESSAGE_WAIT = 1e3;
var FriendNet = class {
  constructor(opts) {
    this.opts = opts;
    const { hub, app } = opts;
    this.hub = hub;
    this.app = app;
    this.identity = hub.identity;
    this.contacts = new ContactBook(hub.friends, app.name);
    this.peerBook = new PeerBook(hub.peers, app.name);
    this.lastStates = statesOf(hub.friends.get());
    this.network = new Network({
      protocol: app.protocol,
      me: this.identity,
      getName: () => this.name,
      parse: (plain) => parseWire(plain, opts.wire),
      acceptMismatch: (expected, actual) => (!!this.contacts.get(expected) || !!this.peerBook.get(expected)) && this.contacts.get(actual)?.state !== "blocked"
    });
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      discovery: () => this.discoveryRef,
      stateOf: (id) => this.contacts.get(id)?.state,
      lastAddress: (id) => {
        const c2 = this.contacts.get(id);
        if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort };
        const p = this.peerBook.get(id);
        return p?.lastIp && p.lastPort ? { ip: p.lastIp, port: p.lastPort } : null;
      },
      candidates: () => {
        const ids = this.contacts.all().filter((c2) => c2.state === "accepted" || c2.state === "outgoing").map((c2) => c2.id);
        return [...ids, ...opts.hooks.extraDialIds?.() ?? []];
      },
      alsoWants: (id) => opts.hooks.alsoWants?.(id) ?? false,
      log: (l) => this.log(l),
      unreachable: (id, info) => this.event({ kind: "unreachable", id, who: this.peerName(id), ...info }),
      portOf: (p) => this.ownPort(p)
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("purpose", (c2) => opts.hooks.purpose ? opts.hooks.purpose(c2) : c2.fs.destroy());
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
    hub.friends.on("change", (v, external) => {
      const prev = this.lastStates;
      this.lastStates = statesOf(v);
      if (external && this.started) this.syncFromOthers(prev, this.lastStates);
      this.changed();
    });
    hub.peers.on("change", () => this.changed());
    hub.profile.on("change", () => this.onProfileChanged());
    hub.settings.on("change", (s) => {
      opts.hooks.settings?.(s);
      this.changed();
    });
    hub.links.on("change", () => this.runRekey());
  }
  identity;
  contacts;
  peerBook;
  network;
  dialer;
  hub;
  app;
  discoveryRef = null;
  focused = true;
  presenceMap = /* @__PURE__ */ new Map();
  lastStates;
  unregisterRun = null;
  started = false;
  /** Sessions with peers we don't know yet: our state waits for their first message. */
  awaitingFirst = /* @__PURE__ */ new WeakSet();
  // ───────────── Lifecycle ─────────────
  async start() {
    const { opts } = this;
    await this.network.start(opts.port ?? this.app.tcpPort);
    this.started = true;
    const udpPort = opts.discoveryPort ?? this.app.udpPort;
    this.unregisterRun = registerRun(this.hub.paths.runDir, { app: this.app.name, port: this.network.port, udp: udpPort, version: this.app.version });
    this.hub.watch();
    this.runRekey();
    if (opts.discovery !== false) {
      const d = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...opts.discoveryOptions,
        app: this.app.name,
        udpPort,
        apps: () => runningPorts(this.hub.paths.runDir),
        was: () => this.hub.myOldIds(),
        hints: () => this.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discoveryRef = d;
      d.on("change", () => this.onDiscovered());
      d.on("log", (l) => this.log(l));
      d.on("callback", (id) => this.dialer.onCallback(id));
      d.start();
    }
    this.dialer.start(opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.started = false;
    this.dialer.stop();
    this.discoveryRef?.stop();
    await this.network.stop();
    this.hub.close();
    this.unregisterRun?.();
    this.unregisterRun = null;
  }
  get discovery() {
    return this.discoveryRef;
  }
  // ───────────── Me ─────────────
  get profile() {
    return this.hub.me;
  }
  get name() {
    return this.profile.name;
  }
  get me() {
    const p = this.profile;
    return {
      id: this.identity.id,
      name: p.name,
      color: p.color,
      status: p.status,
      statusMsg: p.statusMsg,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discoveryRef !== null,
      scanning: this.discoveryRef?.scanning ?? false
    };
  }
  get settings() {
    return this.hub.settings.get();
  }
  /** Do not disturb: no desktop notifications, invites and offers wait quietly. */
  get dnd() {
    return this.profile.status === "dnd";
  }
  get animations() {
    return this.settings.animations;
  }
  notificationsEnabled() {
    return this.settings.notifications;
  }
  setNotifications(on) {
    this.hub.setSettings({ notifications: on });
  }
  setAnimations(mode) {
    this.hub.setSettings({ animations: mode });
  }
  setName(name) {
    const clean = cleanName(name);
    this.hub.setProfile({ name: clean });
    return clean;
  }
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }
  get isFocused() {
    return this.focused;
  }
  /** Desktop banner – only while the terminal is in the background, notifications are on and we're not in dnd. */
  notify(title, body) {
    if (this.focused || !this.notificationsEnabled() || this.dnd) return;
    if (this.opts.notify) this.opts.notify(title, body);
    else notify(title, body, this.app.name);
  }
  // ───────────── Queries ─────────────
  isOnline(id) {
    return this.network.isOnline(id);
  }
  presenceOf(id) {
    return this.isOnline(id) ? this.presenceMap.get(id) : void 0;
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
  }
  /**
   * Our app's TCP port on a discovered peer's computer: the one it announced if it is our app,
   * else from the list of apps running there (`apps`). termhub sees people through every app.
   */
  ownPort(p) {
    return p.app === this.app.name ? p.port : p.apps?.[this.app.name];
  }
  /** The discovered peer that is (or was, see links) `id`. */
  discovered(id) {
    return this.discoveryRef?.find(id);
  }
  /** People on the network running this app who aren't friends (an old id they announce counts). */
  nearby() {
    return [...this.discoveryRef?.peers.values() ?? []].filter((p) => !this.contacts.get(p.id) && !(p.was ?? []).some((w) => this.contacts.get(w))).sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  send(id, msg) {
    return this.network.get(id)?.send(msg) ?? false;
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discoveryRef?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      let result = "pending";
      if (existing.state === "incoming") {
        this.accept(id);
        result = "accepted";
      } else if (existing.state === "declined" || existing.state === "blocked") {
        this.setState(id, "outgoing");
        result = "again";
      }
      this.connect(id);
      return result;
    }
    if (!p) throw new Error("They are no longer nearby");
    const port = this.ownPort(p);
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, ...port ? { lastPort: port } : {} });
    this.contacts.setPorts(id, { ...p.apps, [p.app]: p.port });
    this.connect(id);
    this.changed();
    return "sent";
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = this.app.tcpPort) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  /** Accepts a request. False if there's none from them. */
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return false;
    this.setState(id, "accepted");
    this.connect(id);
    return true;
  }
  /** Declines a request (or ends a friendship without a word): they're told, the entry is removed. */
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Declined");
    }
    this.contacts.remove(id);
    this.changed();
    return c2;
  }
  block(id, patch = {}) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    this.contacts.upsert(id, { ...patch, state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.changed();
    return c2;
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return void 0;
    this.setState(id, "outgoing");
    this.connect(id);
    return c2;
  }
  /** Removes a friend; they see it as "removed you". */
  remove(id) {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.dialer.connect(id);
  }
  tryDial(id) {
    this.dialer.tryDial(id);
  }
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    if (!s) return;
    const c2 = this.contacts.get(id);
    const color = this.profile.color;
    s.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port, ...color ? { color } : {} });
  }
  // ───────────── Presence ─────────────
  ownPresence() {
    const p = this.profile;
    return {
      ...this.opts.hooks.presenceExtra?.() ?? {},
      t: "presence",
      away: !this.focused,
      ...p.status !== "available" ? { status: p.status } : {},
      ...p.statusMsg ? { msg: p.statusMsg } : {}
    };
  }
  sendPresence(id) {
    this.network.get(id)?.send(this.ownPresence());
  }
  broadcastPresence() {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }
  // ───────────── Internals ─────────────
  changed() {
    this.opts.hooks.changed();
  }
  log(line) {
    this.opts.hooks.log?.(line);
  }
  event(e) {
    this.opts.hooks.event?.(e);
  }
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    for (const ip of this.opts.hooks.extraHints?.() ?? []) ips.add(ip);
    return [...ips];
  }
  onDiscovered() {
    const d = this.discoveryRef;
    if (!d) return;
    const seen = [];
    for (const p of d.peers.values()) {
      const port = this.ownPort(p);
      for (const id of [p.id, ...p.was ?? []]) {
        const c2 = this.contacts.get(id);
        if (c2 && (c2.lastIp !== p.ip || port && c2.lastPort !== port)) {
          this.contacts.upsert(id, { lastIp: p.ip, ...port ? { lastPort: port } : {} });
        }
        if (c2 && (p.apps || p.app !== this.app.name)) this.contacts.setPorts(id, { ...p.apps, [p.app]: p.port });
        const known = this.peerBook.get(id);
        if (known && (known.lastIp !== p.ip || port && known.lastPort !== port)) this.peerBook.update(id, { lastIp: p.ip, ...port ? { lastPort: port } : {} });
        seen.push(id);
      }
    }
    this.dialer.discovered(seen);
    this.changed();
  }
  onProfileChanged() {
    if (!this.started) return this.changed();
    for (const id of this.network.sessions.keys()) {
      this.sendState(id);
      this.sendPresence(id);
    }
    this.discoveryRef?.announce(false);
    this.changed();
  }
  /** Another app changed the friend list: tell our peers what changed for them. */
  syncFromOthers(prev, next) {
    for (const id of /* @__PURE__ */ new Set([...prev.keys(), ...next.keys()])) {
      const before = prev.get(id);
      const after = next.get(id);
      if (before === after) continue;
      const s = this.network.get(id);
      if (after === void 0) {
        if (s) {
          s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
          if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
        }
        continue;
      }
      if (after === "blocked") {
        s?.close("Blocked");
        continue;
      }
      if (relStateFor(before ?? null) !== relStateFor(after)) this.sendState(id);
      if (after === "accepted" || after === "outgoing") this.dialer.connect(id);
    }
  }
  runRekey() {
    const rekey = this.opts.hooks.rekey;
    if (!rekey) return;
    try {
      if (applyLinks(this.hub, this.opts.paths.home, rekey).length) this.changed();
    } catch (err) {
      this.log(`Couldn't update data for new ids: ${err.message}`);
    }
  }
  onSession(s) {
    const id = s.peerId;
    let c2 = this.contacts.get(id);
    if (c2?.state === "blocked") {
      s.close("Blocked", false);
      return;
    }
    this.dialer.connected(id);
    if (s.tag === "request") {
      if (!c2) {
        c2 = this.contacts.upsert(id, { publicKey: "", name: s.peerName, state: "outgoing" });
        this.event({ kind: "requestSent", id, who: s.peerName });
      } else if (c2.state === "incoming") {
        this.accept(id);
      } else if (c2.state === "declined") {
        this.contacts.upsert(id, { state: "outgoing" });
      }
    }
    if (c2) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now()
      });
    }
    s.on("message", (m) => this.onWire(s, m));
    if (s.expected) {
      const expected = s.expected;
      setTimeout(() => {
        if (s.isOpen && this.contacts.get(expected) && !this.contacts.get(id)) s.close("Someone else is now reachable at this address");
      }, this.opts.relinkTimeoutMs ?? RELINK_TIMEOUT).unref();
      s.on("close", () => {
        if (this.contacts.get(expected)) this.dialer.failed(expected);
      });
    } else if (!c2 && !this.opts.hooks.keepUnknown?.(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    const links = this.hub.myLinks();
    if (links.length) s.send({ t: "links", links });
    if (c2) this.sendState(id);
    else {
      this.awaitingFirst.add(s);
      setTimeout(() => this.flushInitialState(s), FIRST_MESSAGE_WAIT).unref();
    }
    const own = this.ownPresence();
    if (Object.keys(own).length > 2 || own.away) this.sendPresence(id);
    this.opts.hooks.session?.(s);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.presenceMap.delete(id);
    this.opts.hooks.offline?.(id);
    if (this.contacts.get(id)) this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  flushInitialState(s) {
    if (!this.awaitingFirst.has(s)) return;
    this.awaitingFirst.delete(s);
    if (s.isOpen && this.network.get(s.peerId) === s) this.sendState(s.peerId);
  }
  onWire(s, m) {
    try {
      this.handleWire(s, m);
    } finally {
      this.flushInitialState(s);
    }
  }
  handleWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    const base = m;
    switch (base.t) {
      case "links":
        return this.onLinks(s, base.links);
      case "state":
        return this.onState(s, base);
      case "decline": {
        let declined = false;
        const c2 = this.contacts.mutate(id, (cur) => {
          if (cur?.state !== "outgoing") return void 0;
          declined = true;
          return { state: "declined" };
        });
        if (declined && c2) {
          this.event({ kind: "declinedUs", id, who: displayName(c2) });
          this.changed();
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) return;
        const { t: _t, away, status, msg, ...extra } = base;
        const next = { away, status: status ?? "available", ...msg ? { msg } : {}, extra };
        if (JSON.stringify(next) === JSON.stringify(this.presenceMap.get(id))) return;
        this.presenceMap.set(id, next);
        this.rememberStatus(id, next);
        this.opts.hooks.presence?.(id, next);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.opts.hooks.message(s, m);
    }
  }
  /** Keeps a friend's status in friends.json, so termhub and our other apps know it without a session. */
  rememberStatus(id, p) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const status = p.status === "available" ? void 0 : p.status;
    if ((c2.status ?? void 0) === status && c2.statusMsg === p.msg) return;
    this.contacts.upsert(id, { status, statusMsg: p.msg });
  }
  /** Their links: an old id we know is them now. Only links to the session's own key count. */
  onLinks(s, links) {
    let changed = false;
    for (const link of links) {
      if (linkNewId(link) !== s.peerId || !verifyLink(link)) continue;
      const oldId = linkOldId(link);
      if (oldId === s.peerId || oldId === this.identity.id) continue;
      const friend = this.contacts.get(oldId);
      const known = this.peerBook.get(oldId);
      if (!friend && !known && s.expected !== oldId && !this.opts.hooks.knowsId?.(oldId)) continue;
      this.hub.addKnownLink(link);
      if (friend) this.contacts.relink(oldId, s.peerId, link.new);
      if (known) this.peerBook.relink(oldId, s.peerId);
      this.dialer.connected(oldId);
      this.event({ kind: "linked", oldId, id: s.peerId, who: this.peerName(s.peerId) });
      this.log(`${oldId} is now ${s.peerId}`);
      changed = true;
    }
    if (changed) {
      this.runRekey();
      if (!this.awaitingFirst.has(s)) this.sendState(s.peerId);
      this.changed();
    }
  }
  onState(s, m) {
    const id = s.peerId;
    this.opts.hooks.stateMessage?.(s, m);
    let prev = null;
    let before;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      before = cur;
      prev = cur?.state ?? null;
      const next2 = reconcile(prev, m.state);
      if (next2 === null) return cur ? null : void 0;
      return {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: m.name,
        state: next2,
        color: m.color,
        lastIp: s.remoteAddress,
        lastPort: m.port || cur?.lastPort,
        lastSeen: now,
        ...prev !== next2 ? { lastActivity: now } : {},
        ...this.opts.hooks.statePatch?.(prev, next2) ?? {}
      };
    });
    const next = updated?.state ?? null;
    if (next === null) {
      if (before) this.event({ kind: "withdrawn", id, who: displayName(before) });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Not a friend");
      this.changed();
      return;
    }
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.event({ kind: "accepted", id, who, byThem: prev === "outgoing" });
    } else if (next === "incoming" && prev !== "incoming") {
      this.event({ kind: "incoming", id, who });
    } else if (prev === "accepted" && next === "outgoing") {
      this.event({ kind: "removedUs", id, who });
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.opts.hooks.stateChanged?.(id, prev, next);
    this.changed();
  }
};
function statesOf(v) {
  return new Map(v.friends.map((f) => [f.id, f.state]));
}
function appendLog(file, line) {
  try {
    fs9.appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}

// src/game/results.ts
var ResultsBook = class {
  constructor(paths) {
    this.paths = paths;
    this.records = readJsonl(paths.results).filter(isRaceRecord);
  }
  records;
  cache = null;
  all() {
    return this.records;
  }
  has(gid) {
    return this.records.some((r) => r.gid === gid);
  }
  stats(myId) {
    if (this.cache?.myId !== myId) this.cache = { myId, stats: computeStats(this.records, myId) };
    return this.cache.stats;
  }
  /**
   * Someone has a new id (the move to ~/.termhub): our own old keyrace id, or a friend's.
   * Every race they were in moves with them – stats, head-to-head and bests stay as they were.
   */
  rekey(oldId, newId) {
    const swap = (id) => id === oldId ? newId : id;
    let changed = false;
    this.records = this.records.map((r) => {
      if (r.me !== oldId && r.hostId !== oldId && !r.players.some((p) => p.id === oldId)) return r;
      changed = true;
      return { ...r, me: swap(r.me), hostId: swap(r.hostId), players: r.players.map((p) => ({ ...p, id: swap(p.id) })) };
    });
    if (!changed) return;
    this.cache = null;
    writeJsonlAtomic(this.paths.results, this.records);
  }
  /** Does any race know this id? (old ids of opponents who aren't friends get linked too) */
  knows(id) {
    return this.records.some((r) => r.players.some((p) => p.id === id));
  }
  /** Saves a race (once per gid) and tells whether it was a personal best. */
  add(rec) {
    if (this.has(rec.gid)) return { newBest: false };
    const newBest = isNewBest(this.stats(rec.me), rec);
    this.records.push(rec);
    this.cache = null;
    appendJsonl(this.paths.results, rec);
    return { newBest };
  }
};

// src/game/session.ts
import crypto7 from "crypto";

// src/core/protocol.ts
var PEER_ID_RE2 = /^[A-Z2-7]{20}$/;
var GID_RE = /^[A-Za-z0-9_-]{8,32}$/;
var WORD_RE = /^[a-z]{1,24}$/;
var MAX_WORDS = 1e3;
var MAX_PLAYERS = 16;
var MAX_CHAT = 200;
var MAX_COUNTDOWN = 1e4;
var MAX_COUNT = 1e5;
var MAX_TIME = 60 * 6e4;
var PLAYER_STATUS = ["joined", "invited", "declined", "left"];
var RUN_STATUS = ["racing", "finished", "out"];
var isGid = (v) => typeof v === "string" && GID_RE.test(v);
var isPeerId = (v) => typeof v === "string" && PEER_ID_RE2.test(v);
var isCount = (v, max2 = MAX_COUNT) => Number.isInteger(v) && v >= 0 && v <= max2;
var isNum = (v, max2) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max2;
function parsePlayers(v) {
  if (!Array.isArray(v) || v.length > MAX_PLAYERS) return null;
  const out = [];
  for (const p of v) {
    if (!p || typeof p !== "object") return null;
    const o = p;
    if (!isPeerId(o.id) || !PLAYER_STATUS.includes(o.status)) return null;
    out.push({ id: o.id, name: cleanName(o.name), status: o.status, ...o.busy === true ? { busy: true } : {} });
  }
  return out;
}
function parseRun(o, allowLeft) {
  const statuses = allowLeft ? [...RUN_STATUS, "left"] : RUN_STATUS;
  if (!statuses.includes(o.status)) return null;
  if (![o.chars, o.words, o.errors, o.keys, o.correctKeys].every((n) => isCount(n))) return null;
  if (!isCount(o.idx, MAX_WORDS) || !isCount(o.ms, MAX_TIME)) return null;
  if (o.correctKeys > o.keys) return null;
  return {
    chars: o.chars,
    words: o.words,
    errors: o.errors,
    keys: o.keys,
    correctKeys: o.correctKeys,
    idx: o.idx,
    status: o.status,
    ms: o.ms,
    ...o.completed === true ? { completed: true } : {}
  };
}
function parseGameWire(o) {
  switch (o.t) {
    case "invite":
    case "lobby": {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      const players = parsePlayers(o.players);
      if (!players) return null;
      if (o.t === "invite") return { t: "invite", gid: o.gid, mode: o.mode, param: o.param, players };
      const starting = isCount(o.starting, MAX_COUNTDOWN) ? o.starting : void 0;
      return { t: "lobby", gid: o.gid, mode: o.mode, param: o.param, players, ...starting !== void 0 ? { starting } : {} };
    }
    case "invite_cancel": {
      if (!isGid(o.gid)) return null;
      const reason = ["closed", "host_left", "started"].includes(o.reason) ? o.reason : void 0;
      return { t: "invite_cancel", gid: o.gid, ...reason ? { reason } : {} };
    }
    case "invite_decline":
      if (!isGid(o.gid)) return null;
      return { t: "invite_decline", gid: o.gid, ...o.busy === true ? { busy: true } : {} };
    case "join":
    case "kick":
    case "leave":
      return isGid(o.gid) ? { t: o.t, gid: o.gid } : null;
    case "lchat": {
      if (!isGid(o.gid) || typeof o.text !== "string" || o.text.length > MAX_CHAT * 2) return null;
      const text = sanitizeText(o.text).replace(/\s+/g, " ").trim().slice(0, MAX_CHAT);
      if (!text) return null;
      if (o.from === void 0) return { t: "lchat", gid: o.gid, text };
      if (!isPeerId(o.from)) return null;
      return { t: "lchat", gid: o.gid, text, from: o.from, name: cleanName(o.name) };
    }
    case "start": {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      if (!Array.isArray(o.words) || o.words.length === 0 || o.words.length > MAX_WORDS) return null;
      if (!o.words.every((w) => typeof w === "string" && WORD_RE.test(w))) return null;
      if (!isCount(o.countdownMs, MAX_COUNTDOWN)) return null;
      if (!Array.isArray(o.players) || o.players.length === 0 || o.players.length > MAX_PLAYERS) return null;
      const players = [];
      for (const p of o.players) {
        if (!p || typeof p !== "object" || !isPeerId(p.id)) return null;
        players.push({ id: p.id, name: cleanName(p.name) });
      }
      return { t: "start", gid: o.gid, mode: o.mode, param: o.param, words: o.words, countdownMs: o.countdownMs, players };
    }
    case "progress": {
      if (!isGid(o.gid)) return null;
      const run = parseRun(o, false);
      return run ? { t: "progress", gid: o.gid, ...run } : null;
    }
    case "standings": {
      if (!isGid(o.gid) || !Array.isArray(o.players) || o.players.length > MAX_PLAYERS) return null;
      const players = [];
      for (const p of o.players) {
        if (!p || typeof p !== "object") return null;
        const r = p;
        const run = parseRun(r, true);
        if (!run || !isPeerId(r.id)) return null;
        players.push({ id: r.id, ...run });
      }
      return { t: "standings", gid: o.gid, players };
    }
    case "results": {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      if (!Array.isArray(o.players) || o.players.length === 0 || o.players.length > MAX_PLAYERS) return null;
      const players = [];
      for (const p of o.players) {
        if (!p || typeof p !== "object") return null;
        const r = p;
        if (!isPeerId(r.id) || !isCount(r.place, MAX_PLAYERS) || r.place < 1) return null;
        if (!["finished", "out", "left"].includes(r.status)) return null;
        if (!isNum(r.wpm, MAX_COUNT) || !isNum(r.acc, 1) || !isCount(r.timeMs, MAX_TIME)) return null;
        if (![r.words, r.errors, r.chars].every((n) => isCount(n))) return null;
        players.push({
          id: r.id,
          name: cleanName(r.name),
          place: r.place,
          status: r.status,
          completed: r.completed === true,
          wpm: r.wpm,
          acc: r.acc,
          words: r.words,
          errors: r.errors,
          chars: r.chars,
          timeMs: r.timeMs
        });
      }
      return { t: "results", gid: o.gid, mode: o.mode, param: o.param, players };
    }
    default:
      return null;
  }
}
var WIRE = {
  parse: parseGameWire,
  // `racing`: in a countdown or race right now
  presence: (o) => o.racing === true ? { racing: true } : {}
};

// src/game/engine.ts
var MAX_EXTRA = 8;
var charsPerMs = (wpm) => wpm * 5 / 6e4;
function wallWpm(ms) {
  if (ms <= WALL.graceMs) return 0;
  return WALL.startWpm + WALL.stepWpm * Math.floor((ms - WALL.graceMs) / WALL.stepMs);
}
function wallChars(ms) {
  if (ms <= WALL.graceMs) return 0;
  const x = ms - WALL.graceMs;
  const k = Math.floor(x / WALL.stepMs);
  const full = charsPerMs(1) * WALL.stepMs * (k * WALL.startWpm + WALL.stepWpm * k * (k - 1) / 2);
  return full + charsPerMs(WALL.startWpm + WALL.stepWpm * k) * (x - k * WALL.stepMs);
}
function wallTime(chars) {
  let acc = 0;
  for (let k = 0; ; k++) {
    const rate = charsPerMs(WALL.startWpm + WALL.stepWpm * k);
    const step = rate * WALL.stepMs;
    if (chars <= acc + step) return WALL.graceMs + k * WALL.stepMs + (chars - acc) / rate;
    acc += step;
  }
}
var TypingEngine = class {
  settings;
  words;
  startAt;
  now;
  index = 0;
  typed = "";
  done = [];
  /** characters of correct words, plus one space each */
  correctChars = 0;
  correctWords = 0;
  /** wrong words */
  errors = 0;
  /** keystrokes without backspace */
  keys = 0;
  correctKeys = 0;
  status = "countdown";
  /** ms since GO when the run ended */
  endedAt = null;
  outReason = null;
  /** race: reached the target */
  completed = false;
  constructor(opts) {
    this.settings = opts.settings;
    this.words = opts.words;
    this.startAt = opts.startAt;
    this.now = opts.now;
    this.update();
  }
  get sudden() {
    return this.settings.mode === "sudden";
  }
  get ended() {
    return this.status === "finished" || this.status === "out";
  }
  /** ms since GO (negative during the countdown, frozen once the run ended). */
  elapsed() {
    return this.endedAt ?? this.now() - this.startAt;
  }
  /** Characters that count for the wall: everything typed so far is correct in sudden death. */
  get progressChars() {
    return this.correctChars + (this.sudden ? this.typed.length : 0);
  }
  wpm() {
    return wpmOf(this.correctChars, this.elapsed());
  }
  accuracy() {
    return accuracyOf(this.correctKeys, this.keys);
  }
  /** Sudden death: characters ahead of the wall (negative = caught). */
  wallGap() {
    return this.progressChars - wallChars(Math.max(0, this.elapsed()));
  }
  /** Applies everything time decides: GO, end of a sprint, time limits, the wall. */
  update() {
    if (this.ended) return;
    const t = this.now() - this.startAt;
    if (this.status === "countdown") {
      if (t < 0) return;
      this.status = "racing";
    }
    if (this.sudden && wallChars(t) > this.progressChars) {
      return this.end("out", Math.min(t, wallTime(this.progressChars)), "wall");
    }
    const limit = runLimitMs(this.settings);
    if (t >= limit) this.end("finished", limit);
  }
  /** Typed text (one or more characters, e.g. when keys arrive in one chunk). */
  input(text) {
    for (const ch of text) {
      this.update();
      if (this.status !== "racing") return;
      if (ch === " ") this.space();
      else if (ch >= " " && ch !== "\x7F") this.char(ch);
    }
  }
  backspace() {
    this.update();
    if (this.status !== "racing" || this.sudden || !this.typed) return;
    this.typed = [...this.typed].slice(0, -1).join("");
  }
  /** alt/ctrl+backspace: clears the current word. */
  deleteWord() {
    this.update();
    if (this.status !== "racing" || this.sudden) return;
    this.typed = "";
  }
  get word() {
    return this.words[this.index] ?? "";
  }
  char(ch) {
    const word = this.word;
    const pos = this.typed.length;
    const correct = pos < word.length && word[pos] === ch;
    this.keys++;
    if (correct) this.correctKeys++;
    if (this.sudden && !correct) {
      this.typed += ch;
      this.errors++;
      return this.end("out", this.elapsed(), "typo");
    }
    if (pos < word.length + MAX_EXTRA) this.typed += ch;
    if (this.settings.mode === "race" && this.correctWords === this.settings.param - 1 && this.typed === word) {
      this.completeWord();
    }
  }
  space() {
    if (!this.typed) return;
    const word = this.word;
    this.keys++;
    if (this.typed === word) {
      this.correctKeys++;
      this.completeWord();
      return;
    }
    if (this.sudden) {
      this.errors++;
      return this.end("out", this.elapsed(), "typo");
    }
    this.done.push({ typed: this.typed, correct: false });
    this.errors++;
    this.advance();
  }
  completeWord() {
    this.done.push({ typed: this.typed, correct: true });
    this.correctChars += this.word.length + 1;
    this.correctWords++;
    if (this.settings.mode === "race" && this.correctWords >= this.settings.param) {
      this.completed = true;
      this.index++;
      this.typed = "";
      return this.end("finished", this.elapsed());
    }
    this.advance();
  }
  advance() {
    this.index++;
    this.typed = "";
    if (this.index >= this.words.length) this.end("finished", this.elapsed());
  }
  end(status, at, reason = null) {
    if (this.ended) return;
    this.status = status;
    this.endedAt = Math.max(0, at);
    this.outReason = reason;
  }
  /** What a guest reports to the host. */
  progress() {
    return {
      chars: this.correctChars,
      words: this.correctWords,
      errors: this.errors,
      keys: this.keys,
      correctKeys: this.correctKeys,
      idx: this.index,
      status: this.status === "countdown" ? "racing" : this.status,
      ms: Math.max(0, Math.round(this.elapsed())),
      ...this.completed ? { completed: true } : {}
    };
  }
};

// src/game/lobby.ts
function createLobby(gid, host, settings, invitees) {
  return invite({ gid, hostId: host.id, settings, players: [{ ...host, status: "joined" }] }, invitees);
}
var update = (l, id, patch) => ({
  ...l,
  players: l.players.map((p) => p.id === id ? { ...p, ...patch } : p)
});
var playerOf = (l, id) => l.players.find((p) => p.id === id);
function invite(l, who) {
  let next = l;
  for (const w of who) {
    if (w.id === l.hostId) continue;
    const p = playerOf(next, w.id);
    if (!p) next = { ...next, players: [...next.players, { id: w.id, name: w.name, status: "invited" }] };
    else if (p.status === "declined" || p.status === "left") next = update(next, w.id, { status: "invited", busy: void 0, name: w.name });
  }
  return next;
}
function join(l, id) {
  const p = playerOf(l, id);
  if (!p || id === l.hostId) return { lobby: l, ok: false };
  if (p.status === "joined") return { lobby: l, ok: true };
  if (p.status !== "invited") return { lobby: l, ok: false };
  return { lobby: update(l, id, { status: "joined" }), ok: true };
}
function decline(l, id, busy = false) {
  const p = playerOf(l, id);
  if (!p || p.status !== "invited") return l;
  return update(l, id, { status: "declined", ...busy ? { busy: true } : {} });
}
function kick(l, id) {
  const p = playerOf(l, id);
  if (!p || id === l.hostId) return { lobby: l, was: null };
  return { lobby: { ...l, players: l.players.filter((x) => x.id !== id) }, was: p.status };
}
function leave(l, id) {
  const p = playerOf(l, id);
  if (!p || id === l.hostId || p.status !== "joined" && p.status !== "invited") return l;
  return update(l, id, { status: "left" });
}
var pending = (l) => l.players.filter((p) => p.status === "invited");
var racers = (l) => l.players.filter((p) => p.status === "joined");
var joinedGuests = (l) => racers(l).filter((p) => p.id !== l.hostId);
function readyToAutoStart(l) {
  return pending(l).length === 0 && joinedGuests(l).length > 0;
}
function start(l) {
  const withdrawn = pending(l);
  const lobby = { ...l, players: l.players.filter((p) => p.status !== "invited") };
  return { lobby, withdrawn, racers: racers(lobby) };
}

// src/game/scoring.ts
var desc = (f) => (a, b) => f(b) - f(a);
var asc = (f) => (a, b) => f(a) - f(b);
var chain = (...cs) => (a, b) => {
  for (const c2 of cs) {
    const d = c2(a, b);
    if (d) return d;
  }
  return 0;
};
var leftLast = (a, b) => Number(a.status === "left") - Number(b.status === "left");
var ORDER = {
  // most correct words; ties: higher accuracy, then higher WPM
  sprint: chain(
    leftLast,
    desc((p) => p.words),
    desc((p) => p.acc),
    desc((p) => p.wpm)
  ),
  // finishers by finish time, then the rest by progress
  race: chain(
    leftLast,
    desc((p) => Number(p.completed)),
    (a, b) => a.completed && b.completed ? a.timeMs - b.timeMs : 0,
    desc((p) => p.words),
    desc((p) => p.chars),
    desc((p) => p.wpm)
  ),
  // last one standing: longest survival, then most characters
  sudden: chain(
    leftLast,
    desc((p) => Number(p.status === "finished")),
    desc((p) => p.timeMs),
    desc((p) => p.chars),
    asc((p) => p.errors)
  )
};
function rank(mode, players) {
  return [...players].sort(ORDER[mode]).map((p, i) => ({ ...p, place: i + 1 }));
}
function finalResult(settings, player, p, left) {
  const prog = p ?? { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: "racing", ms: 0 };
  const limit = runLimitMs(settings);
  const status = left ? "left" : prog.status === "racing" ? settings.mode === "sudden" ? "out" : "finished" : prog.status;
  const completed = settings.mode === "race" && !left && prog.completed === true && prog.words >= settings.param;
  let timeMs;
  if (settings.mode === "sprint") timeMs = left ? Math.min(prog.ms, limit) : limit;
  else if (settings.mode === "race") timeMs = completed ? Math.min(prog.ms, limit) : Math.min(left ? prog.ms : limit, limit);
  else timeMs = Math.min(prog.ms, limit);
  return {
    id: player.id,
    name: player.name,
    status,
    completed,
    wpm: round1(wpmOf(prog.chars, timeMs)),
    acc: round3(accuracyOf(prog.correctKeys, prog.keys)),
    words: prog.words,
    errors: prog.errors,
    chars: prog.chars,
    timeMs: Math.round(timeMs)
  };
}
var round1 = (n) => Math.round(n * 10) / 10;
var round3 = (n) => Math.round(n * 1e3) / 1e3;
function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

// src/game/words.ts
var WORDS = [
  "the",
  "be",
  "of",
  "and",
  "a",
  "to",
  "in",
  "he",
  "have",
  "it",
  "that",
  "for",
  "they",
  "with",
  "as",
  "not",
  "on",
  "she",
  "at",
  "by",
  "this",
  "we",
  "you",
  "do",
  "but",
  "from",
  "or",
  "which",
  "one",
  "would",
  "all",
  "will",
  "there",
  "say",
  "who",
  "make",
  "when",
  "can",
  "more",
  "if",
  "no",
  "man",
  "out",
  "other",
  "so",
  "what",
  "time",
  "up",
  "go",
  "about",
  "than",
  "into",
  "could",
  "state",
  "only",
  "new",
  "year",
  "some",
  "take",
  "come",
  "these",
  "know",
  "see",
  "use",
  "get",
  "like",
  "then",
  "first",
  "any",
  "work",
  "now",
  "may",
  "such",
  "give",
  "over",
  "think",
  "most",
  "even",
  "find",
  "day",
  "also",
  "after",
  "way",
  "many",
  "must",
  "look",
  "before",
  "great",
  "back",
  "through",
  "long",
  "where",
  "much",
  "should",
  "well",
  "people",
  "down",
  "own",
  "just",
  "because",
  "good",
  "each",
  "those",
  "feel",
  "seem",
  "how",
  "high",
  "too",
  "place",
  "little",
  "world",
  "very",
  "still",
  "nation",
  "hand",
  "old",
  "life",
  "tell",
  "write",
  "become",
  "here",
  "show",
  "house",
  "both",
  "between",
  "need",
  "mean",
  "call",
  "develop",
  "under",
  "last",
  "right",
  "move",
  "thing",
  "general",
  "school",
  "never",
  "same",
  "another",
  "begin",
  "while",
  "number",
  "part",
  "turn",
  "real",
  "leave",
  "might",
  "want",
  "point",
  "form",
  "off",
  "child",
  "few",
  "small",
  "since",
  "against",
  "ask",
  "late",
  "home",
  "interest",
  "large",
  "person",
  "end",
  "open",
  "public",
  "follow",
  "during",
  "present",
  "without",
  "again",
  "hold",
  "govern",
  "around",
  "possible",
  "head",
  "consider",
  "word",
  "program",
  "problem",
  "however",
  "lead",
  "system",
  "set",
  "order",
  "eye",
  "plan",
  "run",
  "keep",
  "face",
  "fact",
  "group",
  "play",
  "stand",
  "increase",
  "early",
  "course",
  "change",
  "help",
  "line",
  "city",
  "put",
  "close",
  "case",
  "force",
  "meet",
  "once",
  "water",
  "upon",
  "war",
  "build",
  "hear",
  "light",
  "unite",
  "live",
  "every",
  "country",
  "bring",
  "center",
  "let",
  "side",
  "try",
  "provide",
  "continue",
  "name",
  "certain",
  "power",
  "pay",
  "result",
  "question",
  "study",
  "woman",
  "member",
  "until",
  "far",
  "night",
  "always",
  "service",
  "away",
  "report",
  "something",
  "company",
  "week",
  "church",
  "toward",
  "start",
  "social",
  "room",
  "figure",
  "nature",
  "though",
  "young",
  "less",
  "enough",
  "almost",
  "read",
  "include",
  "president",
  "nothing",
  "yet",
  "better",
  "big",
  "boy",
  "cost",
  "business",
  "value",
  "second",
  "why",
  "clear",
  "expect",
  "family",
  "complete",
  "act",
  "sense",
  "mind",
  "experience",
  "art",
  "next",
  "near",
  "direct",
  "car",
  "law",
  "industry",
  "important",
  "girl",
  "god",
  "several",
  "matter",
  "usual",
  "rather",
  "per",
  "often",
  "kind",
  "among",
  "white",
  "reason",
  "action",
  "return",
  "foot",
  "care",
  "simple",
  "within",
  "love",
  "human",
  "along",
  "appear",
  "doctor",
  "believe",
  "speak",
  "active",
  "student",
  "month",
  "drive",
  "concern",
  "best",
  "door",
  "hope",
  "example",
  "inform",
  "body",
  "ever",
  "least",
  "probable",
  "understand",
  "reach",
  "effect",
  "different",
  "idea",
  "whole",
  "control",
  "condition",
  "field",
  "pass",
  "fall",
  "note",
  "special",
  "talk",
  "particular",
  "today",
  "measure",
  "walk",
  "teach",
  "low",
  "hour",
  "type",
  "carry",
  "rate",
  "remain",
  "full",
  "street",
  "easy",
  "although",
  "record",
  "sit",
  "determine",
  "level",
  "local",
  "sure",
  "receive",
  "thus",
  "moment",
  "spirit",
  "train",
  "college",
  "religion",
  "perhaps",
  "music",
  "grow",
  "free",
  "cause",
  "serve",
  "age",
  "book",
  "board",
  "recent",
  "sound",
  "office",
  "cut",
  "step",
  "class",
  "true",
  "history",
  "position",
  "above",
  "strong",
  "friend",
  "necessary",
  "add",
  "court",
  "deal",
  "tax",
  "support",
  "party",
  "whether",
  "either",
  "land",
  "material",
  "happen",
  "education",
  "death",
  "agree",
  "arm",
  "mother",
  "across",
  "quite",
  "anything",
  "town",
  "past",
  "view",
  "society",
  "manage",
  "answer",
  "break",
  "organize",
  "half",
  "fire",
  "lose",
  "money",
  "stop",
  "actual",
  "already",
  "effort",
  "wait",
  "department",
  "able",
  "political",
  "learn",
  "voice",
  "air",
  "together",
  "shall",
  "cover",
  "common",
  "subject",
  "draw",
  "short",
  "wife",
  "treat",
  "limit",
  "road",
  "letter",
  "color",
  "behind",
  "produce",
  "send",
  "term",
  "total",
  "university",
  "rise",
  "century",
  "success",
  "minute",
  "remember",
  "purpose",
  "test",
  "fight",
  "watch",
  "situation",
  "south",
  "ago",
  "difference",
  "stage",
  "father",
  "table",
  "rest",
  "bear",
  "entire",
  "market",
  "prepare",
  "explain",
  "offer",
  "plant",
  "charge",
  "ground",
  "west",
  "picture",
  "hard",
  "front",
  "lie",
  "modern",
  "dark",
  "surface",
  "rule",
  "regard",
  "dance",
  "peace",
  "observe",
  "future",
  "wall",
  "farm",
  "claim",
  "firm",
  "operation",
  "further",
  "pressure",
  "property",
  "morning",
  "amount",
  "top",
  "outside",
  "piece",
  "sometimes",
  "beauty",
  "trade",
  "fear",
  "demand",
  "wonder",
  "list",
  "accept",
  "judge",
  "paint",
  "mile",
  "soon",
  "responsible",
  "allow",
  "secretary",
  "heart",
  "union",
  "slow",
  "island",
  "enter",
  "drink",
  "story",
  "experiment",
  "stay",
  "paper",
  "space",
  "apply",
  "decide",
  "share",
  "desire",
  "spend",
  "sign",
  "therefore",
  "various",
  "visit",
  "supply",
  "officer",
  "doubt",
  "private",
  "immediate",
  "finish",
  "contain",
  "refer",
  "rock",
  "sing",
  "serious",
  "mark",
  "sea",
  "north",
  "fill",
  "prove",
  "film",
  "raise",
  "tree",
  "whose",
  "skill",
  "ability",
  "brother",
  "anyone",
  "evening",
  "wish",
  "garden",
  "lady",
  "summer",
  "worry",
  "bank",
  "forest",
  "hair",
  "basic",
  "chance",
  "size",
  "sun",
  "river",
  "window",
  "wind",
  "cell",
  "energy",
  "oil",
  "bad",
  "dog",
  "cold",
  "heat",
  "stone",
  "dream",
  "sleep",
  "green",
  "blue",
  "red",
  "black",
  "gold",
  "brown",
  "yellow",
  "glass",
  "bird",
  "fish",
  "horse",
  "animal",
  "kitchen",
  "bread",
  "milk",
  "egg",
  "fruit",
  "apple",
  "sugar",
  "salt",
  "coffee",
  "tea",
  "cup",
  "plate",
  "chair",
  "bed",
  "floor",
  "roof",
  "wood",
  "pen",
  "clock",
  "phone",
  "ship",
  "plane",
  "boat",
  "bike",
  "bus",
  "truck",
  "engine",
  "wheel",
  "bridge",
  "tower",
  "castle",
  "king",
  "queen",
  "prince",
  "army",
  "soldier",
  "enemy",
  "battle",
  "weapon",
  "gun",
  "knife",
  "sword",
  "shield",
  "guard",
  "captain",
  "pilot",
  "driver",
  "farmer",
  "teacher",
  "writer",
  "artist",
  "singer",
  "player",
  "leader",
  "worker",
  "owner",
  "author",
  "editor",
  "happy",
  "angry",
  "tired",
  "hungry",
  "quick",
  "fast",
  "slowly",
  "quiet",
  "loud",
  "bright",
  "soft",
  "sharp",
  "smooth",
  "rough",
  "warm",
  "cool",
  "fresh",
  "clean",
  "dirty",
  "empty",
  "heavy",
  "deep",
  "wide",
  "narrow",
  "thin",
  "thick",
  "tall",
  "ancient",
  "strange",
  "famous",
  "rich",
  "poor",
  "brave",
  "proud",
  "calm",
  "wild",
  "gentle",
  "honest",
  "clever",
  "funny",
  "silly",
  "lucky",
  "lonely",
  "busy",
  "ready",
  "safe",
  "perfect",
  "sweet",
  "bitter",
  "sour",
  "fine",
  "nice",
  "fair",
  "wise",
  "below",
  "beneath",
  "beside",
  "beyond",
  "except",
  "inside",
  "instead",
  "account",
  "address",
  "advice",
  "afford",
  "afraid",
  "agent",
  "alive",
  "alone",
  "angle",
  "annual",
  "anyway",
  "area",
  "argue",
  "arrive",
  "article",
  "aside",
  "attack",
  "attempt",
  "attend",
  "audience",
  "avoid",
  "award",
  "aware",
  "baby",
  "balance",
  "ball",
  "band",
  "base",
  "basis",
  "basket",
  "beach",
  "bean",
  "beat",
  "beautiful",
  "bedroom",
  "beer",
  "bell",
  "belong",
  "belt",
  "bench",
  "bend",
  "benefit",
  "bet",
  "bill",
  "birth",
  "bit",
  "bite",
  "blade",
  "blame",
  "blank",
  "blind",
  "block",
  "blood",
  "blow",
  "bone",
  "border",
  "borrow",
  "boss",
  "bottle",
  "bottom",
  "bowl",
  "box",
  "brain",
  "branch",
  "breath",
  "brick",
  "brief",
  "broad",
  "brush",
  "budget",
  "bunch",
  "burn",
  "button",
  "buy",
  "cabin",
  "cable",
  "cake",
  "calendar",
  "camera",
  "camp",
  "campaign",
  "candle",
  "cap",
  "capital",
  "card",
  "career",
  "careful",
  "carpet",
  "cash",
  "cast",
  "cat",
  "catch",
  "ceiling",
  "chain",
  "chalk",
  "champion",
  "channel",
  "chapter",
  "chart",
  "cheap",
  "check",
  "cheese",
  "chest",
  "chicken",
  "chief",
  "choice",
  "choose",
  "circle",
  "citizen",
  "clerk",
  "click",
  "client",
  "climb",
  "cloth",
  "cloud",
  "club",
  "coach",
  "coast",
  "coat",
  "code",
  "coin",
  "collect",
  "column",
  "comfort",
  "command",
  "comment",
  "commit",
  "compare",
  "complain",
  "concept",
  "confirm",
  "connect",
  "contest",
  "context",
  "contract",
  "cook",
  "copy",
  "corner",
  "correct",
  "cotton",
  "couch",
  "count",
  "couple",
  "courage",
  "cousin",
  "crack",
  "craft",
  "crash",
  "crazy",
  "cream",
  "create",
  "credit",
  "crew",
  "crime",
  "crop",
  "cross",
  "crowd",
  "crown",
  "cry",
  "culture",
  "curve",
  "customer",
  "cycle",
  "damage",
  "danger",
  "data",
  "date",
  "dead",
  "dear",
  "debate",
  "debt",
  "decade",
  "defend",
  "degree",
  "delay",
  "deliver",
  "design",
  "desk",
  "detail",
  "device",
  "diet",
  "dinner",
  "dirt",
  "discuss",
  "dish",
  "distance",
  "divide",
  "document",
  "dollar",
  "double",
  "draft",
  "drama",
  "dress",
  "drop",
  "dry",
  "duck",
  "dust",
  "duty",
  "eager",
  "earn",
  "earth",
  "east",
  "edge",
  "eight",
  "elbow",
  "element",
  "else",
  "email",
  "emotion",
  "employ",
  "engage",
  "enjoy",
  "entry",
  "equal",
  "error",
  "escape",
  "essay",
  "estate",
  "event",
  "evil",
  "exact",
  "exam",
  "excuse",
  "exercise",
  "exist",
  "exit",
  "extend",
  "extra",
  "fabric",
  "factor",
  "fail",
  "faith",
  "false",
  "fan",
  "fault",
  "feature",
  "fee",
  "fence",
  "fiber",
  "file",
  "final",
  "finger",
  "fix",
  "flag",
  "flame",
  "flat",
  "flavor",
  "flight",
  "float",
  "flood",
  "flower",
  "fly",
  "focus",
  "fold",
  "folk",
  "food",
  "fool",
  "forever",
  "forget",
  "forgive",
  "fork",
  "formal",
  "fortune",
  "forward",
  "frame",
  "frequent",
  "fuel",
  "fun",
  "fund",
  "gain",
  "game",
  "gap",
  "gas",
  "gate",
  "gather",
  "gear",
  "gift",
  "glad",
  "global",
  "glove",
  "goal",
  "golf",
  "grab",
  "grade"
];
function randomWords(count, random = Math.random) {
  const out = [];
  while (out.length < count) {
    const w = WORDS[Math.floor(random() * WORDS.length)];
    if (w !== out[out.length - 1]) out.push(w);
  }
  return out;
}

// src/game/session.ts
var DEFAULT_TUNING = { countdownMs: 3e3, autoStartMs: 3e3, tickMs: 250, graceMs: 2500, joinTimeoutMs: 6e3, maxWpm: MAX_PLAUSIBLE_WPM };
var MAX_CHAT_LINES = 50;
function wordCount(s) {
  if (s.mode === "sprint") return Math.ceil(s.param * 250 / 60);
  if (s.mode === "race") return Math.ceil(s.param * 1.5) + 20;
  return 600;
}
var newGid = () => crypto7.randomBytes(9).toString("base64url");
var GameManager = class {
  constructor(deps) {
    this.deps = deps;
    this.t = { ...DEFAULT_TUNING, ...deps.tuning };
    this.now = deps.now ?? Date.now;
  }
  game = null;
  invites = /* @__PURE__ */ new Map();
  lobby = null;
  timer = null;
  autoTimer = null;
  joinTimer = null;
  lastSent = "";
  chatSeq = 0;
  wasRacing = false;
  t;
  now;
  get racing() {
    return this.game?.phase === "race";
  }
  pendingInvites() {
    return [...this.invites.values()].sort((a, b) => b.at - a.at);
  }
  stop() {
    this.clearTimers();
  }
  // ───────────── Starting ─────────────
  /** New race: invites the given friends (none = solo practice). */
  create(settings, inviteIds) {
    const ids = this.capped(inviteIds.filter((id) => this.deps.isFriend(id) && this.deps.isOnline(id)), 1);
    if (!ids.length) return this.solo(settings);
    this.leave();
    const me = this.deps.me();
    const gid = newGid();
    this.lobby = createLobby(gid, me, settings, ids.map((id) => ({ id, name: this.deps.nameOf(id) })));
    this.game = this.newGame(gid, "host", me, settings, "lobby");
    for (const id of ids) this.sendInvite(id);
    this.lobbyChanged();
  }
  solo(settings) {
    this.leave();
    const me = this.deps.me();
    this.game = this.newGame(newGid(), "solo", me, settings, "race");
    this.beginRace(randomWords(wordCount(settings)), [me], this.t.countdownMs);
  }
  newGame(gid, role, host, settings, phase) {
    return {
      gid,
      role,
      hostId: host.id,
      hostName: host.name,
      settings,
      phase,
      players: [],
      chat: [],
      autoStartAt: null,
      engine: null,
      racers: [],
      results: null,
      newBest: false,
      closedReason: null,
      rematch: null
    };
  }
  // ───────────── Host: lobby ─────────────
  get hosting() {
    return this.game?.role === "host" && this.lobby ? { game: this.game, lobby: this.lobby } : null;
  }
  wirePlayers(l) {
    return l.players.map((p) => ({ id: p.id, name: p.name, status: p.status, ...p.busy ? { busy: true } : {} }));
  }
  sendInvite(id) {
    const h = this.hosting;
    if (!h) return;
    const { mode, param } = h.lobby.settings;
    const ok = this.deps.send(id, { t: "invite", gid: h.lobby.gid, mode, param, players: this.wirePlayers(h.lobby) });
    if (!ok) this.lobby = leave(h.lobby, id);
  }
  /** After every lobby change: arm or cancel the automatic start, tell everyone who joined. */
  lobbyChanged() {
    const h = this.hosting;
    if (!h || h.game.phase !== "lobby") return;
    const { game, lobby } = h;
    if (readyToAutoStart(lobby)) {
      if (game.autoStartAt === null) {
        game.autoStartAt = this.now() + this.t.autoStartMs;
        this.autoTimer = setTimeout(() => {
          this.autoTimer = null;
          if (this.game === game && game.phase === "lobby" && this.lobby && readyToAutoStart(this.lobby)) this.startRace();
        }, this.t.autoStartMs);
        this.autoTimer.unref();
      }
    } else if (game.autoStartAt !== null) {
      game.autoStartAt = null;
      if (this.autoTimer) clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    game.players = lobby.players;
    const { mode, param } = lobby.settings;
    const starting = game.autoStartAt !== null ? Math.max(0, game.autoStartAt - this.now()) : void 0;
    for (const p of joinedGuests(lobby)) {
      this.deps.send(p.id, { t: "lobby", gid: lobby.gid, mode, param, players: this.wirePlayers(lobby), ...starting !== void 0 ? { starting } : {} });
    }
    this.deps.changed();
  }
  /** Host: invite more online friends into the lobby. */
  inviteMore(ids) {
    const h = this.hosting;
    if (!h || h.game.phase !== "lobby") return;
    const known = new Set(h.lobby.players.map((p) => p.id));
    const wanted = ids.filter((id) => this.deps.isFriend(id) && this.deps.isOnline(id));
    const newcomers = this.capped(wanted.filter((id) => !known.has(id)), h.lobby.players.length);
    const who = wanted.filter((id) => known.has(id) || newcomers.includes(id)).map((id) => ({ id, name: this.deps.nameOf(id) }));
    this.lobby = invite(h.lobby, who);
    for (const w of who) if (playerOf(this.lobby, w.id)?.status === "invited") this.sendInvite(w.id);
    this.lobbyChanged();
  }
  /** At most MAX_PLAYERS in a lobby (`taken` = places already used). */
  capped(ids, taken) {
    const room = Math.max(0, MAX_PLAYERS - taken);
    if (ids.length > room) this.deps.toast(`A race has room for ${MAX_PLAYERS} players \u2013 not everyone was invited`, "error");
    return ids.slice(0, room);
  }
  /** Host: remove a player, joined or still invited. */
  kick(id) {
    const h = this.hosting;
    if (!h || h.game.phase !== "lobby") return;
    const { lobby, was } = kick(h.lobby, id);
    if (!was) return;
    this.lobby = lobby;
    if (was === "joined") this.deps.send(id, { t: "kick", gid: lobby.gid });
    else if (was === "invited") this.deps.send(id, { t: "invite_cancel", gid: lobby.gid, reason: "closed" });
    this.lobbyChanged();
  }
  /** Host: players who haven't joined yet (the UI asks before starting without them). */
  pendingPlayers() {
    return this.lobby && this.game?.role === "host" ? pending(this.lobby) : [];
  }
  /** Host: start now. Pending invites are withdrawn. */
  startRace() {
    const h = this.hosting;
    if (!h || h.game.phase !== "lobby") return;
    const { lobby, withdrawn, racers: racers2 } = start(h.lobby);
    this.lobby = lobby;
    for (const p of withdrawn) this.deps.send(p.id, { t: "invite_cancel", gid: lobby.gid, reason: "started" });
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    h.game.autoStartAt = null;
    h.game.players = lobby.players;
    const words = randomWords(wordCount(lobby.settings));
    const players = racers2.map((p) => ({ id: p.id, name: p.name }));
    const { mode, param } = lobby.settings;
    for (const p of racers2) {
      if (p.id === lobby.hostId) continue;
      this.deps.send(p.id, { t: "start", gid: lobby.gid, mode, param, words, countdownMs: this.t.countdownMs, players });
    }
    this.beginRace(words, players, this.t.countdownMs);
  }
  /** Host: back to a fresh lobby with the same settings and everyone from the last race. */
  rematch() {
    const g = this.game;
    if (!g || g.role !== "host" || g.phase !== "results" || !g.results) return;
    const me = this.deps.me().id;
    const ids = g.results.filter((r) => r.id !== me && r.status !== "left").map((r) => r.id);
    const online = ids.filter((id) => this.deps.isOnline(id) && this.deps.isFriend(id));
    if (!online.length) {
      this.deps.toast("Nobody from the last race is online anymore", "error");
      return;
    }
    this.create(g.settings, online);
  }
  // ───────────── Guest ─────────────
  /** Join an invite. Leaves whatever game we were in. */
  accept(gid) {
    const inv = this.invites.get(gid);
    if (!inv) return;
    this.invites.delete(gid);
    if (!this.deps.isOnline(inv.hostId)) {
      this.deps.toast(`${inv.hostName} is offline \u2013 the invite expired`, "error");
      this.deps.changed();
      return;
    }
    this.leave();
    this.game = this.newGame(gid, "guest", { id: inv.hostId, name: inv.hostName }, inv.settings, "joining");
    this.game.players = inv.players.map((p) => ({ ...p }));
    this.deps.send(inv.hostId, { t: "join", gid });
    const game = this.game;
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (this.game === game && game.phase === "joining") this.close(`${inv.hostName} didn't answer \u2013 the lobby may be gone`);
    }, this.t.joinTimeoutMs);
    this.joinTimer.unref();
    this.deps.changed();
  }
  decline(gid) {
    const inv = this.invites.get(gid);
    if (!inv) return;
    this.invites.delete(gid);
    this.deps.send(inv.hostId, { t: "invite_decline", gid });
    if (this.game?.rematch?.gid === gid) this.game.rematch = null;
    this.deps.changed();
  }
  // ───────────── Everyone ─────────────
  /**
   * Leaves the current game. A guest tells the host; a host closes the lobby or calls off the
   * race for everyone (no host migration); solo just stops. Nothing is recorded.
   */
  leave() {
    const g = this.game;
    if (!g) return;
    if (g.role === "guest" && g.phase !== "results" && g.phase !== "closed") {
      this.deps.send(g.hostId, { t: "leave", gid: g.gid });
    } else if (g.role === "host" && this.lobby && (g.phase === "lobby" || g.phase === "race")) {
      const reason = g.phase === "race" ? "host_left" : "closed";
      const targets = g.phase === "race" ? g.racers.filter((r) => !r.left).map((r) => r.id) : this.lobby.players.map((p) => p.id);
      for (const id of targets) if (id !== g.hostId) this.deps.send(id, { t: "invite_cancel", gid: g.gid, reason });
    }
    this.reset();
  }
  /** Back to the dashboard after results or a called-off game. */
  dismiss() {
    if (this.game && (this.game.phase === "results" || this.game.phase === "closed")) this.reset();
  }
  sendChat(raw) {
    const g = this.game;
    if (!g || g.phase !== "lobby") return;
    const text = sanitizeText(raw).replace(/\s+/g, " ").trim().slice(0, MAX_CHAT);
    if (!text) return;
    if (g.role === "guest") {
      this.deps.send(g.hostId, { t: "lchat", gid: g.gid, text });
      return;
    }
    const me = this.deps.me();
    this.relayChat(me.id, me.name, text);
  }
  relayChat(from, name, text) {
    const h = this.hosting;
    if (!h) return;
    this.addChat(h.game, from, name, text);
    for (const p of joinedGuests(h.lobby)) this.deps.send(p.id, { t: "lchat", gid: h.lobby.gid, text, from, name });
  }
  addChat(g, from, name, text) {
    g.chat = [...g.chat, { id: ++this.chatSeq, from, name, text }].slice(-MAX_CHAT_LINES);
    this.deps.changed();
  }
  // ───────────── Typing ─────────────
  input(text) {
    this.withEngine((e) => e.input(text));
  }
  backspace() {
    this.withEngine((e) => e.backspace());
  }
  deleteWord() {
    this.withEngine((e) => e.deleteWord());
  }
  withEngine(fn) {
    const g = this.game;
    const e = g?.engine;
    if (!g || !e || g.phase !== "race") return;
    const before = `${e.index}:${e.status}`;
    fn(e);
    if (`${e.index}:${e.status}` !== before) this.onOwnProgress();
    this.deps.changed();
  }
  onOwnProgress() {
    const g = this.game;
    if (!g?.engine) return;
    if (g.role === "guest") this.sendProgress();
    else {
      this.ownRacer(g).progress = g.engine.progress();
      this.checkEnd();
    }
  }
  ownRacer(g) {
    const me = this.deps.me().id;
    return g.racers.find((r) => r.id === me);
  }
  sendProgress() {
    const g = this.game;
    if (!g?.engine || g.role !== "guest") return;
    const p = g.engine.progress();
    const key = JSON.stringify(p);
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.ownRacer(g).progress = p;
    this.deps.send(g.hostId, { t: "progress", gid: g.gid, ...p });
  }
  // ───────────── Race ─────────────
  beginRace(words, players, countdownMs) {
    const g = this.game;
    g.phase = "race";
    g.racers = players.map((p) => ({ id: p.id, name: p.name, progress: null, left: false }));
    g.engine = new TypingEngine({ settings: g.settings, words, now: this.now, startAt: this.now() + countdownMs });
    this.lastSent = "";
    this.timer = setInterval(() => this.tick(), this.t.tickMs);
    this.timer.unref();
    this.updateRacing();
    this.deps.changed();
  }
  tick() {
    const g = this.game;
    if (!g?.engine || g.phase !== "race") return;
    const before = g.engine.status;
    g.engine.update();
    if (g.role === "guest") this.sendProgress();
    else {
      this.ownRacer(g).progress = g.engine.progress();
      if (g.role === "host") this.broadcastStandings();
      this.checkEnd();
    }
    if (g.engine.status !== before || g.role !== "solo") this.deps.changed();
  }
  broadcastStandings() {
    const g = this.game;
    if (!g || g.role !== "host") return;
    const players = g.racers.map((r) => {
      const p = r.progress ?? { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: "racing", ms: 0 };
      return { id: r.id, ...p, status: r.left ? "left" : p.status };
    });
    for (const r of g.racers) if (r.id !== g.hostId && !r.left) this.deps.send(r.id, { t: "standings", gid: g.gid, players });
  }
  /** Host and solo: the race is over once everyone is done, or after the time limit. */
  checkEnd() {
    const g = this.game;
    if (!g?.engine || g.phase !== "race" || g.role === "guest") return;
    const me = this.deps.me().id;
    const elapsed = this.now() - g.engine.startAt;
    const done = g.racers.every((r) => r.left || (r.id === me ? g.engine.ended : r.progress !== null && r.progress.status !== "racing"));
    if (done || elapsed > runLimitMs(g.settings) + this.t.graceMs) this.finish();
  }
  finish() {
    const g = this.game;
    const me = this.deps.me().id;
    const results = rank(
      g.settings.mode,
      g.racers.map((r) => finalResult(g.settings, r, r.id === me ? g.engine.progress() : r.progress, r.left))
    );
    if (g.role === "host") {
      const { mode, param } = g.settings;
      for (const r of g.racers) if (r.id !== me && !r.left) this.deps.send(r.id, { t: "results", gid: g.gid, mode, param, players: results });
    }
    this.showResults(results);
  }
  showResults(results) {
    const g = this.game;
    this.clearTimers();
    g.phase = "results";
    g.results = results;
    const rec = {
      v: 1,
      gid: g.gid,
      ts: Date.now(),
      mode: g.settings.mode,
      param: g.settings.param,
      solo: g.role === "solo",
      hostId: g.hostId,
      me: this.deps.me().id,
      players: results
    };
    g.newBest = this.deps.save(rec).newBest;
    this.updateRacing();
    this.deps.changed();
  }
  close(reason) {
    const g = this.game;
    if (!g) return;
    this.clearTimers();
    g.phase = "closed";
    g.closedReason = reason;
    this.updateRacing();
    this.deps.changed();
  }
  reset() {
    this.clearTimers();
    this.game = null;
    this.lobby = null;
    this.lastSent = "";
    this.updateRacing();
    this.deps.changed();
  }
  clearTimers() {
    for (const t of [this.timer, this.autoTimer, this.joinTimer]) if (t) clearTimeout(t);
    this.timer = this.autoTimer = this.joinTimer = null;
  }
  updateRacing() {
    const racing = this.racing;
    if (racing === this.wasRacing) return;
    this.wasRacing = racing;
    this.deps.racingChanged(racing);
  }
  // ───────────── Network ─────────────
  onPeerOffline(id) {
    for (const [gid, inv] of this.invites) if (inv.hostId === id) this.invites.delete(gid);
    const g = this.game;
    if (!g) return this.deps.changed();
    if (g.role === "guest" && g.hostId === id) {
      if (g.phase === "joining" || g.phase === "lobby") this.close(`${g.hostName} went offline \u2013 the lobby is gone`);
      else if (g.phase === "race") this.close(`${g.hostName} left \u2013 the race was called off`);
      if (g.rematch) g.rematch = null;
      return this.deps.changed();
    }
    if (g.role === "host") {
      if (g.phase === "lobby" && this.lobby && playerOf(this.lobby, id)) {
        this.lobby = leave(this.lobby, id);
        return this.lobbyChanged();
      }
      if (g.phase === "race") {
        const r = g.racers.find((x) => x.id === id);
        if (r && !r.left) {
          r.left = true;
          this.checkEnd();
          this.deps.changed();
        }
      }
    }
  }
  onWire(from, m) {
    switch (m.t) {
      case "invite":
        return this.onInvite(from, m);
      case "invite_cancel":
        return this.onCancel(from, m.gid, m.reason);
      case "join":
        return this.onJoin(from, m.gid);
      case "invite_decline": {
        const h = this.hosting;
        if (!h || h.lobby.gid !== m.gid || h.game.phase !== "lobby") return;
        const p = playerOf(h.lobby, from);
        if (p?.status !== "invited") return;
        this.lobby = decline(h.lobby, from, m.busy);
        this.deps.toast(m.busy ? `${p.name} is busy racing` : `${p.name} declined`, "info");
        return this.lobbyChanged();
      }
      case "leave":
        return this.onLeave(from, m.gid);
      case "lobby": {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "joining" && g.phase !== "lobby") return;
        if (this.joinTimer) clearTimeout(this.joinTimer);
        this.joinTimer = null;
        g.phase = "lobby";
        g.settings = { mode: m.mode, param: m.param };
        g.players = m.players.map((p) => ({ ...p }));
        g.autoStartAt = m.starting !== void 0 ? this.now() + m.starting : null;
        return this.deps.changed();
      }
      case "kick": {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "joining" && g.phase !== "lobby") return;
        this.reset();
        this.deps.toast(`${g.hostName} removed you from the lobby`, "error");
        return;
      }
      case "lchat": {
        if (m.from === void 0) {
          const h = this.hosting;
          if (!h || h.lobby.gid !== m.gid || h.game.phase !== "lobby") return;
          const p = playerOf(h.lobby, from);
          if (p?.status !== "joined") return;
          return this.relayChat(from, p.name, m.text);
        }
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "lobby") return;
        return this.addChat(g, m.from, m.name ?? "Unknown", m.text);
      }
      case "start": {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "lobby") return;
        const me = this.deps.me().id;
        if (!m.players.some((p) => p.id === me)) return;
        g.settings = { mode: m.mode, param: m.param };
        g.autoStartAt = null;
        return this.beginRace(m.words, m.players, m.countdownMs);
      }
      case "progress":
        return this.onProgress(from, m);
      case "standings": {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "race") return;
        const me = this.deps.me().id;
        for (const s of m.players) {
          const r = g.racers.find((x) => x.id === s.id);
          if (!r || s.id === me) continue;
          const { id: _id, status, ...rest } = s;
          r.left = status === "left";
          r.progress = { ...rest, status: status === "left" ? r.progress?.status ?? "racing" : status };
        }
        return this.deps.changed();
      }
      case "results": {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== "race") return;
        return this.showResults(m.players.map((p) => ({ ...p })));
      }
    }
  }
  /** Our game as a guest, if `from` is its host and `gid` matches. */
  guestGame(from, gid) {
    const g = this.game;
    return g && g.role === "guest" && g.gid === gid && g.hostId === from ? g : null;
  }
  onInvite(from, m) {
    if (!this.deps.isFriend(from)) return;
    const me = this.deps.me().id;
    if (!m.players.some((p) => p.id === me)) return;
    if (this.game?.phase === "race") {
      this.deps.send(from, { t: "invite_decline", gid: m.gid, busy: true });
      return;
    }
    const hostName = this.deps.nameOf(from);
    const inv = { gid: m.gid, hostId: from, hostName, settings: { mode: m.mode, param: m.param }, players: m.players, at: Date.now() };
    for (const [gid, old] of this.invites) if (old.hostId === from) this.invites.delete(gid);
    this.invites.set(m.gid, inv);
    const g = this.game;
    if (g && g.role === "guest" && g.hostId === from && g.phase === "results") g.rematch = inv;
    const text = `${hostName} invites you to ${settingsPhrase(inv.settings)}`;
    if (!this.deps.quiet?.()) {
      this.deps.toast(text, "info");
      this.deps.notify("keyrace", text);
    }
    this.deps.changed();
  }
  onCancel(from, gid, reason) {
    const inv = this.invites.get(gid);
    if (inv && inv.hostId === from) {
      this.invites.delete(gid);
      if (this.game?.rematch?.gid === gid) this.game.rematch = null;
      this.deps.changed();
    }
    const g = this.guestGame(from, gid);
    if (!g) return;
    if (g.phase === "race" || reason === "host_left") this.close(`${g.hostName} left \u2013 the race was called off`);
    else if (g.phase === "joining" || g.phase === "lobby") {
      this.reset();
      this.deps.toast(reason === "started" ? `${g.hostName} started without you` : `${g.hostName} closed the lobby`, "error");
    }
  }
  onJoin(from, gid) {
    const h = this.hosting;
    if (!h || h.lobby.gid !== gid) return void this.deps.send(from, { t: "invite_cancel", gid, reason: "closed" });
    if (h.game.phase !== "lobby") return void this.deps.send(from, { t: "invite_cancel", gid, reason: "started" });
    const { lobby, ok } = join(h.lobby, from);
    if (!ok) return void this.deps.send(from, { t: "invite_cancel", gid, reason: "closed" });
    this.lobby = lobby;
    this.lobbyChanged();
  }
  onLeave(from, gid) {
    const h = this.hosting;
    if (!h || h.lobby.gid !== gid) return;
    if (h.game.phase === "lobby") {
      this.lobby = leave(h.lobby, from);
      return this.lobbyChanged();
    }
    if (h.game.phase === "race") {
      const r = h.game.racers.find((x) => x.id === from);
      if (!r || r.left) return;
      r.left = true;
      this.checkEnd();
      this.deps.changed();
    }
  }
  /** Host: a guest's progress. Must only move forward and stay humanly possible. */
  onProgress(from, m) {
    const g = this.game;
    if (!g || g.role !== "host" || g.gid !== m.gid || g.phase !== "race" || !g.engine) return;
    const r = g.racers.find((x) => x.id === from);
    if (!r || r.left) return;
    const prev = r.progress;
    const { t: _type, gid: _gid, completed: claimed, ...p } = m;
    if (p.status === "left") return;
    if (prev) {
      if (prev.status !== "racing") return;
      if (p.chars < prev.chars || p.words < prev.words || p.errors < prev.errors || p.keys < prev.keys || p.ms < prev.ms) return;
    }
    const hostElapsed = this.now() - g.engine.startAt;
    const ms = Math.min(p.ms, Math.max(0, hostElapsed + 2e3));
    if (p.chars > 30 && wpmOf(p.chars, ms) > this.t.maxWpm) {
      if (p.status !== "racing") {
        const last = prev ?? { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: "racing", ms: 0 };
        r.progress = { ...last, status: p.status, ms };
        delete r.progress.completed;
        this.checkEnd();
        this.deps.changed();
      }
      return;
    }
    const completed = g.settings.mode === "race" && claimed === true && p.words >= g.settings.param;
    r.progress = { ...p, status: p.status, ms, ...completed ? { completed: true } : {} };
    this.checkEnd();
    this.deps.changed();
  }
};

// src/core/config.ts
function readConfig(paths) {
  const c2 = readJson(paths.config, null) ?? {};
  return Number.isInteger(c2.port) ? { port: c2.port } : {};
}

// src/core/store.ts
var FRIEND_ORDER = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.results = new ResultsBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.net = new FriendNet({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port ?? readConfig(opts.paths).port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: opts.discoveryOptions,
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: WIRE,
      hooks: {
        changed: () => this.changed(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: (s, m) => this.games.onWire(s.peerId, m),
        offline: (id) => this.games.onPeerOffline(id),
        presenceExtra: () => this.games.racing ? { racing: true } : {},
        knowsId: (id) => this.results.knows(id),
        rekey: (oldId, newId) => this.results.rekey(oldId, newId),
        settings: (s) => this.applySettings(s)
      }
    });
    this.applySettings(this.hub.settings.get());
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.games = new GameManager({
      me: () => ({ id: this.identity.id, name: this.net.name }),
      send: (id, msg) => this.net.send(id, msg),
      isOnline: (id) => this.net.isOnline(id),
      isFriend: (id) => this.contacts.get(id)?.state === "accepted",
      nameOf: (id) => this.peerName(id),
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.net.notify(title, body),
      quiet: () => this.net.dnd,
      save: (rec) => this.saveResult(rec),
      racingChanged: () => this.net.broadcastPresence(),
      tuning: opts.tuning
    });
  }
  net;
  hub;
  games;
  results;
  paths;
  toasts;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths, name) {
    return Hub.createProfile(paths.hub, name).id;
  }
  /** Is there a profile yet (in any app)? */
  static hasProfile(paths) {
    return Hub.hasProfile(paths.hub);
  }
  // ───────────── Shortcuts ─────────────
  get identity() {
    return this.net.identity;
  }
  get contacts() {
    return this.net.contacts;
  }
  get network() {
    return this.net.network;
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.net.start();
    this.changed();
  }
  async stop() {
    this.games.leave();
    this.games.stop();
    this.toasts.stop();
    await this.net.stop();
  }
  // ───────────── Subscription for React ─────────────
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }
  applySettings(s) {
    if (setAccent(s.accent)) this.changed();
  }
  // ───────────── Queries ─────────────
  get me() {
    return this.net.me;
  }
  get toast() {
    return this.toasts.current;
  }
  get settings() {
    return this.net.settings;
  }
  isOnline(id) {
    return this.net.isOnline(id);
  }
  friend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const online = this.isOnline(id);
    const p = this.net.presenceOf(id);
    return {
      ...c2,
      display: displayName(c2),
      online,
      away: online && (p?.away ?? false),
      racing: online && p?.extra.racing === true,
      status: p?.status ?? "available",
      ...p?.msg ? { statusMsg: p.msg } : {}
    };
  }
  /** Best name for any peer: own nickname/friend name, else what we remember from races. */
  peerName(id) {
    return this.net.peerName(id);
  }
  /** Accepted friends who are online right now (who can be invited). */
  onlineFriends() {
    return this.contacts.all().filter((c2) => c2.state === "accepted" && this.isOnline(c2.id)).map((c2) => this.friend(c2.id)).sort((a, b) => a.display.localeCompare(b.display));
  }
  dashboard() {
    const all = this.contacts.all().map((c2) => this.friend(c2.id));
    const presence = (f) => f.state !== "accepted" ? 4 : f.racing ? 0 : f.online && !f.away ? 1 : f.away ? 2 : 3;
    const friends = all.filter((f) => f.state !== "incoming").sort(
      (a, b) => FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display)
    );
    const requests = [
      ...this.games.pendingInvites().map((invite2) => ({ kind: "invite", invite: invite2 })),
      ...all.filter((f) => f.state === "incoming").sort((a, b) => b.lastActivity - a.lastActivity).map((friend) => ({ kind: "friend", friend }))
    ];
    return { requests, friends, nearby: this.net.nearby() };
  }
  /** Number of accepted friends online. */
  onlineCount() {
    return this.net.onlineCount();
  }
  stats() {
    return this.results.stats(this.identity.id);
  }
  leaderboard() {
    const friends = /* @__PURE__ */ new Map();
    for (const c2 of this.contacts.all()) if (c2.state === "accepted") friends.set(c2.id, displayName(c2));
    return leaderboard(this.stats(), { id: this.identity.id, name: this.net.name }, friends);
  }
  safetyCodeWith(id) {
    return this.net.safetyCodeWith(id);
  }
  // ───────────── UI helpers ─────────────
  showToast(text, kind = "info") {
    this.toasts.show(text, kind);
  }
  log(line) {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }
  onEvent(e) {
    switch (e.kind) {
      case "accepted":
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, "success");
      case "incoming":
        this.showToast(`${e.who} wants to be friends`, "info");
        return this.net.notify("keyrace", `${e.who} wants to be friends`);
      case "removedUs":
        return this.showToast(`${e.who} removed you as a friend \u2013 your request is waiting to be accepted`, "error");
      case "declinedUs":
        return this.showToast(`${e.who} declined your friend request`, "error");
      case "withdrawn":
        return this.showToast(`${e.who} withdrew their friend request`);
      case "requestSent":
        return this.showToast(`Friend request sent to ${e.who} \u2013 waiting for them to accept`);
      case "unreachable":
        return this.showToast(
          `Can't reach ${e.who} at ${e.ip}:${e.port} yet \u2013 still trying. A firewall may be blocking keyrace (Windows: allow Node.js for public networks \xB7 macOS: allow incoming connections for node).`,
          "error"
        );
      case "linked":
        return;
    }
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const name = this.net.discovery?.peers.get(id)?.name;
    const r = this.net.requestNearby(id);
    if (r === "sent") this.showToast(`Friend request sent to ${name ?? "them"}`);
    else if (r === "accepted") this.showToast(`You and ${this.peerName(id)} are now friends`, "success");
  }
  /** Ask again (after a decline). */
  request(id) {
    this.net.request(id);
    this.showToast("Friend request sent again");
  }
  /** Add a friend by IP – for networks that block broadcast. */
  addByAddress(host, port = APP.tcpPort) {
    return this.net.addByAddress(host, port);
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (c2 && this.net.accept(id)) this.showToast(`You and ${displayName(c2)} are now friends`, "success");
  }
  decline(id) {
    const c2 = this.net.decline(id);
    if (c2) this.showToast(`Declined ${displayName(c2)}'s request`);
  }
  block(id) {
    const c2 = this.net.block(id);
    if (c2) this.showToast(`${displayName(c2)} is blocked. No more connections will be accepted.`, "error");
  }
  unblock(id) {
    const c2 = this.net.unblock(id);
    if (c2) this.showToast(`Unblocked ${displayName(c2)} \u2013 friend request sent`, "success");
  }
  removeFriend(id) {
    const c2 = this.contacts.get(id);
    if (c2) this.net.peerBook.update(id, { name: displayName(c2) });
    this.net.remove(id);
  }
  rename(id, alias) {
    this.net.rename(id, alias);
  }
  /** Changes the shared name (all apps). */
  setName(name) {
    return this.net.setName(name);
  }
  // ───────────── Presence and notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    this.net.setFocused(focused);
  }
  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused() {
    return this.net.isFocused;
  }
  /** Do not disturb (profile status): invites wait quietly, no notifications. */
  get dnd() {
    return this.net.dnd;
  }
  notificationsEnabled() {
    return this.net.notificationsEnabled();
  }
  setNotifications(on) {
    this.net.setNotifications(on);
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`keyrace ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
  // ───────────── Races ─────────────
  saveResult(rec) {
    for (const p of rec.players) {
      if (p.id !== this.identity.id && !this.contacts.get(p.id)) this.net.peerBook.update(p.id, { name: p.name, lastSeen: rec.ts });
    }
    return this.results.add(rec);
  }
};

// ../termcore/src/ui/components/Header.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var friendsOnline = (n, wide) => wide ? n === 1 ? "friend online" : "friends online" : "online";
function Header({ app, version, width, me, address, online, onlineLabel = friendsOnline, updateAvailable }) {
  const wide = width >= 72;
  const status = me.status && me.status !== "available" ? presenceDot({ online: true, status: me.status }) : null;
  const statusLine = wide ? statusText(me.status, me.statusMsg) : "";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: theme.onAccent, bold: true, children: ` ${app} ` }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          version
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: me.color, children: me.name }),
        status ? /* @__PURE__ */ jsxs(Text, { color: status.color, children: [
          " ",
          status.icon
        ] }) : null,
        statusLine ? /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          statusLine
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: address }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " ",
          onlineLabel(online, wide)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// ../termcore/src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";

// ../termcore/src/ui/text.ts
import chalk2 from "chalk";
import wrapAnsi from "wrap-ansi";
function inline(text) {
  return text.replace(/`([^`]+)`/g, (_m, s) => chalk2.hex(theme.accent)(s)).replace(/\*\*([^*]+)\*\*/g, (_m, s) => chalk2.bold(s)).replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, (_m, pre, s) => pre + chalk2.hex(theme.dim)(s));
}
function renderText(text, width) {
  const out = [];
  for (const raw of text.split("\n")) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) {
      out.push(chalk2.bold(inline(h[1])));
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (li) {
      const indent = li[1].length;
      const body = wrapAnsi(inline(li[2]), Math.max(10, width - indent - 2), { hard: true }).split("\n");
      body.forEach((l, i) => out.push(" ".repeat(indent) + (i === 0 ? chalk2.hex(theme.dim)("\u2022 ") : "  ") + l));
      continue;
    }
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapAnsi(inline(raw), Math.max(10, width), { hard: true }).split("\n"));
  }
  return out;
}

// ../termcore/src/ui/components/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({
  text,
  width,
  height,
  onClose,
  render: render2 = renderText
}) {
  useInput(() => onClose());
  const lines = render2(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: l || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// ../termcore/src/ui/hooks.ts
import { useStdout } from "ink";
import { useEffect, useState, useSyncExternalStore } from "react";
function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}
function useStoreVersion(store) {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}
function useTicker(ms, active) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return tick;
}

// ../termcore/src/ui/mouse.ts
import { EventEmitter as EventEmitter6 } from "events";
import { PassThrough } from "stream";
import { useEffect as useEffect2, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h\x1B[?2004h";
var MOUSE_OFF = "\x1B[?2004l\x1B[?1004l\x1B[?1007l";
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
var PASTE_PENDING_MS = 1e3;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending2 = "") {
  const s = pending2 + input;
  const events = [];
  const focus = [];
  const pastes = [];
  let text = "";
  let i = 0;
  const done = (rest) => finish(text, events, rest, focus, pastes);
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);
    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      if (end === -1) return done(rest);
      pastes.push(rest.slice(PASTE_START.length, end));
      i = esc + end + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(PASTE_END)) {
      i = esc + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === "I");
      i = esc + 3;
      continue;
    }
    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === "M" ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(rest);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest) || rest.length < PASTE_START.length && PASTE_START.startsWith(rest)) {
      return done(rest);
    }
    text += ESC;
    i = esc + 1;
  }
  return done("");
}
function finish(text, events, pending2, focus, pastes) {
  return { text, events, pending: pending2, ...focus.length ? { focus } : {}, ...pastes.length ? { pastes } : {} };
}
var mouse = new EventEmitter6();
var pasteHandlers = [];
function emitPaste(text) {
  for (let i = pasteHandlers.length - 1; i >= 0; i--) if (pasteHandlers[i].cb(text)) return true;
  return false;
}
var MouseFilterStdin = class extends PassThrough {
  constructor(source) {
    super();
    this.source = source;
    source.setEncoding("utf8");
    source.on("data", this.onData);
    source.resume();
  }
  isTTY = true;
  pending = "";
  timer = null;
  onData = (chunk) => this.feed(chunk);
  /**
   * Stops reading the terminal: the real stdin is paused and no longer fed in here. termhub
   * does this before another app takes over the terminal, so no keystroke goes to both.
   */
  detach() {
    this.source.off("data", this.onData);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = "";
    try {
      this.source.setRawMode(false);
    } catch {
    }
    this.source.pause();
  }
  feed(chunk) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit("wheel", e);
    for (const f of r.focus ?? []) mouse.emit("focus", f);
    if (r.text) this.write(r.text);
    for (const p of r.pastes ?? []) this.paste(p);
    if (this.pending) {
      const inPaste = this.pending.startsWith(PASTE_START);
      this.timer = setTimeout(
        () => {
          const p = this.pending;
          this.pending = "";
          if (inPaste) this.paste(p.slice(PASTE_START.length));
          else if (p) this.write(p);
        },
        inPaste ? PASTE_PENDING_MS : PENDING_MS
      );
    }
  }
  paste(text) {
    if (!emitPaste(text) && text) this.write(text);
  }
  setRawMode(mode) {
    this.source.setRawMode(mode);
    return this;
  }
  ref() {
    this.source.ref();
    return this;
  }
  unref() {
    this.source.unref();
    return this;
  }
};
function usePaste(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const h = { cb: (text) => latest.current(text) };
    pasteHandlers.push(h);
    return () => {
      pasteHandlers.splice(pasteHandlers.indexOf(h), 1);
    };
  }, [isActive]);
}
function useWheel(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const on = (dir) => latest.current(dir);
    mouse.on("wheel", on);
    return () => {
      mouse.off("wheel", on);
    };
  }, [isActive]);
}

// src/ui/screens/Dashboard.tsx
import { Box as Box9, Text as Text10, useInput as useInput4 } from "ink";
import { useEffect as useEffect5, useRef as useRef3, useState as useState5 } from "react";

// src/ui/components/Banner.tsx
import { Box as Box3, Text as Text4 } from "ink";

// ../termcore/src/ui/components/Logo.tsx
import { Text as Text3 } from "ink";
import stringWidth from "string-width";

// ../termcore/src/ui/effects.ts
import chalk3 from "chalk";
import { useEffect as useEffect3, useState as useState2 } from "react";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
var SHINE_EVERY = 6e3;
function shineColor(base, col2, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col2 + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
function shineLine(line, row, width, hex, t) {
  if (t < 0 || t >= SHINE_SWEEP) return chalk3.hex(hex)(line);
  const base = hexToRgb(hex);
  let out = "";
  let col2 = 0;
  for (const ch of line) {
    if (ch === " ") out += ch;
    else {
      const [r, g, b] = shineColor(base, col2, row, width, t);
      out += chalk3.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    }
    col2++;
  }
  return out;
}
var BRIEF_GLINTS = 2;
function useShine(active, mode = "brief", delay = 250) {
  const [t, setT] = useState2(-1);
  useEffect3(() => {
    if (!active || mode === "off") {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    let played = 0;
    const play = () => {
      const t0 = Date.now();
      played++;
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        if (mode === "nonstop" || played < BRIEF_GLINTS) next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, mode, delay]);
  return t;
}

// ../termcore/src/ui/components/Logo.tsx
import { Fragment as Fragment2, jsx as jsx3 } from "react/jsx-runtime";
function Logo({ lines, animate = true, mode = "brief", color }) {
  const t = useShine(animate, mode);
  const width = Math.max(...lines.map((l) => stringWidth(l)));
  return /* @__PURE__ */ jsx3(Fragment2, { children: lines.map((line, i) => /* @__PURE__ */ jsx3(Text3, { children: shineLine(line, i, width, color ?? theme.accent, t) }, i)) });
}

// src/ui/components/Banner.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D",
  "\u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2557   \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2557  ",
  "\u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u255D    \u255A\u2588\u2588\u2554\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u255D  ",
  "\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D   \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];
var LOGO_SMALL = ["\u2588\u2584\u2580 \u2588\u2580\u2580 \u2588\u2584\u2588 \u2588\u2580\u2588 \u2584\u2580\u2588 \u2588\u2580\u2580 \u2588\u2580\u2580", "\u2588 \u2588 \u2588\u2588\u2584  \u2588  \u2588\u2580\u2584 \u2588\u2580\u2588 \u2588\u2584\u2584 \u2588\u2588\u2584"];
function bannerCompact(width, rows) {
  return width < 80 || rows < 22;
}
function bannerHeight(compact2) {
  return (compact2 ? LOGO_SMALL.length : LOGO.length) + 3;
}
function Banner({
  width,
  compact: compact2,
  selected,
  animate = true,
  mode = "brief"
}) {
  const race = selected === "race";
  const solo = selected === "solo";
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    /* @__PURE__ */ jsx4(Logo, { lines: compact2 ? LOGO_SMALL : LOGO, animate, mode }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    /* @__PURE__ */ jsxs3(Box3, { children: [
      /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: race ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx4(Text4, { backgroundColor: race ? theme.accent : void 0, color: race ? theme.onAccent : theme.accent, bold: true, children: ` ${icons.racing} Start a race ` }),
      /* @__PURE__ */ jsx4(Text4, { color: theme.dim, children: solo ? "      " : " enter" }),
      /* @__PURE__ */ jsx4(Text4, { color: theme.faint, children: "   " }),
      /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: solo ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx4(Text4, { backgroundColor: solo ? theme.accent : void 0, color: solo ? theme.onAccent : void 0, bold: solo, children: " Solo practice " }),
      /* @__PURE__ */ jsx4(Text4, { color: theme.dim, children: solo ? " enter" : " s    " })
    ] }),
    /* @__PURE__ */ jsx4(Text4, { children: " " })
  ] });
}

// ../termcore/src/ui/components/CommandMenu.tsx
import { Box as Box4, Text as Text5 } from "ink";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start3 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start3, start3 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx5(Box4, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start3 + i === selected;
    return /* @__PURE__ */ jsxs4(Box4, { children: [
      /* @__PURE__ */ jsx5(Box4, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx5(Text5, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx5(Text5, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Box as Box6, Text as Text7, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// ../termcore/src/ui/editor.ts
import stringWidth2 from "string-width";
var emptyEditor = { value: "", cursor: 0 };
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function graphemes(text) {
  return [...segmenter.segment(text)].map((s) => ({ segment: s.segment, index: s.index }));
}
function prevBoundary(value, cursor) {
  let prev = 0;
  for (const g of graphemes(value)) {
    if (g.index >= cursor) break;
    prev = g.index;
  }
  return prev;
}
function nextBoundary(value, cursor) {
  for (const g of graphemes(value)) {
    if (g.index >= cursor) return g.index + g.segment.length;
  }
  return value.length;
}
var isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);
function wordLeft(value, cursor) {
  let i = cursor;
  while (i > 0 && !isWordChar(value[i - 1])) i--;
  while (i > 0 && isWordChar(value[i - 1])) i--;
  return i;
}
function wordRight(value, cursor) {
  let i = cursor;
  while (i < value.length && !isWordChar(value[i])) i++;
  while (i < value.length && isWordChar(value[i])) i++;
  return i;
}
var lineStart = (value, cursor) => value.lastIndexOf("\n", cursor - 1) + 1;
var lineEnd = (value, cursor) => {
  const i = value.indexOf("\n", cursor);
  return i === -1 ? value.length : i;
};
var edit = {
  insert(s, text) {
    return { value: s.value.slice(0, s.cursor) + text + s.value.slice(s.cursor), cursor: s.cursor + text.length };
  },
  backspace(s) {
    if (s.cursor === 0) return s;
    const p = prevBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  deleteForward(s) {
    if (s.cursor >= s.value.length) return s;
    const n = nextBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(n), cursor: s.cursor };
  },
  deleteWordBack(s) {
    const p = wordLeft(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineStart(s) {
    const p = lineStart(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineEnd(s) {
    const e = lineEnd(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(e), cursor: s.cursor };
  },
  left: (s) => ({ ...s, cursor: prevBoundary(s.value, s.cursor) }),
  right: (s) => ({ ...s, cursor: nextBoundary(s.value, s.cursor) }),
  wordLeft: (s) => ({ ...s, cursor: wordLeft(s.value, s.cursor) }),
  wordRight: (s) => ({ ...s, cursor: wordRight(s.value, s.cursor) }),
  home: (s) => ({ ...s, cursor: lineStart(s.value, s.cursor) }),
  end: (s) => ({ ...s, cursor: lineEnd(s.value, s.cursor) }),
  /** One line up/down; `null` if already on the first/last line. */
  vertical(s, dir) {
    const start3 = lineStart(s.value, s.cursor);
    const col2 = s.cursor - start3;
    if (dir === -1) {
      if (start3 === 0) return null;
      const prevStart = lineStart(s.value, start3 - 1);
      return { ...s, cursor: Math.min(prevStart + col2, start3 - 1) };
    }
    const end = lineEnd(s.value, s.cursor);
    if (end === s.value.length) return null;
    const nextEnd = lineEnd(s.value, end + 1);
    return { ...s, cursor: Math.min(end + 1 + col2, nextEnd) };
  }
};
function cleanPaste(text) {
  return text.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}
function layoutEditor(s, width) {
  const w = Math.max(1, width);
  const lines = [];
  let offset = 0;
  for (const logical of s.value.split("\n")) {
    let current = "";
    let currentWidth = 0;
    let cursorAt = null;
    for (const g of graphemes(logical)) {
      const gw = stringWidth2(g.segment);
      if (currentWidth + gw > w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      if (offset + g.index === s.cursor) cursorAt = current.length;
      current += g.segment;
      currentWidth += gw;
    }
    if (offset + logical.length === s.cursor) {
      if (currentWidth >= w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      cursorAt = current.length;
    }
    lines.push({ text: current, cursor: cursorAt });
    offset += logical.length + 1;
  }
  return lines;
}

// ../termcore/src/ui/components/InputBox.tsx
import { Box as Box5, Text as Text6, useInput as useInput2 } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function inputBoxHeight(state, width, maxLines = 8) {
  return Math.min(layoutEditor(state, contentWidth(width)).length, maxLines) + 2;
}
var contentWidth = (width) => Math.max(
  4,
  width - 2 - 2 - 2
  /* Prompt */
);
function InputBox({
  state,
  onChange,
  onSubmit,
  isActive,
  width,
  placeholder,
  maxLines = 8,
  history = [],
  onKey,
  singleLine = false,
  borderColor = theme.border,
  maxLength,
  onPaste,
  afterType
}) {
  const histIndex = useRef2(null);
  const draft = useRef2("");
  const latest = useRef2(state);
  latest.current = state;
  const change = (next) => {
    latest.current = next;
    onChange(next);
  };
  const recall = (dir) => {
    if (!history.length) return false;
    let idx = histIndex.current;
    if (idx === null) {
      if (dir === 1) return false;
      draft.current = latest.current.value;
      idx = history.length;
    }
    idx += dir;
    if (idx < 0) return true;
    if (idx >= history.length) {
      histIndex.current = null;
      change({ value: draft.current, cursor: draft.current.length });
      return true;
    }
    histIndex.current = idx;
    const v = history[idx];
    change({ value: v, cursor: v.length });
    return true;
  };
  const insertText = (raw, typed = false) => {
    let text = cleanPaste(raw);
    if (singleLine) text = text.replace(/\n/g, " ");
    const state2 = latest.current;
    if (!text) return;
    if (maxLength !== void 0 && [...state2.value].length + [...text].length > maxLength) return;
    histIndex.current = null;
    const next = edit.insert(state2, text);
    change(typed && afterType ? afterType(next, raw) : next);
  };
  usePaste((text) => {
    if (!onPaste?.(text)) insertText(text);
    return true;
  }, isActive);
  useInput2(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === "c") return;
      const state2 = latest.current;
      const set = (next) => {
        histIndex.current = null;
        change(next);
      };
      if (key.return) {
        if (!singleLine && key.meta) return set(edit.insert(state2, "\n"));
        if (!singleLine && state2.value[state2.cursor - 1] === "\\") {
          return set(edit.insert(edit.backspace(state2), "\n"));
        }
        histIndex.current = null;
        onSubmit(state2.value);
        return;
      }
      if (key.escape) return;
      if (key.tab) return;
      if ((key.backspace || key.delete) && key.meta) return set(edit.deleteWordBack(state2));
      if (key.backspace || key.delete) return set(edit.backspace(state2));
      if (key.leftArrow) return set(key.meta || key.ctrl ? edit.wordLeft(state2) : edit.left(state2));
      if (key.rightArrow) return set(key.meta || key.ctrl ? edit.wordRight(state2) : edit.right(state2));
      if (key.home) return set(edit.home(state2));
      if (key.end) return set(edit.end(state2));
      if (key.upArrow) {
        const moved = edit.vertical(state2, -1);
        if (moved) return set(moved);
        recall(-1);
        return;
      }
      if (key.downArrow) {
        const moved = edit.vertical(state2, 1);
        if (moved) return set(moved);
        recall(1);
        return;
      }
      if (key.pageUp || key.pageDown) return;
      if (key.ctrl) {
        switch (input) {
          case "a":
            return set(edit.home(state2));
          case "e":
            return set(edit.end(state2));
          case "u":
            return set(edit.killToLineStart(state2));
          case "k":
            return set(edit.killToLineEnd(state2));
          case "w":
            return set(edit.deleteWordBack(state2));
          case "d":
            return set(edit.deleteForward(state2));
          case "j":
            return singleLine ? void 0 : set(edit.insert(state2, "\n"));
          default:
            return;
        }
      }
      if (key.meta) {
        if (input === "b") return set(edit.wordLeft(state2));
        if (input === "f") return set(edit.wordRight(state2));
        return;
      }
      if (input.length > 1 && onPaste?.(input)) return;
      insertText(input, true);
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start3 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start3, start3 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx6(Box5, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start3 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx6(Text6, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx6(Text6, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx6(Text6, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  if (d.kind === "custom") return d.height;
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx7(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx7(PromptDialog, { spec, width });
  if (spec.kind === "custom") return /* @__PURE__ */ jsx7(Fragment3, { children: spec.render(width) });
  return /* @__PURE__ */ jsx7(PickDialog, { spec, width });
}
function DialogFrame({ width, children }) {
  return /* @__PURE__ */ jsx7(Box6, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx7(Text7, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs6(Text7, { color: theme.dim, children: [
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState3(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx7(Text7, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx7(
      InputBox,
      {
        state,
        onChange: setState,
        onSubmit: (v) => spec.resolve(v.trim()),
        onKey: (_i, key) => {
          if (key.escape) {
            spec.resolve(null);
            return true;
          }
          return false;
        },
        isActive: true,
        singleLine: true,
        width: width - 4
      }
    ),
    /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
  ] });
}
function PickDialog({ spec, width }) {
  const [cursor, setCursor] = useState3(() => Math.max(0, spec.options.findIndex((o) => o.id === spec.opts?.initial)));
  const [chosen, setChosen] = useState3(() => new Set(spec.opts?.preselect ?? []));
  const n = spec.options.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput3((input, key) => {
    if (key.escape) return spec.resolve(null);
    if (key.upArrow || input === "k") return setCursor((c2) => (c2 - 1 + n) % n);
    if (key.downArrow || input === "j") return setCursor((c2) => (c2 + 1) % n);
    const current = spec.options[cursor];
    if (input === " " && spec.multi && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (key.return) {
      if (!spec.multi) return spec.resolve(current ? [current.id] : []);
      if (chosen.size) return spec.resolve(spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id));
      spec.resolve(spec.opts?.emptyOk || !current ? [] : [current.id]);
    }
  });
  const start3 = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start3, start3 + PICK_VISIBLE);
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsxs6(Text7, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs6(Text7, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start3 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs6(Text7, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx7(Text7, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx7(Text7, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs6(Text7, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// ../termcore/src/ui/components/Footer.tsx
import { Box as Box7, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var kindStyle = (kind) => kind === "success" ? { color: theme.success, icon: icons.done } : kind === "error" ? { color: theme.error, icon: icons.error } : { color: theme.accent, icon: icons.request };
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = kindStyle(toast.kind);
    return /* @__PURE__ */ jsx8(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsxs7(Text8, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs7(Text8, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx8(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// src/ui/components/StatsPanel.tsx
import { Box as Box8, Text as Text9 } from "ink";
import { Fragment as Fragment4, jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
var Title = ({ children }) => /* @__PURE__ */ jsx9(Text9, { color: theme.dim, bold: true, children: children.toUpperCase() });
function bestOf(store, mode) {
  let out = null;
  for (const param of PARAMS[mode]) {
    const b = store.stats().bests.get(bestKey(mode, param));
    if (!b) continue;
    const better = !out || (mode === "sudden" ? b.timeMs > out.best.timeMs : b.wpm > out.best.wpm);
    if (better) out = { param, best: b };
  }
  return out;
}
function Row({ label, value, width }) {
  return /* @__PURE__ */ jsxs8(Box8, { width, children: [
    /* @__PURE__ */ jsx9(Box8, { width: Math.min(16, Math.floor(width / 2)), flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "truncate-end", children: label }) }),
    /* @__PURE__ */ jsx9(Text9, { wrap: "truncate-end", children: value })
  ] });
}
function panelHeight(store, friend, compact2) {
  if (friend) {
    const h = store.stats().h2h.get(friend.id);
    if (!h) return compact2 ? 4 : 5;
    if (compact2) return h.last ? 6 : 4;
    return 2 + 1 + 1 + 1 + 1 + 2 + (h.last ? 3 : 0);
  }
  if (compact2) return 6;
  const leaders = Math.min(5, store.leaderboard().length);
  return 10 + (leaders > 1 ? 2 + leaders : 0);
}
function StatsPanel({ store, friend, width, compact: compact2 }) {
  const inner = width - 4;
  const stats = store.stats();
  if (friend) {
    const h = stats.h2h.get(friend.id);
    const name = friend.display;
    return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", borderStyle: "round", borderColor: theme.border, paddingX: 1, width, flexShrink: 0, children: [
      /* @__PURE__ */ jsx9(Title, { children: `You vs ${name}` }),
      !h ? /* @__PURE__ */ jsxs8(Fragment4, { children: [
        /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "truncate-end", children: "No races together yet." }),
        !compact2 ? /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-end", children: [
          "Press enter to invite ",
          name,
          "."
        ] }) : null
      ] }) : /* @__PURE__ */ jsxs8(Fragment4, { children: [
        /* @__PURE__ */ jsxs8(Text9, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: "you " }),
          /* @__PURE__ */ jsx9(Text9, { bold: true, color: h.wins >= h.losses ? theme.success : void 0, children: h.wins }),
          /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: " : " }),
          /* @__PURE__ */ jsx9(Text9, { bold: true, color: h.losses > h.wins ? theme.error : void 0, children: h.losses }),
          /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, children: [
            " ",
            name
          ] })
        ] }),
        !compact2 ? /* @__PURE__ */ jsxs8(Fragment4, { children: [
          /* @__PURE__ */ jsxs8(Text9, { color: theme.faint, children: [
            h.races,
            " ",
            h.races === 1 ? "race" : "races",
            " together"
          ] }),
          /* @__PURE__ */ jsx9(Text9, { children: " " }),
          /* @__PURE__ */ jsx9(Row, { label: "Your best", value: `${Math.round(h.myBestWpm)} wpm`, width: inner }),
          /* @__PURE__ */ jsx9(Row, { label: `${name}'s best`, value: `${Math.round(h.theirBestWpm)} wpm`, width: inner })
        ] }) : null,
        h.last ? /* @__PURE__ */ jsxs8(Fragment4, { children: [
          !compact2 ? /* @__PURE__ */ jsx9(Text9, { children: " " }) : null,
          /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-end", children: [
            "Last duel \xB7 ",
            settingsLabel(h.last)
          ] }),
          /* @__PURE__ */ jsxs8(Text9, { wrap: "truncate-end", children: [
            "you ",
            ordinal(h.last.myPlace),
            " \xB7 ",
            name,
            " ",
            ordinal(h.last.theirPlace),
            /* @__PURE__ */ jsxs8(Text9, { color: theme.faint, children: [
              " \xB7 ",
              shortTime(h.last.ts)
            ] })
          ] })
        ] }) : null
      ] })
    ] });
  }
  const sprint = bestOf(store, "sprint");
  const race = bestOf(store, "race");
  const sudden = bestOf(store, "sudden");
  const leaders = store.leaderboard().slice(0, 5);
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", borderStyle: "round", borderColor: theme.border, paddingX: 1, width, flexShrink: 0, children: [
    /* @__PURE__ */ jsx9(Title, { children: "Your stats" }),
    /* @__PURE__ */ jsxs8(Text9, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: stats.races }),
      /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, children: [
        " ",
        stats.races === 1 ? "race" : "races",
        " \xB7 "
      ] }),
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: stats.wins }),
      /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, children: [
        " ",
        stats.wins === 1 ? "win" : "wins"
      ] }),
      stats.races ? /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, children: [
        " (",
        pct(stats.winRate),
        ")"
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-end", children: [
      stats.solo,
      " solo \xB7 ",
      stats.avgAcc === null ? "no runs yet" : `${pct(stats.avgAcc)} avg accuracy`
    ] }),
    compact2 ? /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-end", children: [
      "best ",
      stats.bestWpm ? `${Math.round(stats.bestWpm)} wpm` : "\u2013",
      " \xB7 /stats for more"
    ] }) : /* @__PURE__ */ jsxs8(Fragment4, { children: [
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsx9(Title, { children: "Personal bests" }),
      /* @__PURE__ */ jsx9(Row, { label: sprint ? `Sprint ${sprint.param}s` : "Sprint", value: sprint ? `${Math.round(sprint.best.wpm)} wpm` : "\u2013", width: inner }),
      /* @__PURE__ */ jsx9(
        Row,
        {
          label: race ? `Race ${race.param}` : "Race",
          value: race ? `${Math.round(race.best.wpm)} wpm \xB7 ${duration(race.best.timeMs)}` : "\u2013",
          width: inner
        }
      ),
      /* @__PURE__ */ jsx9(Row, { label: "Sudden Death", value: sudden ? `${duration(sudden.best.timeMs)} survived` : "\u2013", width: inner }),
      leaders.length > 1 ? /* @__PURE__ */ jsxs8(Fragment4, { children: [
        /* @__PURE__ */ jsx9(Text9, { children: " " }),
        /* @__PURE__ */ jsx9(Title, { children: "Leaderboard \xB7 best wpm" }),
        leaders.map((r, i) => /* @__PURE__ */ jsxs8(Box8, { width: inner, children: [
          /* @__PURE__ */ jsx9(Box8, { width: 3, flexShrink: 0, children: /* @__PURE__ */ jsxs8(Text9, { color: theme.faint, children: [
            i + 1,
            "."
          ] }) }),
          /* @__PURE__ */ jsx9(Box8, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: r.isMe, color: r.isMe ? theme.accent : void 0, wrap: "truncate-end", children: r.isMe ? "You" : r.name }) }),
          /* @__PURE__ */ jsx9(Box8, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { children: Math.round(r.bestWpm) }) })
        ] }, r.id))
      ] }) : null
    ] })
  ] });
}

// ../termcore/src/ui/commands/useCommandInput.ts
import { useEffect as useEffect4, useState as useState4 } from "react";
function useCommandInput({ registry: registry2, editor, setEditor, onSubmit, onEscape }) {
  const [selected, setSelected] = useState4(0);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands = filter !== null ? registry2.suggest(filter) : [];
  const items = commands.map((c2) => ({ key: c2.name, label: `/${c2.name} ${c2.usage ?? ""}`.trimEnd(), description: c2.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  useEffect4(() => setSelected(0), [filter]);
  const complete = (cmd) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };
  const onKey = (_input, key) => {
    if (items.length) {
      const n = items.length;
      if (key.upArrow) {
        setSelected((sel - 1 + n) % n);
        return true;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % n);
        return true;
      }
      if (key.tab) {
        complete(commands[sel]);
        return true;
      }
      if (key.return && !key.meta) {
        const exact = filter ? registry2.find(filter) : void 0;
        const target = exact ?? (commands.length === 1 ? commands[0] : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands[sel]);
        else onSubmit(`/${target.name}`);
        return true;
      }
    }
    if (key.escape) {
      onEscape();
      return true;
    }
    return false;
  };
  return { items, selected: sel, onKey, submit: onSubmit };
}

// src/ui/screens/useCommandInput.ts
function useCommandInput2(opts) {
  return useCommandInput({ registry, ...opts });
}

// src/ui/screens/Dashboard.tsx
import { Fragment as Fragment5, jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var SIDE_BY_SIDE = 84;
var PANEL_WIDTH = 36;
function friendStatus(f) {
  switch (f.state) {
    case "outgoing":
      return { icon: icons.pending, color: theme.faint, text: "request sent" };
    case "declined":
      return { icon: icons.error, color: theme.faint, text: "declined your request" };
    case "blocked":
      return { icon: icons.error, color: theme.error, text: "blocked" };
    default: {
      if (!f.online) return { icon: icons.offline, color: theme.faint, text: "offline" };
      const status = statusText(f.status, f.statusMsg);
      if (f.racing) return { icon: icons.racing, color: theme.accent, text: ["racing", status].filter(Boolean).join(" \xB7 ") };
      if (f.status !== "available") return { ...presenceDot(f), text: status };
      return { ...presenceDot(f), text: [f.away ? "away" : "online", status].filter(Boolean).join(" \xB7 ") };
    }
  }
}
function Dashboard({ store, width, height, rows, actions, dialog, selectedKey, onSelect, history }) {
  const data = store.dashboard();
  const sections = {
    banner: [{ type: "banner", key: "banner" }],
    requests: data.requests.map(
      (r) => ({ type: "request", key: r.kind === "invite" ? `i:${r.invite.gid}` : `r:${r.friend.id}`, request: r })
    ),
    friends: data.friends.map((f) => ({ type: "friend", key: `f:${f.id}`, friend: f })),
    nearby: data.nearby.map((p) => ({ type: "nearby", key: `n:${p.id}`, peer: p }))
  };
  const entries = Object.values(sections).flat();
  const bannerSolo = selectedKey === "banner:solo";
  let selected = bannerSolo ? 0 : entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = sections.requests.length ? 1 : 0;
  const current = entries[selected];
  const selectedFriend = current?.type === "friend" && current.friend.state === "accepted" ? current.friend : null;
  const newestInvite = data.requests.find((r) => r.kind === "invite");
  const newestKey = newestInvite?.kind === "invite" ? `i:${newestInvite.invite.gid}` : null;
  const seenInvite = useRef3(null);
  useEffect5(() => {
    if (newestKey && newestKey !== seenInvite.current && !dialog && !store.dnd) onSelect(newestKey);
    seenInvite.current = newestKey;
  }, [newestKey]);
  const [commandMode, setCommandMode] = useState5(false);
  const commandRef = useRef3(false);
  const [editor, setEditor] = useState5(emptyEditor);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const selectedId = current?.type === "friend" ? current.friend.id : null;
  const cmd = useCommandInput2({
    editor,
    setEditor,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim(), selectedId);
    },
    onEscape: closeCommand
  });
  const attempt = (fn) => {
    try {
      fn();
    } catch (err) {
      store.showToast(err.message, "error");
    }
  };
  const acceptInvite = (inv) => attempt(() => store.games.accept(inv.gid));
  const activate = (e) => {
    if (!e) return;
    if (e.type === "banner") return void (bannerSolo ? actions.soloRace() : actions.newRace());
    if (e.type === "request") {
      const r = e.request;
      if (r.kind === "invite") return acceptInvite(r.invite);
      const id = r.friend.id;
      attempt(() => store.accept(id));
      return onSelect(`f:${id}`);
    }
    if (e.type === "nearby") return attempt(() => store.requestNearby(e.peer.id));
    const f = e.friend;
    if (f.state === "accepted") {
      if (!f.online) return store.showToast(`${f.display} is offline`, "error");
      if (f.racing) return store.showToast(`${f.display} is racing right now \u2013 try again in a moment`, "info");
      return void actions.newRace([f.id]);
    }
    if (f.state === "declined") return attempt(() => store.request(f.id));
    if (f.state === "blocked") return store.showToast(`${f.display} is blocked \u2013 /unblock to undo`, "info");
    store.showToast(`Waiting for ${f.display} to accept your friend request`, "info");
  };
  useWheel((dir) => {
    const next = Math.max(0, Math.min(entries.length - 1, selected + dir));
    if (next !== selected) onSelect(entries[next].key);
  }, !dialog && !commandMode);
  useInput4(
    (input, key) => {
      if (commandRef.current) {
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      const move = (d) => {
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        if (next !== selected) onSelect(entries[next].key);
      };
      if (current?.type === "banner") {
        if (key.leftArrow || input === "h") return onSelect("banner");
        if (key.rightArrow || input === "l") return onSelect("banner:solo");
      }
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input.startsWith("/")) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === "?") return void actions.runCommand("/help", null);
      if (input === "q") return actions.quit();
      if (input === "s") return void actions.soloRace();
      if (input === "a") {
        void actions.prompt("Add a friend by IP", { hint: "e.g. 192.168.1.20 or 192.168.1.20:5052" }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`, null);
        });
        return;
      }
      if (input === "x" && current?.type === "request") {
        const r = current.request;
        attempt(() => r.kind === "invite" ? store.games.decline(r.invite.gid) : store.decline(r.friend.id));
        return;
      }
      if (input === "r" && current?.type === "friend") {
        const f = current.friend;
        void actions.prompt(`Nickname for ${f.name}`, { hint: "Leave empty to use the person's own name", initial: f.alias }).then((v) => {
          if (v !== null) store.rename(f.id, v);
        });
        return;
      }
      if (input === "d" && current?.type === "friend") {
        const f = current.friend;
        void actions.confirm(`Remove ${f.display} as a friend?`).then((ok) => ok && store.removeFriend(f.id));
      }
    },
    { isActive: !dialog && !commandMode }
  );
  const compact2 = bannerCompact(width, rows);
  const banner = bannerHeight(compact2);
  const bottom = dialog ? dialogHeight(dialog) : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const side = width >= SIDE_BY_SIDE;
  const mainHeight = Math.max(3, height - banner - bottom - 1);
  const fullRows = panelHeight(store, selectedFriend, false);
  const compactRows = panelHeight(store, selectedFriend, true);
  const panelCompact = !side || mainHeight < fullRows;
  const panelRows = panelCompact ? compactRows : fullRows;
  const showPanel = side ? mainHeight >= panelRows : mainHeight - panelRows >= 4;
  const listHeight = Math.max(2, mainHeight - (showPanel && !side ? panelRows : 0));
  const listWidth = side ? width - PANEL_WIDTH - 1 : width;
  const inner = listWidth - 2;
  const lines = [];
  const section = (title, list, showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: "gap" });
    lines.push({ kind: "section", title });
    for (const e of list) lines.push({ kind: "entry", entry: e, index: entries.indexOf(e) });
  };
  section(`Requests \xB7 ${data.requests.length}`, sections.requests);
  const online = data.friends.filter((f) => f.state === "accepted" && f.online).length;
  section(data.friends.length ? `Friends \xB7 ${online} online` : "Friends", sections.friends, true);
  const scanning = store.me.scanning;
  section(scanning ? "Nearby \xB7 searching the network \u2026" : "Nearby", sections.nearby, scanning);
  const selLine = lines.findIndex((l) => l.kind === "entry" && l.index === selected);
  const start3 = Math.max(0, Math.min(selLine - Math.floor(listHeight / 2), lines.length - listHeight));
  const visible = lines.slice(start3, start3 + listHeight);
  const hints = (() => {
    const base = ["\u2191\u2193 select"];
    if (!current || current.type === "banner") base.push("\u2190\u2192 race / solo", bannerSolo ? "enter solo practice" : "enter start a race");
    else if (current.type === "request") {
      base.push(current.request.kind === "invite" ? "enter join" : "enter accept", "x decline");
    } else if (current.type === "nearby") base.push("enter add friend");
    else {
      if (current.friend.state === "accepted") base.push("enter invite");
      base.push("r rename", "d remove");
    }
    return [...base, "a add by IP", "/ commands", "? help", "q quit"];
  })();
  const empty = data.friends.length === 0 && data.requests.length === 0;
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx10(
      Banner,
      {
        width,
        compact: compact2,
        selected: current?.type === "banner" ? bannerSolo ? "solo" : "race" : null,
        animate: store.isFocused && !dialog && !commandMode,
        mode: store.settings.animations
      }
    ),
    /* @__PURE__ */ jsxs9(Box9, { flexDirection: side ? "row" : "column", height: mainHeight, width, alignItems: "flex-start", overflow: "hidden", children: [
      /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", height: listHeight, width: listWidth, paddingX: 1, overflow: "hidden", flexShrink: 0, children: [
        visible.map((l, i) => {
          if (l.kind === "gap") return /* @__PURE__ */ jsx10(Text10, { children: " " }, `g${i}`);
          if (l.kind === "section") {
            return /* @__PURE__ */ jsx10(Text10, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, `s${i}`);
          }
          return /* @__PURE__ */ jsx10(Row2, { entry: l.entry, selected: l.index === selected, width: inner, store }, l.entry.key);
        }),
        empty && listHeight - visible.length >= 3 ? /* @__PURE__ */ jsx10(EmptyHint, { store, width: inner }) : null
      ] }),
      showPanel ? /* @__PURE__ */ jsx10(Box9, { marginLeft: side ? 1 : 0, flexShrink: 0, children: /* @__PURE__ */ jsx10(StatsPanel, { store, friend: selectedFriend, width: side ? PANEL_WIDTH : width, compact: panelCompact }) }) : null
    ] }),
    dialog ? /* @__PURE__ */ jsx10(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs9(Fragment5, { children: [
      /* @__PURE__ */ jsx10(
        InputBox,
        {
          state: editor,
          onChange: setEditor,
          onSubmit: cmd.submit,
          onKey: cmd.onKey,
          isActive: true,
          width,
          history,
          borderColor: theme.accent,
          singleLine: true
        }
      ),
      /* @__PURE__ */ jsx10(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx10(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Pointer({ selected }) {
  return /* @__PURE__ */ jsx10(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: selected ? icons.pointer : " " }) });
}
function Row2({ entry, selected, width, store }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text, color) => /* @__PURE__ */ jsx10(Box9, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { bold: selected, color: selected ? theme.accent : color, wrap: "truncate-end", children: text }) });
  const dot = (icon, color) => /* @__PURE__ */ jsx10(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color, children: icon }) });
  if (entry.type === "banner") return null;
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx10(Pointer, { selected }),
      dot(icons.online, theme.success),
      name(p.name),
      /* @__PURE__ */ jsxs9(Text10, { color: theme.dim, wrap: "truncate-end", children: [
        "on your network \xB7 ",
        p.ip
      ] })
    ] });
  }
  if (entry.type === "request") {
    const r = entry.request;
    const who = r.kind === "invite" ? r.invite.hostName : r.friend.display;
    const text = r.kind === "invite" ? `invites you to ${settingsPhrase(r.invite.settings)}` : "wants to be friends";
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx10(Pointer, { selected }),
      dot(icons.request, theme.accent),
      name(who),
      /* @__PURE__ */ jsx10(Text10, { wrap: "truncate-end", children: text })
    ] });
  }
  const f = entry.friend;
  const st = friendStatus(f);
  const h = f.state === "accepted" ? store.stats().h2h.get(f.id) : void 0;
  return /* @__PURE__ */ jsxs9(Box9, { children: [
    /* @__PURE__ */ jsx10(Pointer, { selected }),
    dot(st.icon, st.color),
    name(f.display, f.state === "accepted" ? personHex(f.id, f.color) : void 0),
    /* @__PURE__ */ jsx10(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx10(Text10, { color: f.state === "accepted" && f.online ? st.color : theme.dim, italic: f.state !== "accepted", wrap: "truncate-end", children: st.text }) }),
    h ? /* @__PURE__ */ jsxs9(Box9, { flexShrink: 0, marginLeft: 1, children: [
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "you " }),
      /* @__PURE__ */ jsx10(Text10, { color: h.wins >= h.losses ? theme.success : void 0, children: h.wins }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: " : " }),
      /* @__PURE__ */ jsx10(Text10, { color: h.losses > h.wins ? theme.error : void 0, children: h.losses })
    ] }) : null
  ] });
}
function EmptyHint({ store, width }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network";
  return /* @__PURE__ */ jsx10(Box9, { paddingLeft: 2, width, children: /* @__PURE__ */ jsxs9(Text10, { color: theme.dim, wrap: "wrap", children: [
    'Other keyrace players on your network show up under "Nearby" \u2013 press enter to send them a friend request. Not showing up? Press ',
    /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: "a" }),
    " and enter their IP. Yours:",
    " ",
    /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: addr })
  ] }) });
}

// src/ui/screens/Lobby.tsx
import { Box as Box10, Text as Text11, useInput as useInput5 } from "ink";
import { useRef as useRef4, useState as useState6 } from "react";
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var STATUS = {
  joined: { icon: icons.joined, color: theme.success, text: "joined" },
  invited: { icon: icons.pending, color: theme.warning, text: "invited" },
  declined: { icon: icons.error, color: theme.error, text: "declined" },
  left: { icon: icons.left, color: theme.faint, text: "left" }
};
function Lobby({ store, game, width, height, actions, dialog }) {
  const isHost = game.role === "host";
  const players = game.players;
  const [cursor, setCursor] = useState6(0);
  const [focus, setFocus] = useState6("players");
  const focusRef = useRef4("players");
  const [editor, setEditor] = useState6(emptyEditor);
  useTicker(250, game.autoStartAt !== null);
  const sel = Math.min(cursor, Math.max(0, players.length - 1));
  const selected = players[sel];
  const toChat = (initial = "") => {
    focusRef.current = "chat";
    setFocus("chat");
    if (initial) setEditor({ value: initial, cursor: initial.length });
  };
  const toPlayers = () => {
    focusRef.current = "players";
    setFocus("players");
  };
  const inviteMore = async () => {
    const inLobby = new Set(players.filter((p) => p.status === "joined" || p.status === "invited").map((p) => p.id));
    const options = store.onlineFriends().filter((f) => !inLobby.has(f.id)).map((f) => ({ id: f.id, label: f.display, hint: f.racing ? "racing" : f.away ? "away" : "online" }));
    if (!options.length) return store.showToast("No other friends online", "info");
    const ids = await actions.pick("Invite more friends", options, true);
    if (ids?.length) store.games.inviteMore(ids);
  };
  const start3 = async () => {
    const pending2 = store.games.pendingPlayers();
    if (pending2.length) {
      const n = pending2.length;
      const ok = await actions.confirm(`${n} ${n === 1 ? "player hasn't" : "players haven't"} joined \u2013 start without them?`);
      if (!ok) return;
    }
    store.games.startRace();
  };
  const leave2 = async () => {
    if (game.phase === "joining") return store.games.leave();
    const ok = await actions.confirm(isHost ? "Close the lobby for everyone?" : "Leave the lobby?");
    if (ok) store.games.leave();
  };
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(players.length - 1, c2 + dir))), !dialog && focus === "players");
  useInput5(
    (input, key) => {
      if (focusRef.current === "chat") {
        const text2 = cleanPaste(input);
        if (text2 && !key.ctrl && !key.meta) setEditor((e) => ({ value: e.value + text2, cursor: e.value.length + text2.length }));
        return;
      }
      if (key.escape) return void leave2();
      if (key.upArrow) return setCursor(Math.max(0, sel - 1));
      if (key.downArrow) return setCursor(Math.min(players.length - 1, sel + 1));
      if (key.tab) return toChat();
      if (isHost) {
        if (input === "c") return toChat();
        if (key.return) return void start3();
        if (input === "i") return void inviteMore();
        if (input === "k" && selected && selected.id !== game.hostId) {
          const p = selected;
          void actions.confirm(`Remove ${p.name} from the lobby?`).then((ok) => ok && store.games.kick(p.id));
          return;
        }
        return;
      }
      const text = cleanPaste(input);
      if (text && !key.ctrl && !key.meta && !key.return && text.trim()) toChat(text);
    },
    { isActive: !dialog && focus === "players" }
  );
  const joined = players.filter((p) => p.status === "joined").length;
  const invited = players.filter((p) => p.status === "invited").length;
  const startsIn = game.autoStartAt !== null ? Math.max(0, Math.ceil((game.autoStartAt - Date.now()) / 1e3)) : null;
  const notice = game.phase === "joining" ? `Joining ${game.hostName}'s lobby \u2026` : startsIn !== null ? `Everyone's here \u2013 starting in ${startsIn} \u2026` : isHost ? invited ? `Waiting for ${invited} to answer \xB7 enter starts now` : joined > 1 ? "enter starts the race" : "Nobody has joined yet \xB7 i invites more friends" : `Waiting for ${game.hostName} to start`;
  const bottom = dialog ? dialogHeight(dialog) : 3;
  const fixed = 2 + 1 + players.length + 1 + 2 + 1;
  const chatRows = Math.max(1, height - fixed - bottom - 1);
  const chat = game.chat.slice(-chatRows);
  const nameWidth = Math.min(20, Math.max(8, ...players.map((p) => p.name.length + 2)));
  const hints = focus === "chat" ? ["enter send", "tab/esc back to players"] : isHost ? ["\u2191\u2193 select", "enter start", "i invite", "k kick", "c chat", "esc close lobby"] : ["type to chat", "esc leave"];
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs10(Text11, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx11(Text11, { color: theme.dim, bold: true, children: "LOBBY" }),
        /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsx11(Text11, { bold: true, children: settingsLabel(game.settings) }),
        /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, children: [
          "hosted by ",
          isHost ? "you" : game.hostName
        ] })
      ] }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, bold: true, children: [
        "PLAYERS \xB7 ",
        joined,
        " joined"
      ] }),
      players.map((p, i) => {
        const st = STATUS[p.status];
        const active = focus === "players" && i === sel;
        const isMe = p.id === store.identity.id;
        return /* @__PURE__ */ jsxs10(Box10, { children: [
          /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: active ? icons.pointer : " " }) }),
          /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: st.color, children: st.icon }) }),
          /* @__PURE__ */ jsx11(Box10, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { bold: active || isMe, color: active ? theme.accent : p.status === "joined" ? senderHex(p.id) : theme.dim, wrap: "truncate-end", children: p.name }) }),
          /* @__PURE__ */ jsxs10(Text11, { color: p.status === "joined" ? theme.dim : st.color, wrap: "truncate-end", children: [
            p.id === game.hostId ? "host" : p.busy ? "busy racing" : st.text,
            isMe ? /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: " \xB7 you" }) : null
          ] })
        ] }, p.id);
      }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsx11(Text11, { color: startsIn !== null ? theme.accent : theme.dim, bold: startsIn !== null, wrap: "truncate-end", children: notice }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, bold: true, children: "CHAT" }),
      chat.length === 0 ? /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: game.phase === "joining" ? " " : "No messages yet" }) : chat.map((m) => /* @__PURE__ */ jsxs10(Text11, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx11(Text11, { color: m.from === store.identity.id ? theme.accent : senderHex(m.from), bold: true, children: m.from === store.identity.id ? "You" : m.name }),
        /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: " \xB7 " }),
        m.text
      ] }, m.id))
    ] }),
    dialog ? /* @__PURE__ */ jsx11(Dialog, { spec: dialog, width }) : /* @__PURE__ */ jsx11(
      InputBox,
      {
        state: editor,
        onChange: setEditor,
        onSubmit: (v) => {
          if (v.trim()) store.games.sendChat(v);
          setEditor(emptyEditor);
        },
        onKey: (_i, key) => {
          if (key.escape || key.tab) {
            toPlayers();
            return true;
          }
          return false;
        },
        isActive: focus === "chat" && game.phase === "lobby",
        width,
        singleLine: true,
        maxLength: MAX_CHAT,
        placeholder: focus === "chat" ? "Say something \u2026" : isHost ? "tab to chat" : "type to chat",
        borderColor: focus === "chat" ? theme.accent : theme.border
      }
    ),
    /* @__PURE__ */ jsx11(Footer, { hints, toast: store.toast, width })
  ] });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Box as Box12, Text as Text13, useInput as useInput6 } from "ink";
import { useState as useState7 } from "react";

// ../termcore/src/ui/components/Swatches.tsx
import { Box as Box11, Text as Text12 } from "ink";
import { jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
var SWATCH_WIDTH = 4;
function Swatches({ colors, selected, width, active = true }) {
  const perRow = Math.max(1, Math.floor(width / SWATCH_WIDTH));
  const rows = [];
  colors.forEach((c2, index) => {
    const r = Math.floor(index / perRow);
    (rows[r] ??= []).push({ hex: c2.hex, index });
  });
  return /* @__PURE__ */ jsx12(Box11, { flexDirection: "column", children: rows.map((row, r) => /* @__PURE__ */ jsx12(Text12, { children: row.map(({ hex, index }) => {
    const sel = index === selected;
    const bracket = sel ? active ? theme.accent : theme.dim : void 0;
    return /* @__PURE__ */ jsxs11(Text12, { children: [
      /* @__PURE__ */ jsx12(Text12, { color: bracket, children: sel ? "[" : " " }),
      /* @__PURE__ */ jsx12(Text12, { color: hex, children: "\u2588\u2588" }),
      /* @__PURE__ */ jsx12(Text12, { color: bracket, children: sel ? "]" : " " })
    ] }, index);
  }) }, r)) });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Fragment as Fragment6, jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function Onboarding({ logo, tagline, width, create, onDone, question = "What should your friends see you as?", colors }) {
  const [editor, setEditor] = useState7(emptyEditor);
  const [name, setName] = useState7(null);
  const [colorIndex, setColorIndex] = useState7(0);
  const [created, setCreated] = useState7(null);
  const [error, setError] = useState7(null);
  useInput6((_i, key) => key.return && onDone(), { isActive: created !== null });
  const finish2 = (n, color) => {
    try {
      setCreated({ name: n, id: create(n, color), ...color ? { color } : {} });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const submit = (value) => {
    const n = value.trim();
    if (!n) {
      setError("Please enter a name.");
      return;
    }
    if (colors?.length) setName(n);
    else finish2(n);
  };
  const picking = name !== null && created === null && !!colors?.length;
  useInput6(
    (input, key) => {
      const n = colors.length;
      if (key.leftArrow || input === "h") setColorIndex((i) => (i - 1 + n) % n);
      else if (key.rightArrow || input === "l" || key.tab) setColorIndex((i) => (i + 1) % n);
      else if (key.escape) setName(null);
      else if (key.return) finish2(name, colors[colorIndex].hex);
    },
    { isActive: picking }
  );
  const boxWidth = Math.min(64, width - 4);
  let body;
  if (created) {
    body = /* @__PURE__ */ jsxs12(Fragment6, { children: [
      /* @__PURE__ */ jsxs12(Text13, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx13(Text13, { bold: true, color: created.color, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs12(Text13, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "you \u2013 even if your name or IP address changes. termchat, keyrace, termdrop and" }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "termhub share it, along with your friends. Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsxs12(Text13, { children: [
        "Press ",
        /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] });
  } else if (picking) {
    const current = colors[colorIndex];
    body = /* @__PURE__ */ jsxs12(Fragment6, { children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Pick your color" }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "Friends see your name in it, in every app. You can change it later." }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Swatches, { colors, selected: colorIndex, width: boxWidth }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsxs12(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { bold: true, color: current.hex, children: name }),
        /* @__PURE__ */ jsxs12(Text13, { color: theme.dim, children: [
          " \xB7 ",
          current.name
        ] })
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "\u2190\u2192 choose \xB7 enter confirm \xB7 esc back to the name" }),
      error ? /* @__PURE__ */ jsx13(Text13, { color: theme.error, children: error }) : null
    ] });
  } else {
    body = /* @__PURE__ */ jsxs12(Fragment6, { children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: question }),
      /* @__PURE__ */ jsxs12(Text13, { color: theme.dim, children: [
        "You can change it later",
        colors ? " in termhub" : " with /name",
        "."
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(
        InputBox,
        {
          state: editor,
          onChange: (s) => {
            setEditor(s);
            setError(null);
          },
          onSubmit: submit,
          isActive: true,
          singleLine: true,
          width: boxWidth,
          placeholder: "Your name",
          borderColor: theme.accent
        }
      ),
      error ? /* @__PURE__ */ jsx13(Text13, { color: theme.error, children: error }) : null
    ] });
  }
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    logo.map((l, i) => /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: tagline }),
    /* @__PURE__ */ jsx13(Text13, { children: " " }),
    body
  ] });
}

// src/ui/components/ModeDialog.tsx
import { Box as Box13, Text as Text14, useInput as useInput7 } from "ink";
import { useState as useState8 } from "react";
import { jsx as jsx14, jsxs as jsxs13 } from "react/jsx-runtime";
function modeDialog(title, initial, resolve) {
  return {
    kind: "custom",
    // border (2) + title + modes + help line
    height: 4 + MODES.length,
    render: (width) => /* @__PURE__ */ jsx14(ModeDialog, { title, initial, resolve, width })
  };
}
function ModeDialog({ title, initial, resolve, width }) {
  const [cursor, setCursor] = useState8(() => Math.max(0, MODES.indexOf(initial?.mode ?? "sprint")));
  const [params, setParams] = useState8(() => ({
    ...DEFAULT_PARAM,
    ...initial ? { [initial.mode]: initial.param } : {}
  }));
  const n = MODES.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput7((input, key) => {
    if (key.escape) return resolve(null);
    if (key.upArrow || input === "k") return setCursor((c2) => (c2 - 1 + n) % n);
    if (key.downArrow || input === "j") return setCursor((c2) => (c2 + 1) % n);
    const mode = MODES[cursor];
    const list = PARAMS[mode];
    if (key.leftArrow || key.rightArrow || input === "h" || input === "l") {
      const d = key.leftArrow || input === "h" ? -1 : 1;
      const i = list.indexOf(params[mode]);
      setParams((p) => ({ ...p, [mode]: list[Math.max(0, Math.min(list.length - 1, i + d))] }));
      return;
    }
    if (key.return) resolve({ mode, param: params[mode] });
  });
  const lengthLabel = (mode, param) => mode === "sprint" ? `${param}s` : mode === "race" ? `${param} words` : "";
  return /* @__PURE__ */ jsxs13(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx14(Text14, { bold: true, wrap: "truncate-end", children: title }),
    MODES.map((mode, i) => {
      const active = i === cursor;
      const list = PARAMS[mode];
      const value = params[mode];
      const idx = list.indexOf(value);
      const len = lengthLabel(mode, value);
      return /* @__PURE__ */ jsxs13(Box13, { children: [
        /* @__PURE__ */ jsx14(Box13, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx14(Text14, { color: theme.accent, children: active ? icons.pointer : " " }) }),
        /* @__PURE__ */ jsx14(Box13, { width: 14, flexShrink: 0, children: /* @__PURE__ */ jsx14(Text14, { bold: active, color: active ? theme.accent : void 0, children: MODE_LABEL[mode] }) }),
        /* @__PURE__ */ jsx14(Box13, { width: 14, flexShrink: 0, children: len ? /* @__PURE__ */ jsxs13(Text14, { children: [
          /* @__PURE__ */ jsx14(Text14, { color: active && idx > 0 ? theme.accent : theme.faint, children: "\u2039 " }),
          /* @__PURE__ */ jsx14(Text14, { bold: active, children: len }),
          /* @__PURE__ */ jsx14(Text14, { color: active && idx < list.length - 1 ? theme.accent : theme.faint, children: " \u203A" })
        ] }) : null }),
        /* @__PURE__ */ jsx14(Text14, { color: theme.dim, wrap: "truncate-end", children: MODE_BLURB[mode] })
      ] }, mode);
    }),
    /* @__PURE__ */ jsx14(Text14, { color: theme.dim, wrap: "truncate-end", children: "\u2191\u2193 mode \xB7 \u2190\u2192 length \xB7 enter next \xB7 esc cancel" })
  ] });
}

// src/ui/screens/Race.tsx
import { Box as Box17, Text as Text18, useInput as useInput8 } from "ink";

// ../termcore/src/ui/components/BigText.tsx
import { Box as Box14, Text as Text15 } from "ink";
import { jsx as jsx15 } from "react/jsx-runtime";
var GLYPHS = {
  "3": ["\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ", "\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2557", " \u2588\u2588\u2588\u2588\u2588\u2554\u255D", " \u255A\u2550\u2550\u2550\u2588\u2588\u2557", "\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D", "\u255A\u2550\u2550\u2550\u2550\u2550\u255D "],
  "2": ["\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ", "\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2557", " \u2588\u2588\u2588\u2588\u2588\u2554\u255D", "\u2588\u2588\u2554\u2550\u2550\u2550\u255D ", "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557", "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"],
  "1": [" \u2588\u2588\u2557", "\u2588\u2588\u2588\u2551", "\u255A\u2588\u2588\u2551", " \u2588\u2588\u2551", " \u2588\u2588\u2551", " \u255A\u2550\u255D"],
  G: [" \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ", "\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D ", "\u2588\u2588\u2551  \u2588\u2588\u2588\u2557", "\u2588\u2588\u2551   \u2588\u2588\u2551", "\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D", " \u255A\u2550\u2550\u2550\u2550\u2550\u255D "],
  O: [" \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ", "\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557", "\u2588\u2588\u2551   \u2588\u2588\u2551", "\u2588\u2588\u2551   \u2588\u2588\u2551", "\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D", " \u255A\u2550\u2550\u2550\u2550\u2550\u255D "]
};
var BIG_HEIGHT = 6;
function bigLines(text) {
  const rows = Array.from({ length: BIG_HEIGHT }, () => "");
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    g.forEach((line, i) => rows[i] += line + " ");
  }
  return rows.map((r) => r.trimEnd());
}
function BigText({ text, color, width }) {
  return /* @__PURE__ */ jsx15(Box14, { flexDirection: "column", alignItems: "center", width, flexShrink: 0, children: bigLines(text).map((l, i) => /* @__PURE__ */ jsx15(Text15, { color, children: l }, i)) });
}

// src/ui/components/ProgressBars.tsx
import { Box as Box15, Text as Text16 } from "ink";
import { jsx as jsx16, jsxs as jsxs14 } from "react/jsx-runtime";
var EMPTY = { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: "racing", ms: 0 };
function barRows(game, myId, elapsed) {
  const e = game.engine;
  const { mode, param } = game.settings;
  const rows = game.racers.map((r) => {
    const isMe = r.id === myId;
    const p = (isMe && e ? e.progress() : r.progress) ?? EMPTY;
    return { r, isMe, p };
  });
  const leaderWords = Math.max(1, ...rows.map((x) => x.p.words));
  const leaderChars = Math.max(1, ...rows.map((x) => x.p.chars));
  const timeShare = Math.min(1, Math.max(0, elapsed) / runLimitMs(game.settings));
  const finishers = rows.filter((x) => x.p.completed).sort((a, b) => a.p.ms - b.p.ms);
  const byWords = [...rows].filter((x) => !x.r.left).sort((a, b) => b.p.words - a.p.words || b.p.chars - a.p.chars);
  return rows.map(({ r, isMe, p }) => {
    let fill;
    if (mode === "race") fill = p.words / param;
    else if (mode === "sprint") fill = p.words / leaderWords * (p.status === "racing" ? timeShare : 1);
    else fill = p.chars / leaderChars;
    let label = "";
    let labelColor = theme.dim;
    if (r.left) {
      label = `${icons.left} left`;
      labelColor = theme.faint;
    } else if (p.status === "out") {
      label = `${icons.error} out`;
      labelColor = theme.error;
    } else if (mode === "race" && p.completed) {
      label = `${icons.flag} ${ordinal(finishers.findIndex((x) => x.r.id === r.id) + 1)}`;
      labelColor = theme.success;
    } else if (mode === "sprint" && p.words > 0) {
      label = ordinal(byWords.findIndex((x) => x.r.id === r.id) + 1);
      if (p.status === "finished") label = `${icons.flag} ${label}`;
    }
    return {
      id: r.id,
      name: r.name,
      isMe,
      progress: p,
      left: r.left,
      fill: Math.max(0, Math.min(1, fill)),
      wpm: wpmOf(p.chars, isMe && e ? e.elapsed() : p.ms),
      label,
      labelColor
    };
  });
}
function ProgressBars({ rows, width }) {
  const nameWidth = Math.min(16, Math.max(8, ...rows.map((r) => r.name.length + 2)));
  const barWidth = Math.max(8, width - nameWidth - 2 - 9 - 9);
  return /* @__PURE__ */ jsx16(Box15, { flexDirection: "column", width, flexShrink: 0, children: rows.map((r) => {
    const filled = Math.round(r.fill * barWidth);
    const color = r.left ? theme.faint : r.isMe ? theme.accent : senderHex(r.id);
    return /* @__PURE__ */ jsxs14(Box15, { width, children: [
      /* @__PURE__ */ jsx16(Box15, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { color: theme.accent, children: r.isMe ? icons.pointer : " " }) }),
      /* @__PURE__ */ jsx16(Box15, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { color: r.left ? theme.faint : color, bold: r.isMe, wrap: "truncate-end", children: r.isMe ? "You" : r.name }) }),
      /* @__PURE__ */ jsxs14(Text16, { children: [
        /* @__PURE__ */ jsx16(Text16, { color, children: "\u2501".repeat(filled) }),
        /* @__PURE__ */ jsx16(Text16, { color: theme.border, children: "\u2500".repeat(barWidth - filled) })
      ] }),
      /* @__PURE__ */ jsxs14(Box15, { width: 9, flexShrink: 0, justifyContent: "flex-end", children: [
        /* @__PURE__ */ jsx16(Text16, { color: r.isMe ? void 0 : theme.dim, bold: r.isMe, children: Math.round(r.wpm) }),
        /* @__PURE__ */ jsx16(Text16, { color: theme.faint, children: " wpm" })
      ] }),
      /* @__PURE__ */ jsx16(Box15, { width: 9, flexShrink: 0, paddingLeft: 1, children: /* @__PURE__ */ jsx16(Text16, { color: r.labelColor, wrap: "truncate-end", children: r.label }) })
    ] }, r.id);
  }) });
}

// src/ui/components/TypingText.tsx
import chalk4 from "chalk";
import { Box as Box16, Text as Text17 } from "ink";
import { jsx as jsx17 } from "react/jsx-runtime";
var TEXT_LINES = 4;
function layoutWords(engine, width) {
  const lines = [[]];
  let used = 0;
  let lineOfCurrent = -1;
  for (let i = 0; i < engine.words.length; i++) {
    const word = engine.words[i];
    const typed = i < engine.index ? engine.done[i]?.typed ?? "" : i === engine.index ? engine.typed : "";
    const w = Math.max(word.length, typed.length);
    if (used > 0 && used + w > width) {
      lines.push([]);
      used = 0;
      if (lineOfCurrent >= 0 && lines.length > lineOfCurrent + TEXT_LINES) break;
    }
    lines[lines.length - 1].push({ index: i, width: w });
    used += w + 1;
    if (i === engine.index) lineOfCurrent = lines.length - 1;
  }
  return lines;
}
function visibleLines(lines, current) {
  const lineOfCurrent = Math.max(0, lines.findIndex((l) => l.some((p) => p.index === current)));
  const start3 = Math.max(0, Math.min(lineOfCurrent - 1, lines.length - TEXT_LINES));
  return { start: start3, end: start3 + TEXT_LINES };
}
var col = {
  done: chalk4.hex(theme.faint),
  wrong: chalk4.hex(theme.error),
  extra: chalk4.hex("#A8505A"),
  typed: chalk4.hex(theme.typed).bold,
  todo: chalk4.hex(theme.text)
};
function renderWord(engine, i, showCursor) {
  const word = engine.words[i];
  if (i > engine.index) return col.todo(word);
  if (i < engine.index) {
    const d = engine.done[i];
    if (!d || d.correct) return col.done(word);
    let out2 = "";
    for (let j = 0; j < Math.max(word.length, d.typed.length); j++) {
      if (j < word.length) out2 += j < d.typed.length && d.typed[j] === word[j] ? col.done(word[j]) : col.wrong(word[j]);
      else out2 += col.extra(d.typed[j]);
    }
    return chalk4.underline(out2);
  }
  const typed = engine.typed;
  let out = "";
  for (let j = 0; j < Math.max(word.length, typed.length); j++) {
    const atCursor = showCursor && j === typed.length;
    let ch;
    if (j < word.length) {
      ch = j < typed.length ? typed[j] === word[j] ? col.typed(word[j]) : col.wrong(word[j]) : col.todo(word[j]);
    } else ch = col.extra(typed[j]);
    out += atCursor ? chalk4.inverse(ch) : ch;
  }
  return out;
}
function TypingText({ engine, width, active }) {
  const lines = layoutWords(engine, width);
  const { start: start3, end } = visibleLines(lines, engine.index);
  const cursorAtEnd = active && engine.typed.length >= (engine.words[engine.index]?.length ?? 0);
  const out = [];
  for (let l = start3; l < end; l++) {
    const line = lines[l];
    if (!line) {
      out.push("");
      continue;
    }
    out.push(
      line.map((p) => {
        const text = renderWord(engine, p.index, active);
        const space = p.index === engine.index && cursorAtEnd ? chalk4.inverse(" ") : " ";
        return text + space;
      }).join("").replace(/ $/, "")
    );
  }
  return /* @__PURE__ */ jsx17(Box16, { flexDirection: "column", width, flexShrink: 0, children: out.map((l, i) => /* @__PURE__ */ jsx17(Text17, { wrap: "truncate-end", children: l || " " }, i)) });
}

// src/ui/screens/Race.tsx
import { Fragment as Fragment7, jsx as jsx18, jsxs as jsxs15 } from "react/jsx-runtime";
var AREA = Math.max(BIG_HEIGHT, TEXT_LINES + 2);
var GO_MS = 900;
function WallBar({ gap, wpm, width, startsIn }) {
  const words = gap / 5;
  const danger = wpm ? Math.max(0, Math.min(1, 1 - words / 10)) : 0;
  const barWidth = Math.max(6, Math.min(24, width - 44));
  const filled = Math.round(danger * barWidth);
  const color = danger > 0.75 ? theme.error : danger > 0.45 ? theme.warning : theme.success;
  const ahead = words >= 1 ? `you're ${Math.floor(words)} ${Math.floor(words) === 1 ? "word" : "words"} ahead` : "it's right behind you!";
  return /* @__PURE__ */ jsxs15(Text18, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: "wall " }),
    /* @__PURE__ */ jsx18(Text18, { bold: true, children: wpm ? `${wpm} wpm` : "waiting" }),
    /* @__PURE__ */ jsx18(Text18, { color: theme.faint, children: " \u2595" }),
    /* @__PURE__ */ jsx18(Text18, { color, children: "\u2588".repeat(filled) }),
    /* @__PURE__ */ jsx18(Text18, { color: theme.border, children: "\u2591".repeat(barWidth - filled) }),
    /* @__PURE__ */ jsx18(Text18, { color: theme.faint, children: "\u258F " }),
    /* @__PURE__ */ jsx18(Text18, { color: wpm ? color : theme.dim, children: wpm ? ahead : `starts in ${Math.ceil(startsIn / 1e3)}s` })
  ] });
}
function Race({ store, game, width, height, actions, dialog }) {
  const e = game.engine;
  useTicker(100, !e.ended || game.role !== "solo");
  e.update();
  const me = store.identity.id;
  const elapsed = e.elapsed();
  const limit = runLimitMs(game.settings);
  const { mode, param } = game.settings;
  useInput8(
    (input, key) => {
      if (key.escape) {
        const question = game.role === "host" ? "Give up? The race ends for everyone \u2013 you are the host." : game.role === "solo" ? "Stop this practice run?" : "Give up this race? It counts as not finished.";
        void actions.confirm(question).then((ok) => ok && store.games.leave());
        return;
      }
      if ((key.backspace || key.delete) && key.meta) return store.games.deleteWord();
      if (key.backspace) return store.games.deleteWord();
      if (key.delete) return store.games.backspace();
      if (key.ctrl && input === "w") return store.games.deleteWord();
      if (key.ctrl || key.meta || key.return || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
      if (input) store.games.input(input);
    },
    { isActive: !dialog }
  );
  const textWidth = Math.min(width - 4, 76);
  const rows = barRows(game, me, elapsed);
  const showGo = e.status === "racing" && elapsed < GO_MS;
  const wpm = Math.round(e.wpm());
  const parts = [];
  if (mode === "sprint") parts.push(`${clockDown(limit - Math.max(0, elapsed))} left`);
  else if (mode === "race") parts.push(`${e.correctWords}/${param} words`, duration(Math.max(0, elapsed)));
  else parts.push(`${duration(Math.max(0, elapsed))} survived`);
  const statLine = /* @__PURE__ */ jsxs15(Text18, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx18(Text18, { bold: true, children: parts[0] }),
    parts[1] ? /* @__PURE__ */ jsxs15(Text18, { color: theme.dim, children: [
      " \xB7 ",
      parts[1]
    ] }) : null,
    /* @__PURE__ */ jsx18(Text18, { color: theme.faint, children: " \xB7 " }),
    /* @__PURE__ */ jsx18(Text18, { bold: true, color: theme.accent, children: wpm }),
    /* @__PURE__ */ jsxs15(Text18, { color: theme.dim, children: [
      " wpm \xB7 ",
      pct(e.accuracy()),
      " acc"
    ] }),
    mode !== "race" ? /* @__PURE__ */ jsxs15(Text18, { color: theme.dim, children: [
      " ",
      "\xB7 ",
      e.correctWords,
      " ",
      e.correctWords === 1 ? "word" : "words"
    ] }) : null,
    mode !== "sudden" ? /* @__PURE__ */ jsxs15(Text18, { color: e.errors ? theme.error : theme.dim, children: [
      " ",
      "\xB7 ",
      e.errors,
      " ",
      e.errors === 1 ? "error" : "errors"
    ] }) : null
  ] });
  let area;
  if (e.status === "countdown") {
    const n = Math.ceil(-elapsed / 1e3);
    area = /* @__PURE__ */ jsx18(BigText, { text: String(Math.max(1, Math.min(3, n))), color: theme.accent, width: width - 2 });
  } else if (e.ended) {
    const waiting = game.role !== "solo" && game.racers.some((r) => !r.left && r.id !== me && r.progress?.status === "racing");
    const headline = e.status === "out" ? e.outReason === "wall" ? `${icons.error} The wall caught you after ${duration(e.endedAt ?? 0)}` : `${icons.error} Out \u2013 a typo after ${duration(e.endedAt ?? 0)}` : mode === "race" && !e.completed ? `Time's up \u2013 ${e.correctWords} of ${param} words` : `${icons.flag} Finished \u2013 ${wpm} wpm`;
    area = /* @__PURE__ */ jsxs15(Box17, { flexDirection: "column", alignItems: "center", width: width - 2, children: [
      /* @__PURE__ */ jsx18(Text18, { bold: true, color: e.status === "out" ? theme.error : theme.success, children: headline }),
      /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: waiting ? "Waiting for the others \u2026" : "Tallying the results \u2026" })
    ] });
  } else {
    area = /* @__PURE__ */ jsx18(TypingText, { engine: e, width: textWidth, active: !dialog });
  }
  return /* @__PURE__ */ jsxs15(Box17, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs15(Box17, { flexDirection: "column", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs15(Box17, { width: width - 2, flexShrink: 0, children: [
        /* @__PURE__ */ jsx18(Box17, { flexGrow: 1, children: /* @__PURE__ */ jsxs15(Text18, { color: theme.dim, bold: true, children: [
          settingsLabel(game.settings).toUpperCase(),
          game.role === "solo" ? " \xB7 SOLO" : ""
        ] }) }),
        showGo ? /* @__PURE__ */ jsx18(Text18, { color: theme.accent, bold: true, children: "GO!" }) : null
      ] }),
      /* @__PURE__ */ jsx18(Text18, { children: " " }),
      game.role !== "solo" ? /* @__PURE__ */ jsxs15(Fragment7, { children: [
        /* @__PURE__ */ jsx18(ProgressBars, { rows, width: width - 2 }),
        /* @__PURE__ */ jsx18(Text18, { children: " " })
      ] }) : null,
      /* @__PURE__ */ jsx18(Box17, { height: AREA, flexDirection: "column", justifyContent: "center", alignItems: "center", flexShrink: 0, children: area }),
      /* @__PURE__ */ jsx18(Text18, { children: " " }),
      /* @__PURE__ */ jsxs15(Box17, { flexDirection: "column", alignItems: "center", width: width - 2, flexShrink: 0, children: [
        e.status === "countdown" ? /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: "get ready \u2026" }) : statLine,
        mode === "sudden" && e.status === "racing" ? /* @__PURE__ */ jsx18(WallBar, { gap: e.wallGap(), wpm: wallWpm(elapsed), width: width - 2, startsIn: WALL.graceMs - elapsed }) : null
      ] })
    ] }),
    dialog ? /* @__PURE__ */ jsx18(Dialog, { spec: dialog, width }) : null,
    /* @__PURE__ */ jsx18(
      Footer,
      {
        hints: e.ended ? ["esc leave"] : ["type the words", "space next word", "backspace fix", "esc give up"],
        toast: store.toast,
        width
      }
    )
  ] });
}

// src/ui/screens/Results.tsx
import { Box as Box18, Text as Text19, useInput as useInput9 } from "ink";
import { Fragment as Fragment8, jsx as jsx19, jsxs as jsxs16 } from "react/jsx-runtime";
var MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
function Cell({ w, children, color, bold, right = true }) {
  return /* @__PURE__ */ jsx19(Box18, { width: w, flexShrink: 0, justifyContent: right ? "flex-end" : "flex-start", children: /* @__PURE__ */ jsx19(Text19, { color, bold, wrap: "truncate-end", children }) });
}
function Results({ store, game, width, height }) {
  const isHost = game.role === "host";
  const me = store.identity.id;
  const rematch = game.rematch && store.games.invites.has(game.rematch.gid) ? game.rematch : null;
  useInput9((input, key) => {
    if (game.phase === "closed") {
      if (key.return || key.escape || input === "q") store.games.dismiss();
      return;
    }
    if (rematch) {
      if (key.return || input === "y") return store.games.accept(rematch.gid);
      if (input === "x") return store.games.decline(rematch.gid);
    }
    if (input === "r" && (isHost || game.role === "solo")) {
      if (game.role === "solo") return store.games.solo(game.settings);
      return store.games.rematch();
    }
    if (key.return || key.escape) store.games.dismiss();
  });
  if (game.phase === "closed") {
    return /* @__PURE__ */ jsxs16(Box18, { flexDirection: "column", width, height, children: [
      /* @__PURE__ */ jsxs16(Box18, { flexDirection: "column", paddingX: 2, paddingY: 1, flexGrow: 1, children: [
        /* @__PURE__ */ jsxs16(Text19, { color: theme.error, bold: true, children: [
          icons.error,
          " ",
          game.closedReason ?? "The race was called off"
        ] }),
        /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: "Nothing was recorded." })
      ] }),
      /* @__PURE__ */ jsx19(Footer, { hints: ["enter back to the dashboard"], toast: store.toast, width })
    ] });
  }
  const results = game.results ?? [];
  const { mode } = game.settings;
  const showTime = mode !== "sprint";
  const nameW = Math.min(20, Math.max(8, ...results.map((r) => r.name.length + 2)));
  const timeLabel = mode === "sudden" ? "SURVIVED" : "TIME";
  const solo = game.role === "solo" || results.length === 1;
  const mine = results.find((r) => r.id === me);
  const statusText2 = (r) => r.status === "left" ? `${icons.left} left` : mode === "race" && !r.completed ? "not finished" : mode === "sudden" && r.status === "finished" ? "cleared" : "";
  const hints = rematch ? ["enter join the rematch", "x decline", "esc back"] : isHost ? ["r rematch", "enter back"] : game.role === "solo" ? ["r again", "enter back"] : ["enter back"];
  return /* @__PURE__ */ jsxs16(Box18, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs16(Box18, { flexDirection: "column", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs16(Text19, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx19(Text19, { color: theme.dim, bold: true, children: "RESULTS" }),
        /* @__PURE__ */ jsx19(Text19, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsx19(Text19, { bold: true, children: settingsLabel(game.settings) }),
        solo ? /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: " \xB7 solo" }) : null
      ] }),
      /* @__PURE__ */ jsx19(Text19, { children: " " }),
      mine && !solo ? /* @__PURE__ */ jsxs16(Fragment8, { children: [
        /* @__PURE__ */ jsx19(Text19, { bold: true, color: mine.place === 1 && mine.status !== "left" ? theme.success : void 0, children: mine.place === 1 && mine.status !== "left" ? `${icons.flag} You won!` : `You placed ${ordinal(mine.place)} of ${results.length}` }),
        /* @__PURE__ */ jsx19(Text19, { children: " " })
      ] }) : null,
      /* @__PURE__ */ jsxs16(Box18, { children: [
        /* @__PURE__ */ jsx19(Cell, { w: 8, right: false, color: theme.faint, children: "" }),
        /* @__PURE__ */ jsx19(Cell, { w: nameW, right: false, color: theme.faint, children: "PLAYER" }),
        /* @__PURE__ */ jsx19(Cell, { w: 6, color: theme.faint, children: "WPM" }),
        /* @__PURE__ */ jsx19(Cell, { w: 7, color: theme.faint, children: "ACC" }),
        /* @__PURE__ */ jsx19(Cell, { w: 8, color: theme.faint, children: "WORDS" }),
        mode !== "sudden" ? /* @__PURE__ */ jsx19(Cell, { w: 8, color: theme.faint, children: "ERRORS" }) : null,
        showTime ? /* @__PURE__ */ jsx19(Cell, { w: 10, color: theme.faint, children: timeLabel }) : null
      ] }),
      results.map((r) => {
        const isMe = r.id === me;
        const color = r.status === "left" ? theme.faint : isMe ? theme.accent : senderHex(r.id);
        const medal = r.status !== "left" && !solo ? MEDALS[r.place - 1] ?? "  " : "  ";
        return /* @__PURE__ */ jsxs16(Box18, { children: [
          /* @__PURE__ */ jsx19(Box18, { width: 8, flexShrink: 0, children: /* @__PURE__ */ jsxs16(Text19, { children: [
            medal,
            " ",
            /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: solo ? "" : ordinal(r.place) })
          ] }) }),
          /* @__PURE__ */ jsx19(Cell, { w: nameW, right: false, color, bold: isMe, children: isMe ? "You" : r.name }),
          /* @__PURE__ */ jsx19(Cell, { w: 6, bold: true, color: r.status === "left" ? theme.faint : void 0, children: String(Math.round(r.wpm)) }),
          /* @__PURE__ */ jsx19(Cell, { w: 7, color: theme.dim, children: pct(r.acc) }),
          /* @__PURE__ */ jsx19(Cell, { w: 8, color: theme.dim, children: String(r.words) }),
          mode !== "sudden" ? /* @__PURE__ */ jsx19(Cell, { w: 8, color: r.errors ? theme.error : theme.dim, children: String(r.errors) }) : null,
          showTime ? /* @__PURE__ */ jsx19(Cell, { w: 10, color: theme.dim, children: mode === "race" && !r.completed ? "\u2013" : duration(r.timeMs) }) : null,
          /* @__PURE__ */ jsx19(Box18, { marginLeft: 2, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs16(Text19, { wrap: "truncate-end", children: [
            isMe && game.newBest ? /* @__PURE__ */ jsxs16(Text19, { color: theme.warning, bold: true, children: [
              icons.star,
              " new best",
              " "
            ] }) : null,
            /* @__PURE__ */ jsx19(Text19, { color: theme.faint, children: statusText2(r) })
          ] }) })
        ] }, r.id);
      }),
      rematch ? /* @__PURE__ */ jsxs16(Fragment8, { children: [
        /* @__PURE__ */ jsx19(Text19, { children: " " }),
        /* @__PURE__ */ jsxs16(Text19, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsxs16(Text19, { color: theme.accent, children: [
            icons.request,
            " "
          ] }),
          /* @__PURE__ */ jsx19(Text19, { bold: true, children: rematch.hostName }),
          /* @__PURE__ */ jsxs16(Text19, { children: [
            " wants a rematch \u2013 ",
            settingsPhrase(rematch.settings)
          ] }),
          /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: " \xB7 enter join \xB7 x decline" })
        ] })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx19(Footer, { hints, toast: store.toast, width })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx20, jsxs as jsxs17 } from "react/jsx-runtime";
function Root({
  paths,
  options,
  notice
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState9(() => AppStore.hasProfile(paths) ? { name: "starting" } : { name: "onboarding" });
  const storeRef = useRef5(null);
  const quitting = useRef5(false);
  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);
  useInput10((input, key) => {
    if (key.ctrl && input === "c") quit();
  });
  useEffect6(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (notice) store.showToast(notice, "success");
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: "ready", store });
      } catch (err) {
        setPhase({ name: "error", message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);
  const height = Math.max(10, rows - 1);
  if (phase.name === "onboarding") {
    return /* @__PURE__ */ jsx20(
      Onboarding,
      {
        logo: LOGO_SMALL,
        tagline: "typing races with friends on your network",
        width: columns,
        create: (name) => AppStore.createProfile(paths, name),
        onDone: () => setPhase({ name: "starting" })
      }
    );
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx20(Box19, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx20(Text20, { color: theme.dim, children: "Starting keyrace \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs17(Box19, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx20(Text20, { color: theme.error, bold: true, children: "keyrace could not start" }),
      /* @__PURE__ */ jsx20(Text20, { children: phase.message }),
      /* @__PURE__ */ jsx20(Text20, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx20(Main, { store: phase.store, width: columns, height, rows, quit });
}
function Main({ store, width, height, rows, quit }) {
  useStoreVersion(store);
  const [dialog, setDialog] = useState9(null);
  const [panel, setPanel] = useState9(null);
  const [selectedKey, setSelectedKey] = useState9(null);
  const [history, setHistory] = useState9([]);
  useEffect6(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);
  useEffect6(() => {
    mouse.on("focus", (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners("focus");
  }, [store]);
  const actions = useMemo(() => {
    const ask = (make) => new Promise(
      (resolve) => setDialog(
        make((v) => {
          setDialog(null);
          resolve(v);
        })
      )
    );
    const a = {
      quit,
      confirm: (title) => ask((resolve) => ({ kind: "confirm", title, resolve })),
      prompt: (title, opts) => ask((resolve) => ({ kind: "prompt", title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, multi, opts) => ask((resolve) => ({ kind: "pick", title, options, multi, opts, resolve })),
      chooseMode: (title, initial) => ask((resolve) => modeDialog(title, initial, resolve)),
      newRace: async (preselect) => {
        const settings = await a.chooseMode(preselect?.length ? `Race ${preselect.map((id) => store.peerName(id)).join(", ")}` : "Start a race");
        if (!settings) return;
        const friends = store.onlineFriends();
        if (!friends.length) {
          store.showToast("No friends online \u2013 here is a solo run instead");
          store.games.solo(settings);
          return;
        }
        const options = friends.map((f) => ({ id: f.id, label: f.display, hint: f.racing ? "racing" : f.away ? "away" : "online" }));
        const ids = await a.pick("Invite friends", options, true, {
          emptyOk: true,
          preselect: preselect?.filter((id) => friends.some((f) => f.id === id)),
          emptyHint: "none = solo"
        });
        if (ids === null) return;
        store.games.create(settings, ids);
      },
      soloRace: async () => {
        const settings = await a.chooseMode("Solo practice");
        if (settings) store.games.solo(settings);
      },
      print: (text, kind = "info") => {
        if (text.includes("\n")) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ""), kind);
      },
      runCommand: async (input, selectedId) => {
        await registry.execute(input, {
          store,
          selectedId,
          ui: {
            print: (text, kind) => a.print(text, kind),
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick,
            chooseMode: a.chooseMode,
            newRace: a.newRace
          }
        });
        setHistory((h) => h[h.length - 1] === input ? h : [...h.slice(-99), input]);
      }
    };
    return a;
  }, [store, quit]);
  const bodyHeight = height - 2;
  const game = store.games.game;
  let body;
  if (game && (game.phase === "joining" || game.phase === "lobby")) {
    body = /* @__PURE__ */ jsx20(Lobby, { store, game, width, height: bodyHeight, actions, dialog });
  } else if (game && game.phase === "race") {
    body = /* @__PURE__ */ jsx20(Race, { store, game, width, height: bodyHeight, actions, dialog });
  } else if (game) {
    body = /* @__PURE__ */ jsx20(Results, { store, game, width, height: bodyHeight });
  } else if (panel) {
    body = /* @__PURE__ */ jsx20(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null) });
  } else {
    body = /* @__PURE__ */ jsx20(
      Dashboard,
      {
        store,
        width,
        height: bodyHeight,
        rows,
        actions,
        dialog,
        selectedKey,
        onSelect: setSelectedKey,
        history
      }
    );
  }
  return /* @__PURE__ */ jsxs17(Box19, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx20(
      Header,
      {
        app: "keyrace",
        version: VERSION,
        width,
        me: store.me,
        address: store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : "no network",
        online: store.onlineCount(),
        updateAvailable: store.updateAvailable
      }
    ),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx21 } from "react/jsx-runtime";
var HELP = `keyrace \u2013 multiplayer typing races for your local network

Usage: keyrace [options]
       keyrace update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.termhub shared by all apps plus
                    ~/.keyrace; with --home: <dir> and <dir>/keyrace; or $TERMHUB_HOME)
  --port <port>     TCP port (default: 5052, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/keyrace.log
  -h, --help        Show this help
  -v, --version     Show the version
`;
var ALT_SCREEN_ON = "\x1B[?1049h\x1B[H";
var ALT_SCREEN_OFF = "\x1B[?1049l";
var SHOW_CURSOR = "\x1B[?25h";
async function update2() {
  if (installKind() === "source") {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, "")}
`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json \u2192 repository).\n");
    return 1;
  }
  process.stdout.write("Checking for updates \u2026\n");
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`keyrace ${VERSION} is up to date.
`);
    return 0;
  }
  process.stdout.write(latest ? `Updating keyrace ${VERSION} \u2192 ${latest} \u2026
` : `Couldn't check the latest version \u2013 installing anyway \u2026
`);
  const res = await runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      process.stderr.write(`
${staleInstallHint(installed).replace(/`/g, "")}
`);
      return 1;
    }
    process.stdout.write(`
Done${installed ? ` \u2013 keyrace ${installed} is installed` : ""}. Start it with: keyrace
`);
    return 0;
  }
  process.stderr.write(`
Update failed. ${installHint(res.output) ?? "See the npm output above."}
`);
  return 1;
}
async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: "string" },
        port: { type: "string" },
        "no-discovery": { type: "boolean" },
        debug: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      },
      strict: true
    }));
  } catch (err) {
    process.stderr.write(`${err.message}

${HELP}`);
    process.exit(2);
  }
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`keyrace ${VERSION}
`);
    return;
  }
  if (positionals[0] === "update" && positionals.length === 1) {
    void update2().then((code) => process.exit(code));
    return;
  }
  if (positionals.length) {
    process.stderr.write(`Unknown command: ${positionals.join(" ")}

${HELP}`);
    process.exit(2);
  }
  let port;
  if (values.port !== void 0) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}
`);
      process.exit(2);
    }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("keyrace needs an interactive terminal.\n");
    process.exit(1);
  }
  const paths = resolvePaths(values.home);
  let lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!("release" in got)) {
      process.stdout.write("keyrace is already open in another window.\n");
      process.exit(0);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start keyrace: ${err.message}
`);
    process.exit(1);
  }
  try {
    await startInstanceServer(paths.socket);
  } catch {
  }
  let notice;
  try {
    const report = Hub.prepare(paths.hub);
    if (report.migrated) notice = migrationNotice(report.friends);
  } catch (err) {
    lock.release();
    process.stderr.write(`Couldn't read your profile in ${paths.hub.dir}: ${err.message}
`);
    process.exit(1);
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== "win32") fs10.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on("exit", restore);
  const crash = (err) => {
    restore();
    process.stderr.write(`
keyrace crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  for (const sig of ["SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));
  const app = render(
    /* @__PURE__ */ jsx21(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug }, notice }),
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) }
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
      const child = spawn2(process.execPath, process.argv.slice(1), { stdio: "inherit" });
      child.on("exit", (code) => process.exit(code ?? 0));
      child.on("error", () => process.exit(0));
    },
    crash
  );
}
async function start2() {
  const local = installKind() === "npm" ? newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start keyrace ${local.version} (${err.message}) \u2013 starting ${VERSION} instead.
`);
    }
  }
  await main();
}
void start2();
