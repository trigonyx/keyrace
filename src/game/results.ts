import type { Paths } from '../core/paths.js';
import { appendJsonl, readJsonl } from '../core/storage.js';
import { computeStats, isNewBest, isRaceRecord, type RaceRecord, type Stats } from './stats.js';

/** results.jsonl: one line per finished race. Stats are computed from it and cached. */
export class ResultsBook {
  private records: RaceRecord[];
  private cache: { myId: string; stats: Stats } | null = null;

  constructor(private readonly paths: Paths) {
    this.records = readJsonl<unknown>(paths.results).filter(isRaceRecord);
  }

  all(): RaceRecord[] {
    return this.records;
  }

  has(gid: string): boolean {
    return this.records.some((r) => r.gid === gid);
  }

  stats(myId: string): Stats {
    if (this.cache?.myId !== myId) this.cache = { myId, stats: computeStats(this.records, myId) };
    return this.cache.stats;
  }

  /** Saves a race (once per gid) and tells whether it was a personal best. */
  add(rec: RaceRecord): { newBest: boolean } {
    if (this.has(rec.gid)) return { newBest: false };
    const newBest = isNewBest(this.stats(rec.me), rec);
    this.records.push(rec);
    this.cache = null;
    appendJsonl(this.paths.results, rec);
    return { newBest };
  }
}
