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
  };
}
