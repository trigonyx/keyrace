import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ensureDir } from './storage.js';

/**
 * One keyrace per data folder (same lock as termdrop's handoff.ts). The running one holds a
 * lock file and listens on a local socket (a named pipe on Windows), so a second start can
 * tell a live instance from a lock left behind by a crash.
 */

export interface LockInfo {
  pid: number;
  startedAt: number;
  socket: string;
}

export interface Lock {
  release(): void;
}

/** A lock whose process is alive but doesn't answer is treated as stale after this long (pid reuse). */
const STARTUP_GRACE = 10_000;

export interface LockOptions {
  isAlive?: (pid: number) => boolean;
  /** does something answer on that socket? */
  probe?: (socket: string) => Promise<boolean>;
  now?: () => number;
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it's just not ours
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function probeSocket(socket: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const c = net.connect(socket);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      c.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c.once('connect', () => done(true));
    c.once('error', () => done(false));
  });
}

function readLock(file: string): LockInfo | null {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8')) as LockInfo;
    return Number.isInteger(o?.pid) && typeof o.startedAt === 'number' && typeof o.socket === 'string' ? o : null;
  } catch {
    return null;
  }
}

/**
 * Takes the lock, or reports who holds it. A lock is stale – and replaced – if its process is
 * gone (a crash), or if that process doesn't answer on its socket long after it started (the
 * pid was reused by something else).
 */
export async function acquireLock(lockFile: string, socket: string, opts: LockOptions = {}): Promise<Lock | { holder: LockInfo }> {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info: LockInfo = { pid: process.pid, startedAt: now(), socket };
    try {
      fs.writeFileSync(lockFile, JSON.stringify(info), { flag: 'wx', mode: 0o600 });
      return {
        release: () => {
          // only remove it if it's still ours
          if (readLock(lockFile)?.pid === process.pid) fs.rmSync(lockFile, { force: true });
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const holder = readLock(lockFile);
    const stale =
      !holder || holder.pid === process.pid || !isAlive(holder.pid) || (!(await probe(holder.socket)) && now() - holder.startedAt > STARTUP_GRACE);
    if (!stale) return { holder };
    fs.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}

/** Answers the probe of a second start ("is anyone home?"). Call only while holding the lock. */
export async function startInstanceServer(socket: string): Promise<net.Server> {
  // we hold the lock, so a socket file left here is from a crashed instance
  if (process.platform !== 'win32') fs.rmSync(socket, { force: true });
  const server = net.createServer((conn) => {
    conn.on('error', () => {});
    conn.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (process.platform !== 'win32') fs.chmodSync(socket, 0o600);
  server.on('error', () => {});
  server.unref();
  return server;
}
