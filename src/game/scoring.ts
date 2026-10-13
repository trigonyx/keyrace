import { accuracyOf, runLimitMs, wpmOf, type FinalStatus, type Mode, type PlayerResult, type Progress, type RaceSettings, type RankedResult } from './types.js';

type Compare = (a: PlayerResult, b: PlayerResult) => number;

const desc = (f: (p: PlayerResult) => number): Compare => (a, b) => f(b) - f(a);
const asc = (f: (p: PlayerResult) => number): Compare => (a, b) => f(a) - f(b);
const chain = (...cs: Compare[]): Compare => (a, b) => {
  for (const c of cs) {
    const d = c(a, b);
    if (d) return d;
  }
  return 0;
};

/** Players who left always rank last, among themselves by how far they got. */
const leftLast: Compare = (a, b) => Number(a.status === 'left') - Number(b.status === 'left');

const ORDER: Record<Mode, Compare> = {
  // most correct words; ties: higher accuracy, then higher WPM
  sprint: chain(
    leftLast,
    desc((p) => p.words),
    desc((p) => p.acc),
    desc((p) => p.wpm),
  ),
  // finishers by finish time, then the rest by progress
  race: chain(
    leftLast,
    desc((p) => Number(p.completed)),
    (a, b) => (a.completed && b.completed ? a.timeMs - b.timeMs : 0),
    desc((p) => p.words),
    desc((p) => p.chars),
    desc((p) => p.wpm),
  ),
  // last one standing: longest survival, then most characters
  sudden: chain(
    leftLast,
    desc((p) => Number(p.status === 'finished')),
    desc((p) => p.timeMs),
    desc((p) => p.chars),
    asc((p) => p.errors),
  ),
};

/** Ranks the players of one race; places are 1, 2, 3 … in that order. */
export function rank(mode: Mode, players: PlayerResult[]): RankedResult[] {
  return [...players].sort(ORDER[mode]).map((p, i) => ({ ...p, place: i + 1 }));
}

/**
 * Turns a player's last known progress into their final line. `left` players keep what they
 * had; runs still going when the host ends the race are cut at the time limit.
 */
export function finalResult(
  settings: RaceSettings,
  player: { id: string; name: string },
  p: Progress | null,
  left: boolean,
): PlayerResult {
  const prog: Progress = p ?? { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: 'racing', ms: 0 };
  const limit = runLimitMs(settings);
  const status: FinalStatus = left ? 'left' : prog.status === 'racing' ? (settings.mode === 'sudden' ? 'out' : 'finished') : prog.status;
  const completed = settings.mode === 'race' && !left && prog.completed === true && prog.words >= settings.param;
  let timeMs: number;
  if (settings.mode === 'sprint') timeMs = left ? Math.min(prog.ms, limit) : limit;
  else if (settings.mode === 'race') timeMs = completed ? Math.min(prog.ms, limit) : Math.min(left ? prog.ms : limit, limit);
  else timeMs = Math.min(prog.ms, limit);
  return {
    id: player.id,
    name: player.name,
    status,
    completed,
    wpm: round1(wpmOf(prog.chars, timeMs)),
    acc: round3(accuracyOf(prog.correctKeys, prog.keys)),
    words: prog.words,
    errors: prog.errors,
    chars: prog.chars,
    timeMs: Math.round(timeMs),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** "1st", "2nd", "3rd", "4th" … */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}
