#!/usr/bin/env node

// src/cli.tsx
import { render } from "ink";
import { spawn as spawn2 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import os from "os";
import path from "path";
function resolvePaths(home) {
  const root = path.resolve(home ?? process.env.KEYRACE_HOME ?? path.join(os.homedir(), ".keyrace"));
  return {
    home: root,
    identity: path.join(root, "identity.json"),
    config: path.join(root, "config.json"),
    contacts: path.join(root, "contacts.json"),
    peers: path.join(root, "peers.json"),
    results: path.join(root, "results.jsonl"),
    log: path.join(root, "keyrace.log")
  };
}

// src/core/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os2 from "os";
import path2 from "path";

// package.json
var package_default = {
  name: "keyrace",
  version: "1.0.0",
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
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/core/version.ts
var VERSION = package_default.version;
var REPO = /github\.com[/:]([^/]+\/[^/.]+)/.exec(package_default.repository.url)?.[1] ?? "OWNER/keyrace";
var REPO_CONFIGURED = !REPO.startsWith("OWNER/");
var INSTALL_SPEC = `https://github.com/${REPO}/tarball/main`;
var INSTALL_CMD = `npm i -g ${INSTALL_SPEC}`;

// src/core/update.ts
var VERSION_RE = /^\d+\.\d+\.\d+$/;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var latestUrl = () => process.env.KEYRACE_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/main/package.json`;
async function fetchLatestVersion(fetchImpl = fetch, timeoutMs = 5e3) {
  if (!REPO_CONFIGURED && !process.env.KEYRACE_UPDATE_URL) return null;
  try {
    const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const version = (await res.json())?.version;
    return typeof version === "string" && VERSION_RE.test(version) ? version : null;
  } catch {
    return null;
  }
}
async function checkForUpdate(fetchImpl) {
  if (process.env.KEYRACE_NO_UPDATE_CHECK === "1") return null;
  const latest = await fetchLatestVersion(fetchImpl);
  return latest && compareVersions(latest, VERSION) > 0 ? latest : null;
}
function installKind(script = process.argv[1] ?? "") {
  let real = script;
  try {
    real = fs.realpathSync(script);
  } catch {
  }
  return real.split(path2.sep).join("/").includes("/node_modules/keyrace/") ? "npm" : "source";
}
var SOURCE_HINT = `This keyrace runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD}\`.`;
var releaseSpec = (version) => `https://github.com/${REPO}/tarball/v${version}`;
var appDir = () => process.env.KEYRACE_APP_DIR || path2.join(os2.homedir(), ".keyrace", "app");
var installSpec = (version) => process.env.KEYRACE_INSTALL_SPEC || (version ? releaseSpec(version) : INSTALL_SPEC);
var isRoot = () => process.getuid?.() === 0;
function localInstall(dir = appDir()) {
  const root = path2.join(dir, "node_modules", "keyrace");
  try {
    const pkg = JSON.parse(fs.readFileSync(path2.join(root, "package.json"), "utf8"));
    const cli = path2.join(root, "dist", "cli.js");
    if (pkg?.name !== "keyrace" || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
    return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
  } catch {
    return null;
  }
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path2.resolve(p);
  }
};
function newerLocalInstall(self, ownVersion = VERSION) {
  const local = localInstall();
  if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
  return realpath(local.cli) === realpath(self) ? null : local;
}
function installedInto(script) {
  let dir = path2.dirname(realpath(script));
  while (path2.dirname(dir) !== dir) {
    if (path2.basename(dir) === "keyrace" && path2.basename(path2.dirname(dir)) === "node_modules") return path2.dirname(dir);
    dir = path2.dirname(dir);
  }
  return null;
}
function installTarget(script = process.argv[1] ?? "", root = isRoot()) {
  const modules = installedInto(script);
  if (!modules) return "global";
  if (realpath(modules).startsWith(realpath(appDir()) + path2.sep)) return "local";
  if (root) return "global";
  try {
    fs.accessSync(modules, fs.constants.W_OK);
    return "global";
  } catch {
    return "local";
  }
}
function npmInstall(spec, inherit, target) {
  const dir = appDir();
  const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
    // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
    ["install", "--prefix", dir, "--cache", path2.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
  );
  return new Promise((resolve) => {
    const win = process.platform === "win32";
    let output = "";
    try {
      if (target === "local") fs.mkdirSync(dir, { recursive: true });
      const p = spawn(win ? "npm.cmd" : "npm", args, {
        stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
        shell: win
      });
      p.stdout?.on("data", (d) => output += d);
      p.stderr?.on("data", (d) => output += d);
      p.on("error", (err) => resolve({ ok: false, output: `${output}
${err.message}` }));
      p.on("close", (code) => resolve({ ok: code === 0, output }));
    } catch (err) {
      resolve({ ok: false, output: err.message });
    }
  });
}
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
async function runInstall({ inherit, version }) {
  if (!REPO_CONFIGURED && !process.env.KEYRACE_INSTALL_SPEC) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
  const attempt = async (target2) => {
    if (version && !process.env.KEYRACE_INSTALL_SPEC) {
      const res2 = await npmInstall(installSpec(version), inherit, target2);
      if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
    }
    return npmInstall(installSpec(), inherit, target2);
  };
  const target = installTarget();
  const res = await attempt(target);
  if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) return attempt("local");
  return res;
}
function installedVersion(script = process.argv[1] ?? "") {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, "--version"], { timeout: 15e3 }, (err, stdout) => {
      const version = /keyrace (\d+\.\d+\.\d+)/.exec(String(stdout))?.[1];
      resolve(err || !version ? null : version);
    });
  });
}
var staleInstallHint = (installed) => `npm finished, but keyrace ${installed} is still the version that starts. Try \`keyrace update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
function installHint(output) {
  if (PERMISSION_RE.test(output)) {
    return `npm isn't allowed to write to ${appDir()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.keyrace\`, then run /update again.`;
  }
  return null;
}
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;

// src/ui/App.tsx
import { Box as Box17, Text as Text17, useApp, useInput as useInput9 } from "ink";
import { useCallback, useEffect as useEffect6, useMemo, useRef as useRef5, useState as useState8 } from "react";

// src/commands/builtin.ts
import net2 from "net";

// src/core/storage.ts
import fs2 from "fs";
import path3 from "path";
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
    fs2.renameSync(file, `${file}.corrupt-${Date.now()}`);
    return fallback;
  }
}
function writeJsonAtomic(file, data) {
  ensureDir(path3.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs2.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs2.renameSync(tmp, file);
}
function appendJsonl(file, entry) {
  ensureDir(path3.dirname(file));
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
function ensureDir(dir) {
  fs2.mkdirSync(dir, { recursive: true, mode: 448 });
}

// src/core/contacts.ts
function displayName(c2) {
  return c2.alias || c2.name;
}
var ContactBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.contacts, []);
    for (const c2 of Array.isArray(list) ? list : []) {
      if (c2 && typeof c2.id === "string") this.contacts.set(c2.id, c2);
    }
  }
  contacts = /* @__PURE__ */ new Map();
  get(id) {
    return this.contacts.get(id);
  }
  all() {
    return [...this.contacts.values()];
  }
  upsert(id, patch) {
    const prev = this.contacts.get(id);
    if (!prev && (patch.publicKey === void 0 || !patch.name || !patch.state)) return void 0;
    const now = Date.now();
    const base = prev ?? { lastActivity: now, createdAt: now };
    const next = { ...base, ...patch, id };
    this.contacts.set(id, next);
    this.save();
    return next;
  }
  remove(id) {
    if (this.contacts.delete(id)) this.save();
  }
  save() {
    writeJsonAtomic(this.paths.contacts, this.all());
  }
};

// src/core/identity.ts
import crypto from "crypto";
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
  return base32(crypto.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function fromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function loadOrCreateIdentity(paths) {
  const existing = readJson(paths.identity, null);
  if (existing?.v === 1 && existing.publicKey && existing.privateKey) return fromFile(existing);
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const file = { v: 1, publicKey: jwk.x, privateKey: jwk.d };
  writeJsonAtomic(paths.identity, file);
  return fromFile(file);
}
function loadConfig(paths) {
  const cfg = readJson(paths.config, null);
  return cfg && typeof cfg.name === "string" && cfg.name ? cfg : null;
}
function saveConfig(paths, cfg) {
  writeJsonAtomic(paths.config, cfg);
}

// src/core/network.ts
import net from "net";
import { EventEmitter as EventEmitter3 } from "events";

// src/core/framing.ts
import { EventEmitter } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload) {
  if (payload.length > MAX_FRAME) throw new FrameTooLargeError(payload.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
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
var FrameSocket = class extends EventEmitter {
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
  send(payload) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload));
    return true;
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

// src/core/handshake.ts
import crypto3 from "crypto";

// src/core/channel.ts
import crypto2 from "crypto";
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
    const cipher = crypto2.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN) throw new Error("Frame too short");
    const decipher = crypto2.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
};

// src/core/sanitize.ts
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

// src/core/handshake.ts
var PROTOCOL = "keyrace/1";
var HANDSHAKE_TIMEOUT = 5e3;
var HandshakeError = class extends Error {
};
function parseHello(frame) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== PROTOCOL || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError("Not a keyrace peer or incompatible version");
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(role, transcript) {
  return Buffer.concat([Buffer.from(`${PROTOCOL} auth ${role}`), transcript]);
}
async function performHandshake(fs4, me, myName, initiator, timeoutMs = HANDSHAKE_TIMEOUT) {
  const { privateKey: ephPriv, publicKey: ephPub } = crypto3.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto3.randomBytes(16);
  fs4.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: PROTOCOL, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs4.read(timeoutMs));
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto3.createHash("sha256").update(PROTOCOL).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto3.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto3.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto3.hkdfSync("sha256", shared, transcript, `${PROTOCOL} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto3.sign(null, authPayload(myRole, transcript), me.privateKey);
  fs4.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({ pub: me.publicRaw.toString("base64url"), name: myName, sig: sig.toString("base64url") })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs4.read(timeoutMs)).toString("utf8"));
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
    valid = crypto3.verify(
      null,
      authPayload(peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv };
}

// src/core/peer.ts
import { EventEmitter as EventEmitter2 } from "events";

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

// src/core/protocol.ts
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
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
var isPeerId = (v) => typeof v === "string" && PEER_ID_RE.test(v);
var isCount = (v, max = MAX_COUNT) => Number.isInteger(v) && v >= 0 && v <= max;
var isNum = (v, max) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
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
function parseWire(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0
      };
    }
    case "presence":
      if (typeof o.away !== "boolean") return null;
      if (o.racing !== void 0 && typeof o.racing !== "boolean") return null;
      return { t: "presence", away: o.away, ...o.racing ? { racing: true } : {} };
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
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return null;
  }
}
function encodeWire(msg) {
  return Buffer.from(JSON.stringify(msg), "utf8");
}
var REL_STATES = ["accepted", "outgoing", "none"];
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

// src/core/peer.ts
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter2 {
  constructor(fs4, hs, initiator, tag) {
    super();
    this.fs = fs4;
    this.hs = hs;
    this.initiator = initiator;
    this.tag = tag;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs4.on("frame", (frame) => this.onFrame(frame));
    fs4.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
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
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(encodeWire(msg)));
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
    const msg = parseWire(plain);
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

// src/core/network.ts
var DEFAULT_PORT = 5052;
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter3 {
  constructor(me, getName) {
    super();
    this.me = me;
    this.getName = getName;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort = DEFAULT_PORT) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onIncoming(socket));
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
    this.server.on("error", (err) => this.emit("log", `Server-Fehler: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately.
   */
  async dial(host, port, expectedId, tag) {
    const socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
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
    const fs4 = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs4, this.me, this.getName(), true);
      if (expectedId && hs.peerId !== expectedId) {
        throw new HandshakeError("Someone else is now reachable at this address");
      }
      return this.register(new Session(fs4, hs, true, tag));
    } catch (err) {
      fs4.destroy();
      throw err;
    }
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs4 = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs4, this.me, this.getName(), false);
      this.register(new Session(fs4, hs, false));
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs4.remoteAddress}: ${err.message}`);
      fs4.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = this.me.id < session.peerId ? this.me.id : session.peerId;
      const initiatorOf = (s) => s.initiator ? this.me.id : s.peerId;
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

// src/ui/format.ts
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

// src/commands/parse.ts
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

// src/commands/registry.ts
var CommandRegistry = class {
  constructor(commands) {
    this.commands = commands;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  available() {
    return this.commands;
  }
  /** Commands filtered by prefix. */
  suggest(prefix) {
    const p = prefix.toLowerCase();
    return this.commands.filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
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
    const cmd = this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
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
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
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
      ctx.ui.print(`### ${me.name}

- **ID** \`${formatId(me.id, true)}\`
- **Reachable at** ${addr}`);
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name",
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
        `- **Status** ${f.racing ? "racing" : f.away ? "away" : f.online ? "online" : "offline"} \xB7 ${STATE_LABEL[f.state] ?? f.state}`,
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
    description: "Desktop notifications for invites while keyrace is in the background",
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
var registry = new CommandRegistry(builtinCommands);

// src/core/store.ts
import fs3 from "fs";

// src/game/session.ts
import crypto4 from "crypto";

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
var newGid = () => crypto4.randomBytes(9).toString("base64url");
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
    const done2 = g.racers.every((r) => r.left || (r.id === me ? g.engine.ended : r.progress !== null && r.progress.status !== "racing"));
    if (done2 || elapsed > runLimitMs(g.settings) + this.t.graceMs) this.finish();
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
    this.deps.toast(text, "info");
    this.deps.notify("keyrace", text);
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

// src/core/dialer.ts
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
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  /** Where friends were last seen – discovery asks there directly. */
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.d.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    return [...ips];
  }
  wantsConnection(id) {
    if (this.d.network.isOnline(id)) return false;
    const state = this.d.contacts.get(id)?.state;
    return state === "accepted" || state === "outgoing";
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.contacts.get(id)?.state === "blocked") return;
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
    for (const c2 of this.d.contacts.all()) {
      if (c2.state === "accepted" || c2.state === "outgoing") this.tryDial(c2.id);
    }
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.peers.get(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const c2 = this.d.contacts.get(id);
    if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort, discovered: false };
    return null;
  }
  tryDial(id) {
    const { network, contacts } = this.d;
    if (network.isOnline(id)) return;
    const c2 = contacts.get(id);
    const now = Date.now();
    const wanted = c2?.state === "accepted" || c2?.state === "outgoing";
    const calledBack = c2?.state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!wanted && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && c2?.state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then(() => {
      this.states.delete(id);
    }).catch((err) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const friend = contacts.get(id);
      const waiting = friend?.state === "outgoing" || friend?.state === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(
          id,
          `Can't reach ${displayName(friend)} at ${t.ip}:${t.port} yet \u2013 still trying. A firewall may be blocking keyrace (Windows: allow Node.js for public networks \xB7 macOS: allow incoming connections for node).`
        );
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// src/core/discovery.ts
import dgram from "dgram";
import os3 from "os";
import { EventEmitter as EventEmitter4 } from "events";
var DISCOVERY_PORT = 5053;
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var ID_RE = /^[A-Z2-7]{20}$/;
var IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os3.networkInterfaces())) {
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
    const net3 = (ip & mask) >>> 0;
    const broadcast = (net3 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net3, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net3, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net3; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net3) yield toIp(ip - d);
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
      send(buf, address) {
        try {
          socket.send(buf, port, address, () => {
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
var Discovery = class extends EventEmitter4 {
  constructor(myId, getName, getPort, opts = {}) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
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
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.opts.udpPort ?? DISCOVERY_PORT);
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
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      this.sendTo(this.opts.wants?.(p.id) ? { ...msg, c: 1 } : msg, p.ip);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.peers.get(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip);
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
    const msg = { app: "keyrace", v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    return msg;
  }
  sendTo(msg, address) {
    this.transport?.send(Buffer.from(JSON.stringify(msg)), address);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether keyrace runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.sendTo(this.message(true), ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
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
    const msg = this.message(true);
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
      this.sendTo(msg, next.value);
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
    if (!msg || msg.app !== "keyrace" || msg.v !== 1 || typeof msg.id !== "string" || !ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const prev = this.peers.get(msg.id);
    const peer = { id: msg.id, name: cleanName(msg.name), ip: address, port, lastSeen: Date.now() };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name) this.emit("change");
    if (msg.q) this.sendTo(this.message(false), address);
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

// src/core/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body) {
  if (process.platform !== "darwin") return;
  try {
    execFile2("osascript", ["-e", MAC_SCRIPT, title, body], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// src/core/peers.ts
var PeerBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.peers, []);
    for (const p of Array.isArray(list) ? list : []) {
      if (p && typeof p.id === "string") this.peers.set(p.id, p);
    }
  }
  peers = /* @__PURE__ */ new Map();
  get(id) {
    return this.peers.get(id);
  }
  update(id, patch) {
    const prev = this.peers.get(id) ?? { id, name: patch.name ?? "Unknown" };
    const next = { ...prev, ...patch, id };
    if (JSON.stringify(prev) === JSON.stringify(next) && this.peers.has(id)) return;
    this.peers.set(id, next);
    writeJsonAtomic(this.paths.peers, [...this.peers.values()]);
  }
};

// src/core/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text, kind = "info") {
    this.current = { text, kind };
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

// src/core/store.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var FRIEND_ORDER = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    const cfg = loadConfig(opts.paths);
    if (!cfg) throw new Error("No profile found");
    this.paths = opts.paths;
    this.name = cfg.name;
    this.preferredPort = opts.port ?? cfg.port ?? DEFAULT_PORT;
    this.identity = loadOrCreateIdentity(opts.paths);
    this.contacts = new ContactBook(opts.paths);
    this.network = new Network(this.identity, () => this.name);
    this.peerBook = new PeerBook(opts.paths);
    this.results = new ResultsBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      contacts: this.contacts,
      discovery: () => this.discovery,
      log: (l) => this.log(l),
      unreachable: (_id, text) => this.showToast(text, "error")
    });
    this.games = new GameManager({
      me: () => ({ id: this.identity.id, name: this.name }),
      send: (id, msg) => this.network.get(id)?.send(msg) ?? false,
      isOnline: (id) => this.network.isOnline(id),
      isFriend: (id) => this.contacts.get(id)?.state === "accepted",
      nameOf: (id) => this.peerName(id),
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.desktopNotify(title, body),
      save: (rec) => this.saveResult(rec),
      racingChanged: () => this.broadcastPresence(),
      tuning: opts.tuning
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
  }
  identity;
  contacts;
  network;
  games;
  results;
  paths;
  peerBook;
  dialer;
  toasts;
  discovery = null;
  name;
  preferredPort;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  focused = true;
  /** Peers that reported their terminal is in the background … */
  away = /* @__PURE__ */ new Set();
  /** … or that they're racing. */
  racingPeers = /* @__PURE__ */ new Set();
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** Creates the profile and keys on first launch. */
  static createProfile(paths, name) {
    loadOrCreateIdentity(paths);
    saveConfig(paths, { name: cleanName(name) });
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.network.start(this.preferredPort);
    if (this.opts.discovery !== false) {
      this.discovery = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...this.opts.discoveryOptions,
        udpPort: this.opts.discoveryPort,
        hints: () => this.dialer.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discovery.on("change", () => {
        for (const p of this.discovery?.peers.values() ?? []) {
          const c2 = this.contacts.get(p.id);
          if (c2 && (c2.lastIp !== p.ip || c2.lastPort !== p.port)) this.contacts.upsert(p.id, { lastIp: p.ip, lastPort: p.port });
        }
        this.dialer.discovered(this.discovery?.peers.keys() ?? []);
        this.changed();
      });
      this.discovery.on("log", (l) => this.log(l));
      this.discovery.on("callback", (id) => this.dialer.onCallback(id));
      this.discovery.start();
    }
    this.dialer.start(this.opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.games.leave();
    this.games.stop();
    this.dialer.stop();
    this.toasts.stop();
    this.discovery?.stop();
    await this.network.stop();
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
  // ───────────── Queries ─────────────
  get me() {
    return {
      id: this.identity.id,
      name: this.name,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discovery !== null,
      scanning: this.discovery?.scanning ?? false
    };
  }
  get toast() {
    return this.toasts.current;
  }
  isOnline(id) {
    return this.network.isOnline(id);
  }
  friend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const online = this.isOnline(id);
    return { ...c2, display: displayName(c2), online, away: online && this.away.has(id), racing: online && this.racingPeers.has(id) };
  }
  /** Best name for any peer: own nickname/friend name, else what we remember from races. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
  }
  /** Accepted friends who are online right now (who can be invited). */
  onlineFriends() {
    return this.contacts.all().filter((c2) => c2.state === "accepted" && this.isOnline(c2.id)).map((c2) => this.friend(c2.id)).sort((a, b) => a.display.localeCompare(b.display));
  }
  dashboard() {
    const all = this.contacts.all().map((c2) => this.friend(c2.id));
    const known = new Set(all.map((f) => f.id));
    const presence = (f) => f.state !== "accepted" ? 4 : f.racing ? 0 : f.online && !f.away ? 1 : f.away ? 2 : 3;
    const friends = all.filter((f) => f.state !== "incoming").sort(
      (a, b) => FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display)
    );
    const requests = [
      ...this.games.pendingInvites().map((invite2) => ({ kind: "invite", invite: invite2 })),
      ...all.filter((f) => f.state === "incoming").sort((a, b) => b.lastActivity - a.lastActivity).map((friend) => ({ kind: "friend", friend }))
    ];
    return {
      requests,
      friends,
      nearby: [...this.discovery?.peers.values() ?? []].filter((p) => !known.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
    };
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  stats() {
    return this.results.stats(this.identity.id);
  }
  leaderboard() {
    const friends = /* @__PURE__ */ new Map();
    for (const c2 of this.contacts.all()) if (c2.state === "accepted") friends.set(c2.id, displayName(c2));
    return leaderboard(this.stats(), { id: this.identity.id, name: this.name }, friends);
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  // ───────────── UI helpers ─────────────
  showToast(text, kind = "info") {
    this.toasts.show(text, kind);
  }
  log(line) {
    if (!this.opts.debug) return;
    try {
      fs3.appendFileSync(this.opts.paths.log, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
    } catch {
    }
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discovery?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      if (existing.state === "incoming") this.accept(id);
      else if (existing.state === "declined" || existing.state === "blocked") this.setState(id, "outgoing");
      this.dialer.connect(id);
      return;
    }
    if (!p) throw new Error("Player is no longer nearby");
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, lastPort: p.port });
    this.showToast(`Friend request sent to ${p.name}`);
    this.dialer.connect(id);
    this.changed();
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.showToast("Friend request sent again");
    this.dialer.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = DEFAULT_PORT) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return;
    this.setState(id, "accepted");
    this.showToast(`You and ${displayName(c2)} are now friends`, "success");
    this.dialer.connect(id);
  }
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      s.close("Declined");
    }
    this.contacts.remove(id);
    this.showToast(`Declined ${displayName(c2)}'s request`);
    this.changed();
  }
  block(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    this.contacts.upsert(id, { state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.showToast(`${displayName(c2)} is blocked. No more connections will be accepted.`, "error");
    this.changed();
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return;
    this.setState(id, "outgoing");
    this.showToast(`Unblocked ${displayName(c2)} \u2013 friend request sent`, "success");
    this.dialer.connect(id);
  }
  removeFriend(id) {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  setName(name) {
    this.name = cleanName(name);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), name: this.name });
    for (const id of this.network.sessions.keys()) this.sendState(id);
    this.discovery?.announce(false);
    this.changed();
    return this.name;
  }
  // ───────────── Presence and notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }
  broadcastPresence() {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }
  sendPresence(id) {
    this.network.get(id)?.send({ t: "presence", away: !this.focused, ...this.games.racing ? { racing: true } : {} });
  }
  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused() {
    return this.focused;
  }
  notificationsEnabled() {
    return loadConfig(this.opts.paths)?.notifications !== false;
  }
  setNotifications(on) {
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), notifications: on });
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`keyrace ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
  desktopNotify(title, body) {
    if (this.focused || !this.notificationsEnabled()) return;
    (this.opts.notify ?? notify)(title, body);
  }
  // ───────────── Races ─────────────
  saveResult(rec) {
    for (const p of rec.players) {
      if (p.id !== this.identity.id && !this.contacts.get(p.id)) this.peerBook.update(p.id, { name: p.name, lastSeen: rec.ts });
    }
    return this.results.add(rec);
  }
  // ───────────── Network events ─────────────
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    const c2 = this.contacts.get(id);
    s?.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port });
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
        this.showToast(`Friend request sent to ${s.peerName} \u2013 waiting for them to accept`);
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
    if (!c2) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    this.sendState(id);
    if (!this.focused || this.games.racing) this.sendPresence(id);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.away.delete(id);
    this.racingPeers.delete(id);
    this.games.onPeerOffline(id);
    this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  onWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    switch (m.t) {
      case "state":
        return this.onState(s, m);
      case "decline": {
        const c2 = this.contacts.get(id);
        if (c2?.state === "outgoing") {
          this.contacts.upsert(id, { state: "declined" });
          this.showToast(`${displayName(c2)} declined your friend request`, "error");
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id)) return;
        const racing = m.racing === true;
        if (m.away === this.away.has(id) && racing === this.racingPeers.has(id)) return;
        if (m.away) this.away.add(id);
        else this.away.delete(id);
        if (racing) this.racingPeers.add(id);
        else this.racingPeers.delete(id);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.games.onWire(id, m);
    }
  }
  onState(s, m) {
    const id = s.peerId;
    const c2 = this.contacts.get(id);
    const prev = c2?.state ?? null;
    const next = reconcile(prev, m.state);
    if (next === null) {
      if (c2) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c2)} withdrew their friend request`);
      }
      s.close("Not a friend");
      this.changed();
      return;
    }
    const updated = this.contacts.upsert(id, {
      publicKey: s.peerPublicRaw.toString("base64url"),
      name: m.name,
      state: next,
      lastIp: s.remoteAddress,
      lastPort: m.port || c2?.lastPort,
      lastSeen: Date.now(),
      ...prev !== next ? { lastActivity: Date.now() } : {}
    });
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.showToast(prev === "outgoing" ? `${who} accepted your friend request` : `You and ${who} are now friends`, "success");
    } else if (next === "incoming" && prev !== "incoming") {
      this.showToast(`${who} wants to be friends`, "info");
      this.desktopNotify("keyrace", `${who} wants to be friends`);
    } else if (prev === "accepted" && next === "outgoing") {
      this.showToast(`${who} removed you as a friend \u2013 your request is waiting to be accepted`, "error");
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.changed();
  }
};

// src/ui/components/Header.tsx
import { Box, Text } from "ink";

// src/ui/theme.ts
import chalk from "chalk";
var theme = {
  accent: "#D97757",
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8",
  /** text still to type */
  text: "#D4D4D4",
  /** text typed correctly */
  typed: "#FFFFFF"
};
var c = {
  accent: chalk.hex(theme.accent),
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
  racing: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  error: "\u2717",
  left: "\u23CF",
  info: "\xB7",
  star: "\u2605",
  flag: "\u{1F3C1}"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function senderHex(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

// src/ui/components/Header.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ store, width }) {
  const me = store.me;
  const online = store.onlineCount();
  const ip = me.ips[0] ? `${me.ips[0]}:${me.port}` : "no network";
  const wide = width >= 72;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: "#1E1E1E", bold: true, children: " keyrace " }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          VERSION
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: me.name }),
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        store.updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${store.updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: ip }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " ",
          wide ? online === 1 ? "friend online" : "friends online" : "online"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";

// src/ui/text.ts
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

// src/ui/components/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({ text, width, height, onClose }) {
  useInput(() => onClose());
  const lines = renderText(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: l || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// src/ui/hooks.ts
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

// src/ui/mouse.ts
import { EventEmitter as EventEmitter5 } from "events";
import { PassThrough } from "stream";
import { useEffect as useEffect2, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h";
var MOUSE_OFF = "\x1B[?1004l\x1B[?1007l";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending2 = "") {
  const s = pending2 + input;
  const events = [];
  const focus = [];
  let text = "";
  let i = 0;
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);
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
      if (rest.length < 6) return done(text, events, rest, focus);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest)) return done(text, events, rest, focus);
    text += ESC;
    i = esc + 1;
  }
  return done(text, events, "", focus);
}
function done(text, events, pending2, focus) {
  return focus.length ? { text, events, pending: pending2, focus } : { text, events, pending: pending2 };
}
var mouse = new EventEmitter5();
var MouseFilterStdin = class extends PassThrough {
  constructor(source) {
    super();
    this.source = source;
    source.setEncoding("utf8");
    source.on("data", (chunk) => this.feed(chunk));
  }
  isTTY = true;
  pending = "";
  timer = null;
  feed(chunk) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit("wheel", e);
    for (const f of r.focus ?? []) mouse.emit("focus", f);
    if (r.text) this.write(r.text);
    if (this.pending) {
      this.timer = setTimeout(() => {
        const p = this.pending;
        this.pending = "";
        if (p) this.write(p);
      }, PENDING_MS);
    }
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
import { Box as Box9, Text as Text9, useInput as useInput4 } from "ink";
import { useEffect as useEffect5, useRef as useRef3, useState as useState5 } from "react";

// src/ui/components/Banner.tsx
import { Box as Box3, Text as Text3 } from "ink";
import stringWidth from "string-width";
import { useEffect as useEffect3, useState as useState2 } from "react";

// src/ui/effects.ts
import chalk3 from "chalk";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
function shineColor(base, col2, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col2 + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
function shineLine(line, row, width, hex, t) {
  const base = hexToRgb(hex);
  if (t < 0 || t >= SHINE_SWEEP) return chalk3.hex(hex)(line);
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

// src/ui/components/Banner.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D",
  "\u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2557   \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2557  ",
  "\u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u255D    \u255A\u2588\u2588\u2554\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u255D  ",
  "\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D   \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];
var LOGO_SMALL = ["\u2588\u2584\u2580 \u2588\u2580\u2580 \u2588\u2584\u2588 \u2588\u2580\u2588 \u2584\u2580\u2588 \u2588\u2580\u2580 \u2588\u2580\u2580", "\u2588 \u2588 \u2588\u2588\u2584  \u2588  \u2588\u2580\u2584 \u2588\u2580\u2588 \u2588\u2584\u2584 \u2588\u2588\u2584"];
var LOGO_WIDTH = stringWidth(LOGO[0]);
function bannerCompact(width, rows) {
  return width < 80 || rows < 22;
}
function bannerHeight(compact) {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 3;
}
var SHINE_EVERY = 6e3;
function useShine(active, delay = 250) {
  const [t, setT] = useState2(-1);
  useEffect3(() => {
    if (!active) {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    const play = () => {
      const t0 = Date.now();
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, delay]);
  return t;
}
function Banner({
  width,
  compact,
  selected,
  animate = true
}) {
  const t = useShine(animate);
  const logo = compact ? LOGO_SMALL : LOGO;
  const logoWidth = compact ? stringWidth(LOGO_SMALL[0]) : LOGO_WIDTH;
  const race = selected === "race";
  const solo = selected === "solo";
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    logo.map((line, i) => /* @__PURE__ */ jsx3(Text3, { children: shineLine(line, i, logoWidth, theme.accent, t) }, i)),
    /* @__PURE__ */ jsx3(Text3, { children: " " }),
    /* @__PURE__ */ jsxs3(Box3, { children: [
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: race ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx3(Text3, { backgroundColor: race ? theme.accent : void 0, color: race ? "#1E1E1E" : theme.accent, bold: true, children: ` ${icons.racing} Start a race ` }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.dim, children: solo ? "      " : " enter" }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.faint, children: "   " }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: solo ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx3(Text3, { backgroundColor: solo ? theme.accent : void 0, color: solo ? "#1E1E1E" : void 0, bold: solo, children: " Solo practice " }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.dim, children: solo ? " enter" : " s    " })
    ] }),
    /* @__PURE__ */ jsx3(Text3, { children: " " })
  ] });
}

// src/ui/components/CommandMenu.tsx
import { Box as Box4, Text as Text4 } from "ink";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start3 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start3, start3 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start3 + i === selected;
    return /* @__PURE__ */ jsxs4(Box4, { children: [
      /* @__PURE__ */ jsx4(Box4, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx4(Text4, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx4(Text4, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// src/ui/components/Dialog.tsx
import { Box as Box6, Text as Text6, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// src/ui/editor.ts
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

// src/ui/components/InputBox.tsx
import { Box as Box5, Text as Text5, useInput as useInput2 } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
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
  maxLength
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
      let text = cleanPaste(input);
      if (singleLine) text = text.replace(/\n/g, " ");
      if (!text) return;
      if (maxLength !== void 0 && [...state2.value].length + [...text].length > maxLength) return;
      set(edit.insert(state2, text));
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start3 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start3, start3 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx5(Box5, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start3 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx5(Text5, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx5(Text5, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// src/ui/components/Dialog.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  if (d.kind === "mode") return 4 + MODES.length;
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx6(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx6(PromptDialog, { spec, width });
  if (spec.kind === "mode") return /* @__PURE__ */ jsx6(ModeDialog, { spec, width });
  return /* @__PURE__ */ jsx6(PickDialog, { spec, width });
}
function Frame({ width, children }) {
  return /* @__PURE__ */ jsx6(Box6, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs6(Text6, { color: theme.dim, children: [
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState3(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx6(
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
    /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
  ] });
}
function PickDialog({ spec, width }) {
  const [cursor, setCursor] = useState3(0);
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
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsxs6(Text6, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs6(Text6, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start3 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs6(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx6(Text6, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx6(Text6, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs6(Text6, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}
function ModeDialog({ spec, width }) {
  const [cursor, setCursor] = useState3(() => Math.max(0, MODES.indexOf(spec.initial?.mode ?? "sprint")));
  const [params, setParams] = useState3(() => ({
    ...DEFAULT_PARAM,
    ...spec.initial ? { [spec.initial.mode]: spec.initial.param } : {}
  }));
  const n = MODES.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput3((input, key) => {
    if (key.escape) return spec.resolve(null);
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
    if (key.return) spec.resolve({ mode, param: params[mode] });
  });
  const lengthLabel = (mode, param) => mode === "sprint" ? `${param}s` : mode === "race" ? `${param} words` : "";
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, wrap: "truncate-end", children: spec.title }),
    MODES.map((mode, i) => {
      const active = i === cursor;
      const list = PARAMS[mode];
      const value = params[mode];
      const idx = list.indexOf(value);
      const len = lengthLabel(mode, value);
      return /* @__PURE__ */ jsxs6(Box6, { children: [
        /* @__PURE__ */ jsx6(Box6, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: active ? icons.pointer : " " }) }),
        /* @__PURE__ */ jsx6(Box6, { width: 14, flexShrink: 0, children: /* @__PURE__ */ jsx6(Text6, { bold: active, color: active ? theme.accent : void 0, children: MODE_LABEL[mode] }) }),
        /* @__PURE__ */ jsx6(Box6, { width: 14, flexShrink: 0, children: len ? /* @__PURE__ */ jsxs6(Text6, { children: [
          /* @__PURE__ */ jsx6(Text6, { color: active && idx > 0 ? theme.accent : theme.faint, children: "\u2039 " }),
          /* @__PURE__ */ jsx6(Text6, { bold: active, children: len }),
          /* @__PURE__ */ jsx6(Text6, { color: active && idx < list.length - 1 ? theme.accent : theme.faint, children: " \u203A" })
        ] }) : null }),
        /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: MODE_BLURB[mode] })
      ] }, mode);
    }),
    /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: "\u2191\u2193 mode \xB7 \u2190\u2192 length \xB7 enter next \xB7 esc cancel" })
  ] });
}

// src/ui/components/Footer.tsx
import { Box as Box7, Text as Text7 } from "ink";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var KIND_STYLE = {
  info: { color: theme.accent, icon: icons.request },
  success: { color: theme.success, icon: icons.joined },
  error: { color: theme.error, icon: icons.error }
};
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = KIND_STYLE[toast.kind];
    return /* @__PURE__ */ jsx7(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsxs7(Text7, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs7(Text7, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx7(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// src/ui/components/StatsPanel.tsx
import { Box as Box8, Text as Text8 } from "ink";
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var Title = ({ children }) => /* @__PURE__ */ jsx8(Text8, { color: theme.dim, bold: true, children: children.toUpperCase() });
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
    /* @__PURE__ */ jsx8(Box8, { width: Math.min(16, Math.floor(width / 2)), flexShrink: 0, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, wrap: "truncate-end", children: label }) }),
    /* @__PURE__ */ jsx8(Text8, { wrap: "truncate-end", children: value })
  ] });
}
function panelHeight(store, friend, compact) {
  if (friend) {
    const h = store.stats().h2h.get(friend.id);
    if (!h) return compact ? 4 : 5;
    if (compact) return h.last ? 6 : 4;
    return 2 + 1 + 1 + 1 + 1 + 2 + (h.last ? 3 : 0);
  }
  if (compact) return 6;
  const leaders = Math.min(5, store.leaderboard().length);
  return 10 + (leaders > 1 ? 2 + leaders : 0);
}
function StatsPanel({ store, friend, width, compact }) {
  const inner = width - 4;
  const stats = store.stats();
  if (friend) {
    const h = stats.h2h.get(friend.id);
    const name = friend.display;
    return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", borderStyle: "round", borderColor: theme.border, paddingX: 1, width, flexShrink: 0, children: [
      /* @__PURE__ */ jsx8(Title, { children: `You vs ${name}` }),
      !h ? /* @__PURE__ */ jsxs8(Fragment2, { children: [
        /* @__PURE__ */ jsx8(Text8, { color: theme.dim, wrap: "truncate-end", children: "No races together yet." }),
        !compact ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-end", children: [
          "Press enter to invite ",
          name,
          "."
        ] }) : null
      ] }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
        /* @__PURE__ */ jsxs8(Text8, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: "you " }),
          /* @__PURE__ */ jsx8(Text8, { bold: true, color: h.wins >= h.losses ? theme.success : void 0, children: h.wins }),
          /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: " : " }),
          /* @__PURE__ */ jsx8(Text8, { bold: true, color: h.losses > h.wins ? theme.error : void 0, children: h.losses }),
          /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
            " ",
            name
          ] })
        ] }),
        !compact ? /* @__PURE__ */ jsxs8(Fragment2, { children: [
          /* @__PURE__ */ jsxs8(Text8, { color: theme.faint, children: [
            h.races,
            " ",
            h.races === 1 ? "race" : "races",
            " together"
          ] }),
          /* @__PURE__ */ jsx8(Text8, { children: " " }),
          /* @__PURE__ */ jsx8(Row, { label: "Your best", value: `${Math.round(h.myBestWpm)} wpm`, width: inner }),
          /* @__PURE__ */ jsx8(Row, { label: `${name}'s best`, value: `${Math.round(h.theirBestWpm)} wpm`, width: inner })
        ] }) : null,
        h.last ? /* @__PURE__ */ jsxs8(Fragment2, { children: [
          !compact ? /* @__PURE__ */ jsx8(Text8, { children: " " }) : null,
          /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-end", children: [
            "Last duel \xB7 ",
            settingsLabel(h.last)
          ] }),
          /* @__PURE__ */ jsxs8(Text8, { wrap: "truncate-end", children: [
            "you ",
            ordinal(h.last.myPlace),
            " \xB7 ",
            name,
            " ",
            ordinal(h.last.theirPlace),
            /* @__PURE__ */ jsxs8(Text8, { color: theme.faint, children: [
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
    /* @__PURE__ */ jsx8(Title, { children: "Your stats" }),
    /* @__PURE__ */ jsxs8(Text8, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: stats.races }),
      /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " ",
        stats.races === 1 ? "race" : "races",
        " \xB7 "
      ] }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: stats.wins }),
      /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " ",
        stats.wins === 1 ? "win" : "wins"
      ] }),
      stats.races ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " (",
        pct(stats.winRate),
        ")"
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-end", children: [
      stats.solo,
      " solo \xB7 ",
      stats.avgAcc === null ? "no runs yet" : `${pct(stats.avgAcc)} avg accuracy`
    ] }),
    compact ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-end", children: [
      "best ",
      stats.bestWpm ? `${Math.round(stats.bestWpm)} wpm` : "\u2013",
      " \xB7 /stats for more"
    ] }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
      /* @__PURE__ */ jsx8(Text8, { children: " " }),
      /* @__PURE__ */ jsx8(Title, { children: "Personal bests" }),
      /* @__PURE__ */ jsx8(Row, { label: sprint ? `Sprint ${sprint.param}s` : "Sprint", value: sprint ? `${Math.round(sprint.best.wpm)} wpm` : "\u2013", width: inner }),
      /* @__PURE__ */ jsx8(
        Row,
        {
          label: race ? `Race ${race.param}` : "Race",
          value: race ? `${Math.round(race.best.wpm)} wpm \xB7 ${duration(race.best.timeMs)}` : "\u2013",
          width: inner
        }
      ),
      /* @__PURE__ */ jsx8(Row, { label: "Sudden Death", value: sudden ? `${duration(sudden.best.timeMs)} survived` : "\u2013", width: inner }),
      leaders.length > 1 ? /* @__PURE__ */ jsxs8(Fragment2, { children: [
        /* @__PURE__ */ jsx8(Text8, { children: " " }),
        /* @__PURE__ */ jsx8(Title, { children: "Leaderboard \xB7 best wpm" }),
        leaders.map((r, i) => /* @__PURE__ */ jsxs8(Box8, { width: inner, children: [
          /* @__PURE__ */ jsx8(Box8, { width: 3, flexShrink: 0, children: /* @__PURE__ */ jsxs8(Text8, { color: theme.faint, children: [
            i + 1,
            "."
          ] }) }),
          /* @__PURE__ */ jsx8(Box8, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx8(Text8, { bold: r.isMe, color: r.isMe ? theme.accent : void 0, wrap: "truncate-end", children: r.isMe ? "You" : r.name }) }),
          /* @__PURE__ */ jsx8(Box8, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx8(Text8, { children: Math.round(r.bestWpm) }) })
        ] }, r.id))
      ] }) : null
    ] })
  ] });
}

// src/ui/screens/useCommandInput.ts
import { useEffect as useEffect4, useState as useState4 } from "react";
function useCommandInput({ editor, setEditor, onSubmit, onEscape }) {
  const [selected, setSelected] = useState4(0);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands = filter !== null ? registry.suggest(filter) : [];
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
        const exact = filter ? registry.find(filter) : void 0;
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

// src/ui/screens/Dashboard.tsx
import { Fragment as Fragment3, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
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
    default:
      if (f.racing) return { icon: icons.racing, color: theme.accent, text: "racing" };
      if (f.away) return { icon: icons.away, color: theme.warning, text: "away" };
      if (f.online) return { icon: icons.online, color: theme.success, text: "online" };
      return { icon: icons.offline, color: theme.faint, text: "offline" };
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
    if (newestKey && newestKey !== seenInvite.current && !dialog) onSelect(newestKey);
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
  const cmd = useCommandInput({
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
  const compact = bannerCompact(width, rows);
  const banner = bannerHeight(compact);
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
    /* @__PURE__ */ jsx9(
      Banner,
      {
        width,
        compact,
        selected: current?.type === "banner" ? bannerSolo ? "solo" : "race" : null,
        animate: store.isFocused && !dialog && !commandMode
      }
    ),
    /* @__PURE__ */ jsxs9(Box9, { flexDirection: side ? "row" : "column", height: mainHeight, width, alignItems: "flex-start", overflow: "hidden", children: [
      /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", height: listHeight, width: listWidth, paddingX: 1, overflow: "hidden", flexShrink: 0, children: [
        visible.map((l, i) => {
          if (l.kind === "gap") return /* @__PURE__ */ jsx9(Text9, { children: " " }, `g${i}`);
          if (l.kind === "section") {
            return /* @__PURE__ */ jsx9(Text9, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, `s${i}`);
          }
          return /* @__PURE__ */ jsx9(Row2, { entry: l.entry, selected: l.index === selected, width: inner, store }, l.entry.key);
        }),
        empty && listHeight - visible.length >= 3 ? /* @__PURE__ */ jsx9(EmptyHint, { store, width: inner }) : null
      ] }),
      showPanel ? /* @__PURE__ */ jsx9(Box9, { marginLeft: side ? 1 : 0, flexShrink: 0, children: /* @__PURE__ */ jsx9(StatsPanel, { store, friend: selectedFriend, width: side ? PANEL_WIDTH : width, compact: panelCompact }) }) : null
    ] }),
    dialog ? /* @__PURE__ */ jsx9(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs9(Fragment3, { children: [
      /* @__PURE__ */ jsx9(
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
      /* @__PURE__ */ jsx9(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx9(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Pointer({ selected }) {
  return /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: selected ? icons.pointer : " " }) });
}
function Row2({ entry, selected, width, store }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text) => /* @__PURE__ */ jsx9(Box9, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: text }) });
  const dot = (icon, color) => /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color, children: icon }) });
  if (entry.type === "banner") return null;
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx9(Pointer, { selected }),
      dot(icons.online, theme.success),
      name(p.name),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "truncate-end", children: [
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
      /* @__PURE__ */ jsx9(Pointer, { selected }),
      dot(icons.request, theme.accent),
      name(who),
      /* @__PURE__ */ jsx9(Text9, { wrap: "truncate-end", children: text })
    ] });
  }
  const f = entry.friend;
  const st = friendStatus(f);
  const h = f.state === "accepted" ? store.stats().h2h.get(f.id) : void 0;
  return /* @__PURE__ */ jsxs9(Box9, { children: [
    /* @__PURE__ */ jsx9(Pointer, { selected }),
    dot(st.icon, st.color),
    name(f.display),
    /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx9(Text9, { color: f.state === "accepted" && f.online ? st.color : theme.dim, italic: f.state !== "accepted", wrap: "truncate-end", children: st.text }) }),
    h ? /* @__PURE__ */ jsxs9(Box9, { flexShrink: 0, marginLeft: 1, children: [
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: "you " }),
      /* @__PURE__ */ jsx9(Text9, { color: h.wins >= h.losses ? theme.success : void 0, children: h.wins }),
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: " : " }),
      /* @__PURE__ */ jsx9(Text9, { color: h.losses > h.wins ? theme.error : void 0, children: h.losses })
    ] }) : null
  ] });
}
function EmptyHint({ store, width }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network";
  return /* @__PURE__ */ jsx9(Box9, { paddingLeft: 2, width, children: /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "wrap", children: [
    'Other keyrace players on your network show up under "Nearby" \u2013 press enter to send them a friend request. Not showing up? Press ',
    /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "a" }),
    " and enter their IP. Yours:",
    " ",
    /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: addr })
  ] }) });
}

// src/ui/screens/Lobby.tsx
import { Box as Box10, Text as Text10, useInput as useInput5 } from "ink";
import { useRef as useRef4, useState as useState6 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
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
      /* @__PURE__ */ jsxs10(Text10, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, bold: true, children: "LOBBY" }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsx10(Text10, { bold: true, children: settingsLabel(game.settings) }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, children: [
          "hosted by ",
          isHost ? "you" : game.hostName
        ] })
      ] }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, bold: true, children: [
        "PLAYERS \xB7 ",
        joined,
        " joined"
      ] }),
      players.map((p, i) => {
        const st = STATUS[p.status];
        const active = focus === "players" && i === sel;
        const isMe = p.id === store.identity.id;
        return /* @__PURE__ */ jsxs10(Box10, { children: [
          /* @__PURE__ */ jsx10(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: active ? icons.pointer : " " }) }),
          /* @__PURE__ */ jsx10(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color: st.color, children: st.icon }) }),
          /* @__PURE__ */ jsx10(Box10, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { bold: active || isMe, color: active ? theme.accent : p.status === "joined" ? senderHex(p.id) : theme.dim, wrap: "truncate-end", children: p.name }) }),
          /* @__PURE__ */ jsxs10(Text10, { color: p.status === "joined" ? theme.dim : st.color, wrap: "truncate-end", children: [
            p.id === game.hostId ? "host" : p.busy ? "busy racing" : st.text,
            isMe ? /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: " \xB7 you" }) : null
          ] })
        ] }, p.id);
      }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(Text10, { color: startsIn !== null ? theme.accent : theme.dim, bold: startsIn !== null, wrap: "truncate-end", children: notice }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, bold: true, children: "CHAT" }),
      chat.length === 0 ? /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: game.phase === "joining" ? " " : "No messages yet" }) : chat.map((m) => /* @__PURE__ */ jsxs10(Text10, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx10(Text10, { color: m.from === store.identity.id ? theme.accent : senderHex(m.from), bold: true, children: m.from === store.identity.id ? "You" : m.name }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: " \xB7 " }),
        m.text
      ] }, m.id))
    ] }),
    dialog ? /* @__PURE__ */ jsx10(Dialog, { spec: dialog, width }) : /* @__PURE__ */ jsx10(
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
    /* @__PURE__ */ jsx10(Footer, { hints, toast: store.toast, width })
  ] });
}

// src/ui/screens/Onboarding.tsx
import { Box as Box11, Text as Text11, useInput as useInput6 } from "ink";
import { useState as useState7 } from "react";
import { Fragment as Fragment4, jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function Onboarding({ paths, width, onDone }) {
  const [editor, setEditor] = useState7(emptyEditor);
  const [created, setCreated] = useState7(null);
  const [error, setError] = useState7(null);
  useInput6((_i, key) => key.return && onDone(), { isActive: created !== null });
  const submit = (value) => {
    const name = value.trim();
    if (!name) {
      setError("Please enter a name.");
      return;
    }
    try {
      AppStore.createProfile(paths, name);
      setCreated({ name, id: loadOrCreateIdentity(paths).id });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const boxWidth = Math.min(64, width - 4);
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    LOGO_SMALL.map((l, i) => /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "typing races with friends on your network" }),
    /* @__PURE__ */ jsx11(Text11, { children: " " }),
    created ? /* @__PURE__ */ jsxs11(Fragment4, { children: [
      /* @__PURE__ */ jsxs11(Text11, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx11(Text11, { bold: true, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs11(Text11, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "you \u2013 even if your name or IP address changes." }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsxs11(Text11, { children: [
        "Press ",
        /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] }) : /* @__PURE__ */ jsxs11(Fragment4, { children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: "What should other racers see you as?" }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "You can change it later with /name." }),
      /* @__PURE__ */ jsx11(Text11, { children: " " }),
      /* @__PURE__ */ jsx11(
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
      error ? /* @__PURE__ */ jsx11(Text11, { color: theme.error, children: error }) : null
    ] })
  ] });
}

// src/ui/screens/Race.tsx
import { Box as Box15, Text as Text15, useInput as useInput7 } from "ink";

// src/ui/components/BigText.tsx
import { Box as Box12, Text as Text12 } from "ink";
import { jsx as jsx12 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsx12(Box12, { flexDirection: "column", alignItems: "center", width, flexShrink: 0, children: bigLines(text).map((l, i) => /* @__PURE__ */ jsx12(Text12, { color, children: l }, i)) });
}

// src/ui/components/ProgressBars.tsx
import { Box as Box13, Text as Text13 } from "ink";
import { jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsx13(Box13, { flexDirection: "column", width, flexShrink: 0, children: rows.map((r) => {
    const filled = Math.round(r.fill * barWidth);
    const color = r.left ? theme.faint : r.isMe ? theme.accent : senderHex(r.id);
    return /* @__PURE__ */ jsxs12(Box13, { width, children: [
      /* @__PURE__ */ jsx13(Box13, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: r.isMe ? icons.pointer : " " }) }),
      /* @__PURE__ */ jsx13(Box13, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx13(Text13, { color: r.left ? theme.faint : color, bold: r.isMe, wrap: "truncate-end", children: r.isMe ? "You" : r.name }) }),
      /* @__PURE__ */ jsxs12(Text13, { children: [
        /* @__PURE__ */ jsx13(Text13, { color, children: "\u2501".repeat(filled) }),
        /* @__PURE__ */ jsx13(Text13, { color: theme.border, children: "\u2500".repeat(barWidth - filled) })
      ] }),
      /* @__PURE__ */ jsxs12(Box13, { width: 9, flexShrink: 0, justifyContent: "flex-end", children: [
        /* @__PURE__ */ jsx13(Text13, { color: r.isMe ? void 0 : theme.dim, bold: r.isMe, children: Math.round(r.wpm) }),
        /* @__PURE__ */ jsx13(Text13, { color: theme.faint, children: " wpm" })
      ] }),
      /* @__PURE__ */ jsx13(Box13, { width: 9, flexShrink: 0, paddingLeft: 1, children: /* @__PURE__ */ jsx13(Text13, { color: r.labelColor, wrap: "truncate-end", children: r.label }) })
    ] }, r.id);
  }) });
}

// src/ui/components/TypingText.tsx
import chalk4 from "chalk";
import { Box as Box14, Text as Text14 } from "ink";
import { jsx as jsx14 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsx14(Box14, { flexDirection: "column", width, flexShrink: 0, children: out.map((l, i) => /* @__PURE__ */ jsx14(Text14, { wrap: "truncate-end", children: l || " " }, i)) });
}

// src/ui/screens/Race.tsx
import { Fragment as Fragment5, jsx as jsx15, jsxs as jsxs13 } from "react/jsx-runtime";
var AREA = Math.max(BIG_HEIGHT, TEXT_LINES + 2);
var GO_MS = 900;
function WallBar({ gap, wpm, width, startsIn }) {
  const words = gap / 5;
  const danger = wpm ? Math.max(0, Math.min(1, 1 - words / 10)) : 0;
  const barWidth = Math.max(6, Math.min(24, width - 44));
  const filled = Math.round(danger * barWidth);
  const color = danger > 0.75 ? theme.error : danger > 0.45 ? theme.warning : theme.success;
  const ahead = words >= 1 ? `you're ${Math.floor(words)} ${Math.floor(words) === 1 ? "word" : "words"} ahead` : "it's right behind you!";
  return /* @__PURE__ */ jsxs13(Text15, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: "wall " }),
    /* @__PURE__ */ jsx15(Text15, { bold: true, children: wpm ? `${wpm} wpm` : "waiting" }),
    /* @__PURE__ */ jsx15(Text15, { color: theme.faint, children: " \u2595" }),
    /* @__PURE__ */ jsx15(Text15, { color, children: "\u2588".repeat(filled) }),
    /* @__PURE__ */ jsx15(Text15, { color: theme.border, children: "\u2591".repeat(barWidth - filled) }),
    /* @__PURE__ */ jsx15(Text15, { color: theme.faint, children: "\u258F " }),
    /* @__PURE__ */ jsx15(Text15, { color: wpm ? color : theme.dim, children: wpm ? ahead : `starts in ${Math.ceil(startsIn / 1e3)}s` })
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
  useInput7(
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
  const statLine = /* @__PURE__ */ jsxs13(Text15, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx15(Text15, { bold: true, children: parts[0] }),
    parts[1] ? /* @__PURE__ */ jsxs13(Text15, { color: theme.dim, children: [
      " \xB7 ",
      parts[1]
    ] }) : null,
    /* @__PURE__ */ jsx15(Text15, { color: theme.faint, children: " \xB7 " }),
    /* @__PURE__ */ jsx15(Text15, { bold: true, color: theme.accent, children: wpm }),
    /* @__PURE__ */ jsxs13(Text15, { color: theme.dim, children: [
      " wpm \xB7 ",
      pct(e.accuracy()),
      " acc"
    ] }),
    mode !== "race" ? /* @__PURE__ */ jsxs13(Text15, { color: theme.dim, children: [
      " ",
      "\xB7 ",
      e.correctWords,
      " ",
      e.correctWords === 1 ? "word" : "words"
    ] }) : null,
    mode !== "sudden" ? /* @__PURE__ */ jsxs13(Text15, { color: e.errors ? theme.error : theme.dim, children: [
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
    area = /* @__PURE__ */ jsx15(BigText, { text: String(Math.max(1, Math.min(3, n))), color: theme.accent, width: width - 2 });
  } else if (e.ended) {
    const waiting = game.role !== "solo" && game.racers.some((r) => !r.left && r.id !== me && r.progress?.status === "racing");
    const headline = e.status === "out" ? e.outReason === "wall" ? `${icons.error} The wall caught you after ${duration(e.endedAt ?? 0)}` : `${icons.error} Out \u2013 a typo after ${duration(e.endedAt ?? 0)}` : mode === "race" && !e.completed ? `Time's up \u2013 ${e.correctWords} of ${param} words` : `${icons.flag} Finished \u2013 ${wpm} wpm`;
    area = /* @__PURE__ */ jsxs13(Box15, { flexDirection: "column", alignItems: "center", width: width - 2, children: [
      /* @__PURE__ */ jsx15(Text15, { bold: true, color: e.status === "out" ? theme.error : theme.success, children: headline }),
      /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: waiting ? "Waiting for the others \u2026" : "Tallying the results \u2026" })
    ] });
  } else {
    area = /* @__PURE__ */ jsx15(TypingText, { engine: e, width: textWidth, active: !dialog });
  }
  return /* @__PURE__ */ jsxs13(Box15, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs13(Box15, { flexDirection: "column", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs13(Box15, { width: width - 2, flexShrink: 0, children: [
        /* @__PURE__ */ jsx15(Box15, { flexGrow: 1, children: /* @__PURE__ */ jsxs13(Text15, { color: theme.dim, bold: true, children: [
          settingsLabel(game.settings).toUpperCase(),
          game.role === "solo" ? " \xB7 SOLO" : ""
        ] }) }),
        showGo ? /* @__PURE__ */ jsx15(Text15, { color: theme.accent, bold: true, children: "GO!" }) : null
      ] }),
      /* @__PURE__ */ jsx15(Text15, { children: " " }),
      game.role !== "solo" ? /* @__PURE__ */ jsxs13(Fragment5, { children: [
        /* @__PURE__ */ jsx15(ProgressBars, { rows, width: width - 2 }),
        /* @__PURE__ */ jsx15(Text15, { children: " " })
      ] }) : null,
      /* @__PURE__ */ jsx15(Box15, { height: AREA, flexDirection: "column", justifyContent: "center", alignItems: "center", flexShrink: 0, children: area }),
      /* @__PURE__ */ jsx15(Text15, { children: " " }),
      /* @__PURE__ */ jsxs13(Box15, { flexDirection: "column", alignItems: "center", width: width - 2, flexShrink: 0, children: [
        e.status === "countdown" ? /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: "get ready \u2026" }) : statLine,
        mode === "sudden" && e.status === "racing" ? /* @__PURE__ */ jsx15(WallBar, { gap: e.wallGap(), wpm: wallWpm(elapsed), width: width - 2, startsIn: WALL.graceMs - elapsed }) : null
      ] })
    ] }),
    dialog ? /* @__PURE__ */ jsx15(Dialog, { spec: dialog, width }) : null,
    /* @__PURE__ */ jsx15(
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
import { Box as Box16, Text as Text16, useInput as useInput8 } from "ink";
import { Fragment as Fragment6, jsx as jsx16, jsxs as jsxs14 } from "react/jsx-runtime";
var MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
function Cell({ w, children, color, bold, right = true }) {
  return /* @__PURE__ */ jsx16(Box16, { width: w, flexShrink: 0, justifyContent: right ? "flex-end" : "flex-start", children: /* @__PURE__ */ jsx16(Text16, { color, bold, wrap: "truncate-end", children }) });
}
function Results({ store, game, width, height }) {
  const isHost = game.role === "host";
  const me = store.identity.id;
  const rematch = game.rematch && store.games.invites.has(game.rematch.gid) ? game.rematch : null;
  useInput8((input, key) => {
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
    return /* @__PURE__ */ jsxs14(Box16, { flexDirection: "column", width, height, children: [
      /* @__PURE__ */ jsxs14(Box16, { flexDirection: "column", paddingX: 2, paddingY: 1, flexGrow: 1, children: [
        /* @__PURE__ */ jsxs14(Text16, { color: theme.error, bold: true, children: [
          icons.error,
          " ",
          game.closedReason ?? "The race was called off"
        ] }),
        /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: "Nothing was recorded." })
      ] }),
      /* @__PURE__ */ jsx16(Footer, { hints: ["enter back to the dashboard"], toast: store.toast, width })
    ] });
  }
  const results = game.results ?? [];
  const { mode } = game.settings;
  const showTime = mode !== "sprint";
  const nameW = Math.min(20, Math.max(8, ...results.map((r) => r.name.length + 2)));
  const timeLabel = mode === "sudden" ? "SURVIVED" : "TIME";
  const solo = game.role === "solo" || results.length === 1;
  const mine = results.find((r) => r.id === me);
  const statusText = (r) => r.status === "left" ? `${icons.left} left` : mode === "race" && !r.completed ? "not finished" : mode === "sudden" && r.status === "finished" ? "cleared" : "";
  const hints = rematch ? ["enter join the rematch", "x decline", "esc back"] : isHost ? ["r rematch", "enter back"] : game.role === "solo" ? ["r again", "enter back"] : ["enter back"];
  return /* @__PURE__ */ jsxs14(Box16, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs14(Box16, { flexDirection: "column", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs14(Text16, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx16(Text16, { color: theme.dim, bold: true, children: "RESULTS" }),
        /* @__PURE__ */ jsx16(Text16, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsx16(Text16, { bold: true, children: settingsLabel(game.settings) }),
        solo ? /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: " \xB7 solo" }) : null
      ] }),
      /* @__PURE__ */ jsx16(Text16, { children: " " }),
      mine && !solo ? /* @__PURE__ */ jsxs14(Fragment6, { children: [
        /* @__PURE__ */ jsx16(Text16, { bold: true, color: mine.place === 1 && mine.status !== "left" ? theme.success : void 0, children: mine.place === 1 && mine.status !== "left" ? `${icons.flag} You won!` : `You placed ${ordinal(mine.place)} of ${results.length}` }),
        /* @__PURE__ */ jsx16(Text16, { children: " " })
      ] }) : null,
      /* @__PURE__ */ jsxs14(Box16, { children: [
        /* @__PURE__ */ jsx16(Cell, { w: 8, right: false, color: theme.faint, children: "" }),
        /* @__PURE__ */ jsx16(Cell, { w: nameW, right: false, color: theme.faint, children: "PLAYER" }),
        /* @__PURE__ */ jsx16(Cell, { w: 6, color: theme.faint, children: "WPM" }),
        /* @__PURE__ */ jsx16(Cell, { w: 7, color: theme.faint, children: "ACC" }),
        /* @__PURE__ */ jsx16(Cell, { w: 8, color: theme.faint, children: "WORDS" }),
        mode !== "sudden" ? /* @__PURE__ */ jsx16(Cell, { w: 8, color: theme.faint, children: "ERRORS" }) : null,
        showTime ? /* @__PURE__ */ jsx16(Cell, { w: 10, color: theme.faint, children: timeLabel }) : null
      ] }),
      results.map((r) => {
        const isMe = r.id === me;
        const color = r.status === "left" ? theme.faint : isMe ? theme.accent : senderHex(r.id);
        const medal = r.status !== "left" && !solo ? MEDALS[r.place - 1] ?? "  " : "  ";
        return /* @__PURE__ */ jsxs14(Box16, { children: [
          /* @__PURE__ */ jsx16(Box16, { width: 8, flexShrink: 0, children: /* @__PURE__ */ jsxs14(Text16, { children: [
            medal,
            " ",
            /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: solo ? "" : ordinal(r.place) })
          ] }) }),
          /* @__PURE__ */ jsx16(Cell, { w: nameW, right: false, color, bold: isMe, children: isMe ? "You" : r.name }),
          /* @__PURE__ */ jsx16(Cell, { w: 6, bold: true, color: r.status === "left" ? theme.faint : void 0, children: String(Math.round(r.wpm)) }),
          /* @__PURE__ */ jsx16(Cell, { w: 7, color: theme.dim, children: pct(r.acc) }),
          /* @__PURE__ */ jsx16(Cell, { w: 8, color: theme.dim, children: String(r.words) }),
          mode !== "sudden" ? /* @__PURE__ */ jsx16(Cell, { w: 8, color: r.errors ? theme.error : theme.dim, children: String(r.errors) }) : null,
          showTime ? /* @__PURE__ */ jsx16(Cell, { w: 10, color: theme.dim, children: mode === "race" && !r.completed ? "\u2013" : duration(r.timeMs) }) : null,
          /* @__PURE__ */ jsx16(Box16, { marginLeft: 2, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs14(Text16, { wrap: "truncate-end", children: [
            isMe && game.newBest ? /* @__PURE__ */ jsxs14(Text16, { color: theme.warning, bold: true, children: [
              icons.star,
              " new best",
              " "
            ] }) : null,
            /* @__PURE__ */ jsx16(Text16, { color: theme.faint, children: statusText(r) })
          ] }) })
        ] }, r.id);
      }),
      rematch ? /* @__PURE__ */ jsxs14(Fragment6, { children: [
        /* @__PURE__ */ jsx16(Text16, { children: " " }),
        /* @__PURE__ */ jsxs14(Text16, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsxs14(Text16, { color: theme.accent, children: [
            icons.request,
            " "
          ] }),
          /* @__PURE__ */ jsx16(Text16, { bold: true, children: rematch.hostName }),
          /* @__PURE__ */ jsxs14(Text16, { children: [
            " wants a rematch \u2013 ",
            settingsPhrase(rematch.settings)
          ] }),
          /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: " \xB7 enter join \xB7 x decline" })
        ] })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx16(Footer, { hints, toast: store.toast, width })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx17, jsxs as jsxs15 } from "react/jsx-runtime";
function Root({ paths, options }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState8(() => loadConfig(paths) ? { name: "starting" } : { name: "onboarding" });
  const storeRef = useRef5(null);
  const quitting = useRef5(false);
  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);
  useInput9((input, key) => {
    if (key.ctrl && input === "c") quit();
  });
  useEffect6(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
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
    return /* @__PURE__ */ jsx17(Onboarding, { paths, width: columns, onDone: () => setPhase({ name: "starting" }) });
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx17(Box17, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx17(Text17, { color: theme.dim, children: "Starting keyrace \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs15(Box17, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx17(Text17, { color: theme.error, bold: true, children: "keyrace could not start" }),
      /* @__PURE__ */ jsx17(Text17, { children: phase.message }),
      /* @__PURE__ */ jsx17(Text17, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx17(Main, { store: phase.store, width: columns, height, rows, quit });
}
function Main({ store, width, height, rows, quit }) {
  useStoreVersion(store);
  const [dialog, setDialog] = useState8(null);
  const [panel, setPanel] = useState8(null);
  const [selectedKey, setSelectedKey] = useState8(null);
  const [history, setHistory] = useState8([]);
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
      chooseMode: (title, initial) => ask((resolve) => ({ kind: "mode", title, initial, resolve })),
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
    body = /* @__PURE__ */ jsx17(Lobby, { store, game, width, height: bodyHeight, actions, dialog });
  } else if (game && game.phase === "race") {
    body = /* @__PURE__ */ jsx17(Race, { store, game, width, height: bodyHeight, actions, dialog });
  } else if (game) {
    body = /* @__PURE__ */ jsx17(Results, { store, game, width, height: bodyHeight });
  } else if (panel) {
    body = /* @__PURE__ */ jsx17(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null) });
  } else {
    body = /* @__PURE__ */ jsx17(
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
  return /* @__PURE__ */ jsxs15(Box17, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx17(Header, { store, width }),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx18 } from "react/jsx-runtime";
var HELP = `keyrace \u2013 multiplayer typing races for your local network

Usage: keyrace [options]
       keyrace update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.keyrace, or $KEYRACE_HOME)
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
function main() {
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
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
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
    /* @__PURE__ */ jsx18(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug } }),
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
  main();
}
void start2();
