import path from 'node:path';
import { basePaths, type BasePaths } from 'termcore/app/paths';

/** keyrace's own files, next to the shared ones in `hub` (~/.termhub). */
export interface Paths extends BasePaths {
  /** results.jsonl: one line per finished race */
  results: string;
}

/**
 * `home` (--home) moves everything: the shared data into `<home>`, keyrace's own into
 * `<home>/keyrace`. Default: ~/.termhub and ~/.keyrace.
 */
export function resolvePaths(home?: string, env: NodeJS.ProcessEnv = process.env): Paths {
  const base = basePaths('keyrace', home, env);
  return { ...base, results: path.join(base.home, 'results.jsonl') };
}
