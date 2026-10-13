import { describe, expect, it } from 'vitest';
import { finalResult, ordinal, rank } from '../src/game/scoring.js';
import { computeStats, isNewBest, leaderboard, type RaceRecord } from '../src/game/stats.js';
import type { PlayerResult, Progress, RankedResult } from '../src/game/types.js';

const base: PlayerResult = { id: 'X', name: 'x', status: 'finished', completed: false, wpm: 0, acc: 1, words: 0, errors: 0, chars: 0, timeMs: 0 };
const p = (id: string, patch: Partial<PlayerResult>): PlayerResult => ({ ...base, id, name: id.toLowerCase(), ...patch });
const order = (r: RankedResult[]) => r.map((x) => `${x.place}${x.id}`).join(' ');

describe('ranking', () => {
  it('sprint: most correct words, then accuracy, then WPM; leavers last', () => {
    const r = rank('sprint', [
      p('A', { words: 30, acc: 0.9, wpm: 60 }),
      p('B', { words: 32, acc: 0.8, wpm: 64 }),
      p('C', { words: 30, acc: 0.95, wpm: 58 }),
      p('D', { words: 30, acc: 0.95, wpm: 61 }),
      p('E', { words: 50, status: 'left' }),
    ]);
    expect(order(r)).toBe('1B 2D 3C 4A 5E');
  });

  it('race: finishers by time, then the rest by progress', () => {
    const r = rank('race', [
      p('A', { completed: true, timeMs: 41_000, words: 50 }),
      p('B', { completed: false, words: 44, chars: 250 }),
      p('C', { completed: true, timeMs: 39_500, words: 50 }),
      p('D', { completed: false, words: 44, chars: 260 }),
      p('E', { status: 'left', words: 49 }),
    ]);
    expect(order(r)).toBe('1C 2A 3D 4B 5E');
  });

  it('sudden death: longest survival wins, then characters', () => {
    const r = rank('sudden', [
      p('A', { status: 'out', timeMs: 20_000, chars: 90 }),
      p('B', { status: 'out', timeMs: 35_000, chars: 150 }),
      p('C', { status: 'out', timeMs: 20_000, chars: 95 }),
      p('D', { status: 'left', timeMs: 50_000, chars: 300 }),
    ]);
    expect(order(r)).toBe('1B 2C 3A 4D');
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });
});

describe('final results from progress', () => {
  const prog = (patch: Partial<Progress>): Progress => ({ chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: 'racing', ms: 0, ...patch });

  it('sprint: WPM over the full duration', () => {
    const r = finalResult({ mode: 'sprint', param: 30 }, { id: 'A', name: 'a' }, prog({ chars: 100, words: 20, keys: 110, correctKeys: 100, status: 'finished', ms: 30_000 }), false);
    expect(r).toMatchObject({ status: 'finished', wpm: 40, words: 20, acc: 0.909, timeMs: 30_000 });
  });

  it('race: only a completed run counts as finished in time', () => {
    const s = { mode: 'race' as const, param: 25 };
    const done = finalResult(s, { id: 'A', name: 'a' }, prog({ chars: 150, words: 25, status: 'finished', completed: true, ms: 30_000 }), false);
    expect(done).toMatchObject({ completed: true, timeMs: 30_000, wpm: 60 });
    // claims completion without the words → not completed
    const fake = finalResult(s, { id: 'B', name: 'b' }, prog({ chars: 50, words: 10, status: 'finished', completed: true, ms: 1000 }), false);
    expect(fake.completed).toBe(false);
    // never reported anything
    expect(finalResult(s, { id: 'C', name: 'c' }, null, true)).toMatchObject({ status: 'left', words: 0, wpm: 0 });
  });

  it('sudden death: a run still going when the race ends counts as out at its last report', () => {
    const r = finalResult({ mode: 'sudden', param: 0 }, { id: 'A', name: 'a' }, prog({ chars: 60, words: 10, ms: 12_000 }), false);
    expect(r).toMatchObject({ status: 'out', timeMs: 12_000 });
  });
});

describe('stats', () => {
  const ME = 'MEMEMEMEMEMEMEMEMEME';
  const BOB = 'BOBBOBBOBBOBBOBBOBBO';
  const CARL = 'CARLCARLCARLCARLCARL';
  let n = 0;
  const rec = (mode: RaceRecord['mode'], param: number, players: PlayerResult[], solo = false): RaceRecord => ({
    v: 1,
    gid: `g${++n}xxxxxxxx`,
    ts: 1_000_000 + n,
    mode,
    param,
    solo,
    hostId: ME,
    me: ME,
    players: rank(mode, players),
  });

  const records = [
    rec('sprint', 60, [p(ME, { words: 40, wpm: 70, acc: 0.95 }), p(BOB, { words: 35, wpm: 62, acc: 0.9 }), p(CARL, { words: 45, wpm: 80, acc: 0.97 })]),
    rec('sprint', 60, [p(ME, { words: 50, wpm: 85, acc: 0.98 }), p(BOB, { words: 30, wpm: 55, acc: 0.9 })]),
    rec('race', 25, [p(ME, { completed: true, timeMs: 30_000, wpm: 64, words: 25 }), p(BOB, { completed: true, timeMs: 28_000, wpm: 70, words: 25 })]),
    rec('sudden', 0, [p(ME, { status: 'out', timeMs: 40_000, words: 30, wpm: 45 })], true),
  ];

  it('counts races, wins and averages; solo runs are not races', () => {
    const s = computeStats(records, ME);
    expect(s.races).toBe(3);
    expect(s.solo).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.avgAcc).toBeCloseTo((0.95 + 0.98 + 1 + 1) / 4);
    expect(s.bestWpm).toBe(85);
  });

  it('keeps the best run per mode and length', () => {
    const s = computeStats(records, ME);
    expect(s.bests.get('sprint:60')?.wpm).toBe(85);
    expect(s.bests.get('race:25')?.timeMs).toBe(30_000);
    expect(s.bests.get('sudden:0')?.timeMs).toBe(40_000);
    expect(s.bests.has('sprint:30')).toBe(false);
  });

  it('head-to-head counts every "who placed ahead of whom"', () => {
    const s = computeStats(records, ME);
    const bob = s.h2h.get(BOB)!;
    expect([bob.wins, bob.losses, bob.races]).toEqual([2, 1, 3]);
    expect(bob.theirBestWpm).toBe(70);
    expect(bob.myBestWpm).toBe(85);
    expect(bob.last).toMatchObject({ mode: 'race', myPlace: 2, theirPlace: 1 });
    const carl = s.h2h.get(CARL)!;
    expect([carl.wins, carl.losses]).toEqual([0, 1]);
  });

  it('detects new personal bests', () => {
    const before = computeStats(records, ME);
    expect(isNewBest(before, rec('sprint', 60, [p(ME, { words: 51, wpm: 86 })]))).toBe(true);
    expect(isNewBest(before, rec('sprint', 60, [p(ME, { words: 51, wpm: 84 })]))).toBe(false);
    // first run of its kind is a best, an unfinished race never is
    expect(isNewBest(before, rec('sprint', 30, [p(ME, { words: 10, wpm: 40 })]))).toBe(true);
    expect(isNewBest(before, rec('race', 50, [p(ME, { completed: false, words: 40, wpm: 99 })]))).toBe(false);
    expect(isNewBest(before, rec('sudden', 0, [p(ME, { status: 'out', timeMs: 41_000, words: 5 })], true))).toBe(true);
  });

  it('friends leaderboard by best WPM seen', () => {
    const s = computeStats(records, ME);
    const rows = leaderboard(s, { id: ME, name: 'Me' }, new Map([[BOB, 'Bob'], [CARL, 'Carl'], ['DANADANADANADANADANA', 'Dana']]));
    expect(rows.map((r) => `${r.name}:${r.bestWpm}`)).toEqual(['Me:85', 'Carl:80', 'Bob:70']);
  });
});
