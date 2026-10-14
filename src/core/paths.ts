import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface Paths {
  home: string;
  identity: string;
  config: string;
  contacts: string;
  peers: string;
  results: string;
  log: string;
  /** Held by the running instance (pid + start time), so a second one can't start. */
  lock: string;
  /** Unix socket (named pipe on Windows) the running instance answers on. */
  socket: string;
}

/** Unix socket paths are limited to ~104 bytes on macOS – long homes fall back to the temp dir. */
const MAX_SOCKET_PATH = 100;

export function socketPath(root: string, platform = process.platform): string {
  const tag = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
  if (platform === 'win32') return `\\\\.\\pipe\\keyrace-${tag}`;
  const inHome = path.join(root, 'keyrace.sock');
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path.join(os.tmpdir(), `keyrace-${tag}.sock`);
}

export function resolvePaths(home?: string): Paths {
  const root = path.resolve(home ?? process.env.KEYRACE_HOME ?? path.join(os.homedir(), '.keyrace'));
  return {
    home: root,
    identity: path.join(root, 'identity.json'),
    config: path.join(root, 'config.json'),
    contacts: path.join(root, 'contacts.json'),
    peers: path.join(root, 'peers.json'),
    results: path.join(root, 'results.jsonl'),
    log: path.join(root, 'keyrace.log'),
    lock: path.join(root, 'keyrace.lock'),
    socket: socketPath(root),
  };
}
