import type { Mode, RankedResult } from './types.js';

/** One finished race, as stored in results.jsonl (one line each). */
export interface RaceRecord {
  v: 1;
  gid: string;
  /** when it ended */
  ts: number;
  mode: Mode;
  param: number;
  solo: boolean;
  hostId: string;
  /** our own id (the file belongs to one profile, but this keeps records self-contained) */
  me: string;
  players: RankedResult[];
}

export interface Best {
  wpm: number;
  words: number;
  acc: number;
  /** race: finish time · sudden death: survival time */
  timeMs: number;
  ts: number;
}

export interface HeadToHead {
  id: string;
  name: string;
  /** races both were in where I placed ahead of them */
  wins: number;
  losses: number;
  races: number;
  myBestWpm: number;
  theirBestWpm: number;
  last?: { ts: number; mode: Mode; param: number; myPlace: number; theirPlace: number; players: number };
}

export interface Stats {
  /** races with at least one opponent */
  races: number;
  wins: number;
  /** 0..1 */
  winRate: number;
  solo: number;
  /** best run per "mode:param", over all races and solo runs */
  bests: Map<string, Best>;
  /** average accuracy over all runs (null before the first) */
  avgAcc: number | null;
  avgWpm: number | null;
  bestWpm: number;
  h2h: Map<string, HeadToHead>;
}

export const bestKey = (mode: Mode, param: number) => `${mode}:${param}`;

/** Whether run `a` beats run `b` in its mode (what counts as a personal best). */
export function beats(mode: Mode, a: Pick<Best, 'wpm' | 'words' | 'timeMs'>, b: Pick<Best, 'wpm' | 'words' | 'timeMs'>): boolean {
  if (mode === 'sudden') return a.timeMs > b.timeMs || (a.timeMs === b.timeMs && a.words > b.words);
  return a.wpm > b.wpm;
}

/** Whether a run counts for the bests at all (a race that wasn't finished doesn't). */
function counts(mode: Mode, r: RankedResult): boolean {
  if (r.status === 'left') return false;
  if (mode === 'race') return r.completed;
  return r.words > 0 || r.timeMs > 0;
}

/**
 * Everything the dashboard shows, computed from the race records. Head-to-head counts every
 * "who placed ahead of whom" in a race, so a 4-player race adds one win or loss against each
 * of the three others.
 */
export function computeStats(records: RaceRecord[], myId: string): Stats {
  const stats: Stats = { races: 0, wins: 0, winRate: 0, solo: 0, bests: new Map(), avgAcc: null, avgWpm: null, bestWpm: 0, h2h: new Map() };
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
      if (me.place === 1 && me.status !== 'left') stats.wins++;
    } else stats.solo++;

    if (me.status !== 'left') {
      runs++;
      accSum += me.acc;
      wpmSum += me.wpm;
      stats.bestWpm = Math.max(stats.bestWpm, me.wpm);
    }
    if (counts(rec.mode, me)) {
      const key = bestKey(rec.mode, rec.param);
      const prev = stats.bests.get(key);
      const run: Best = { wpm: me.wpm, words: me.words, acc: me.acc, timeMs: me.timeMs, ts: rec.ts };
      if (!prev || beats(rec.mode, run, prev)) stats.bests.set(key, run);
    }
    if (!multi) continue;
    for (const o of others) {
      const h = stats.h2h.get(o.id) ?? { id: o.id, name: o.name, wins: 0, losses: 0, races: 0, myBestWpm: 0, theirBestWpm: 0 };
      h.name = o.name;
      h.races++;
      if (me.place < o.place) h.wins++;
      else h.losses++;
      if (me.status !== 'left') h.myBestWpm = Math.max(h.myBestWpm, me.wpm);
      if (o.status !== 'left') h.theirBestWpm = Math.max(h.theirBestWpm, o.wpm);
      h.last = { ts: rec.ts, mode: rec.mode, param: rec.param, myPlace: me.place, theirPlace: o.place, players: rec.players.length };
      stats.h2h.set(o.id, h);
    }
  }
  stats.winRate = stats.races ? stats.wins / stats.races : 0;
  stats.avgAcc = runs ? accSum / runs : null;
  stats.avgWpm = runs ? wpmSum / runs : null;
  return stats;
}

/** Whether my run in `rec` is a new personal best compared to `before` (stats without it). */
export function isNewBest(before: Stats, rec: RaceRecord): boolean {
  const me = rec.players.find((p) => p.id === rec.me);
  if (!me || !counts(rec.mode, me)) return false;
  const prev = before.bests.get(bestKey(rec.mode, rec.param));
  return !prev || beats(rec.mode, me, prev);
}

export interface LeaderRow {
  id: string;
  name: string;
  bestWpm: number;
  isMe: boolean;
}

/** Friends ranked by the best WPM I've seen from them (plus my own best). */
export function leaderboard(stats: Stats, me: { id: string; name: string }, friends: Map<string, string>): LeaderRow[] {
  const rows: LeaderRow[] = [{ id: me.id, name: me.name, bestWpm: stats.bestWpm, isMe: true }];
  for (const [id, name] of friends) {
    const h = stats.h2h.get(id);
    if (h && h.theirBestWpm > 0) rows.push({ id, name, bestWpm: h.theirBestWpm, isMe: false });
  }
  return rows.sort((a, b) => b.bestWpm - a.bestWpm || Number(b.isMe) - Number(a.isMe));
}

/** Validates a line read from results.jsonl (the file is ours, but may be from an older version). */
export function isRaceRecord(r: unknown): r is RaceRecord {
  const o = r as RaceRecord;
  return (
    !!o &&
    o.v === 1 &&
    typeof o.ts === 'number' &&
    typeof o.me === 'string' &&
    ['sprint', 'race', 'sudden'].includes(o.mode) &&
    Array.isArray(o.players) &&
    o.players.every((p) => p && typeof p.id === 'string' && typeof p.place === 'number' && typeof p.wpm === 'number')
  );
}
