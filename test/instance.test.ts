import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireLock, probeSocket, startInstanceServer, type Lock } from '../src/core/instance.js';
import { resolvePaths, socketPath } from '../src/core/paths.js';

const tmpDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `keyrace-${name}-`));
const isLock = (r: unknown): r is Lock => typeof (r as Lock).release === 'function';

describe('one instance per data folder', () => {
  it('a second start finds the lock taken; after release it is free again', async () => {
    const p = resolvePaths(tmpDir('lock'));
    const first = await acquireLock(p.lock, p.socket);
    expect(isLock(first)).toBe(true);
    // our own pid in the lock would count as stale – pretend it's another process
    const info = JSON.parse(fs.readFileSync(p.lock, 'utf8'));
    fs.writeFileSync(p.lock, JSON.stringify({ ...info, pid: 999_999 }));
    const second = await acquireLock(p.lock, p.socket, { probe: async () => true, isAlive: () => true });
    expect(isLock(second)).toBe(false);
    if (!isLock(second)) expect(second.holder.pid).toBe(999_999);
    (first as Lock).release(); // not ours anymore – must not remove it
    expect(fs.existsSync(p.lock)).toBe(true);
    fs.rmSync(p.lock);
    const third = await acquireLock(p.lock, p.socket);
    expect(isLock(third)).toBe(true);
    (third as Lock).release();
    expect(fs.existsSync(p.lock)).toBe(false);
  });

  it('a lock left by a crash (process gone) is stale and replaced', async () => {
    const p = resolvePaths(tmpDir('stale'));
    fs.writeFileSync(p.lock, JSON.stringify({ pid: 999_998, startedAt: Date.now(), socket: p.socket }));
    const lock = await acquireLock(p.lock, p.socket, { isAlive: () => false, probe: async () => false });
    expect(isLock(lock)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p.lock, 'utf8')).pid).toBe(process.pid);
  });

  it('a live pid that never answers is stale only after the start-up grace (pid reuse)', async () => {
    const p = resolvePaths(tmpDir('reuse'));
    const now = Date.now();
    fs.writeFileSync(p.lock, JSON.stringify({ pid: 999_997, startedAt: now - 2000, socket: p.socket }));
    const starting = await acquireLock(p.lock, p.socket, { isAlive: () => true, probe: async () => false, now: () => now });
    expect(isLock(starting)).toBe(false);
    const later = await acquireLock(p.lock, p.socket, { isAlive: () => true, probe: async () => false, now: () => now + 60_000 });
    expect(isLock(later)).toBe(true);
  });

  it('a corrupt lock file is stale', async () => {
    const p = resolvePaths(tmpDir('corrupt'));
    fs.writeFileSync(p.lock, '{nope');
    expect(isLock(await acquireLock(p.lock, p.socket))).toBe(true);
  });

  it('the running instance answers on its socket', async () => {
    const p = resolvePaths(tmpDir('probe'));
    expect(await probeSocket(p.socket)).toBe(false);
    const server = await startInstanceServer(p.socket);
    expect(await probeSocket(p.socket)).toBe(true);
    if (process.platform !== 'win32') expect(fs.statSync(p.socket).mode & 0o777).toBe(0o600);
    server.close();
  });

  it('long data folders get a socket in the temp dir (Unix socket paths are short)', () => {
    expect(socketPath(`/tmp/${'x'.repeat(150)}`, 'darwin').length).toBeLessThan(110);
    expect(socketPath('/Users/me/.keyrace', 'darwin')).toBe('/Users/me/.keyrace/keyrace.sock');
    expect(socketPath('C:\\Users\\me\\.keyrace', 'win32')).toMatch(/^\\\\\.\\pipe\\keyrace-[0-9a-f]{12}$/);
  });
});
