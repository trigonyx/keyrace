import { appendJsonl, readJsonl, writeJsonlAtomic } from 'termcore/app/storage';
import type { Paths } from '../core/paths.js';
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

  /**
   * Someone has a new id (the move to ~/.termhub): our own old keyrace id, or a friend's.
   * Every race they were in moves with them – stats, head-to-head and bests stay as they were.
   */
  rekey(oldId: string, newId: string): void {
    const swap = (id: string) => (id === oldId ? newId : id);
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
  knows(id: string): boolean {
    return this.records.some((r) => r.players.some((p) => p.id === id));
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
