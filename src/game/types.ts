/** Game modes and their rules, shared by the engine, the protocol and the UI. */
export type Mode = 'sprint' | 'race' | 'sudden';

export const MODES: Mode[] = ['sprint', 'race', 'sudden'];

/** `param` = seconds (sprint), correct words to reach (race), unused (sudden death, always 0). */
export interface RaceSettings {
  mode: Mode;
  param: number;
}

export const SPRINT_DURATIONS = [30, 60, 120];
export const RACE_TARGETS = [25, 50, 100];

/** Allowed parameters per mode; the first entry after the default is picked with ←/→. */
export const PARAMS: Record<Mode, number[]> = {
  sprint: SPRINT_DURATIONS,
  race: RACE_TARGETS,
  sudden: [0],
};

export const DEFAULT_PARAM: Record<Mode, number> = { sprint: 60, race: 50, sudden: 0 };

/** Race mode: after this long, the race ends and unfinished players are ranked by progress. */
export const RACE_TIME_LIMIT_MS = 5 * 60_000;
/** Sudden death: hard stop, in case someone outruns the wall for this long. */
export const SUDDEN_TIME_LIMIT_MS = 10 * 60_000;

/** Sudden death "tempo wall": starts after a grace period, then speeds up step by step. */
export const WALL = {
  graceMs: 3000,
  startWpm: 20,
  stepWpm: 5,
  stepMs: 10_000,
} as const;

/** Anything faster is treated as implausible by the host. */
export const MAX_PLAUSIBLE_WPM = 350;

export const MODE_LABEL: Record<Mode, string> = { sprint: 'Sprint', race: 'Race', sudden: 'Sudden Death' };

export const MODE_BLURB: Record<Mode, string> = {
  sprint: 'most correct words in the time',
  race: 'first to type the words wins',
  sudden: "one typo and you're out · outrun the wall",
};

export function isValidSettings(mode: unknown, param: unknown): mode is Mode {
  return typeof mode === 'string' && (MODES as string[]).includes(mode) && PARAMS[mode as Mode].includes(param as number);
}

/** "Sprint · 60s", "Race · 50 words", "Sudden Death" */
export function settingsLabel(s: RaceSettings): string {
  if (s.mode === 'sprint') return `${MODE_LABEL.sprint} · ${s.param}s`;
  if (s.mode === 'race') return `${MODE_LABEL.race} · ${s.param} words`;
  return MODE_LABEL.sudden;
}

/** "a 60s sprint", "a 50-word race", "a sudden death race" (for invites) */
export function settingsPhrase(s: RaceSettings): string {
  if (s.mode === 'sprint') return `a ${s.param}s sprint`;
  if (s.mode === 'race') return `a ${s.param}-word race`;
  return 'a sudden death race';
}

/** How long a run can last at most, from GO (ms). */
export function runLimitMs(s: RaceSettings): number {
  if (s.mode === 'sprint') return s.param * 1000;
  if (s.mode === 'race') return RACE_TIME_LIMIT_MS;
  return SUDDEN_TIME_LIMIT_MS;
}

export type RunStatus = 'racing' | 'finished' | 'out';

/** A player's progress, as the guest reports it to the host (and the host to everyone). */
export interface Progress {
  /** characters of correct words, plus one space each */
  chars: number;
  /** correct words */
  words: number;
  /** wrong words */
  errors: number;
  /** keystrokes without backspace */
  keys: number;
  correctKeys: number;
  /** index of the current word */
  idx: number;
  status: RunStatus;
  /** ms since GO (when finished/out: the moment it happened) */
  ms: number;
  /** race: reached the target */
  completed?: boolean;
}

export type FinalStatus = 'finished' | 'out' | 'left';

/** A player's final line in the results. */
export interface PlayerResult {
  id: string;
  name: string;
  status: FinalStatus;
  /** race: reached the target in time */
  completed: boolean;
  wpm: number;
  /** 0..1 */
  acc: number;
  words: number;
  errors: number;
  chars: number;
  /** race: finish time · sudden death: survival time · sprint: the duration */
  timeMs: number;
}

export interface RankedResult extends PlayerResult {
  place: number;
}

/** WPM = (chars of correct words + spaces) / 5 per minute. */
export function wpmOf(chars: number, ms: number): number {
  if (ms <= 0) return 0;
  return chars / 5 / (Math.max(ms, 1000) / 60_000);
}

export function accuracyOf(correctKeys: number, keys: number): number {
  return keys > 0 ? correctKeys / keys : 1;
}
