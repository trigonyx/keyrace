import { readJson } from 'termcore/app/storage';
import type { Paths } from './paths.js';

/**
 * keyrace's own settings (config.json in ~/.keyrace): just the port. Name, notifications and
 * the look are shared by all apps and live in ~/.termhub.
 */
export interface Config {
  port?: number;
}

export function readConfig(paths: Paths): Config {
  const c = readJson<Record<string, unknown> | null>(paths.config, null) ?? {};
  return Number.isInteger(c.port) ? { port: c.port as number } : {};
}
