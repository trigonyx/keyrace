import { accuracyOf, runLimitMs, WALL, wpmOf, type Progress, type RaceSettings } from './types.js';

/** Typed characters beyond a word's length that are still shown (more are ignored). */
export const MAX_EXTRA = 8;

export type EngineStatus = 'countdown' | 'racing' | 'finished' | 'out';

export interface DoneWord {
  typed: string;
  correct: boolean;
}

// ───────────── Sudden death: the tempo wall ─────────────

const charsPerMs = (wpm: number) => (wpm * 5) / 60_000;

/** The wall's speed (WPM) at `ms` since GO; 0 during the grace period. */
export function wallWpm(ms: number): number {
  if (ms <= WALL.graceMs) return 0;
  return WALL.startWpm + WALL.stepWpm * Math.floor((ms - WALL.graceMs) / WALL.stepMs);
}

/** How far the wall has come (in characters) at `ms` since GO: the integral over its speed. */
export function wallChars(ms: number): number {
  if (ms <= WALL.graceMs) return 0;
  const x = ms - WALL.graceMs;
  const k = Math.floor(x / WALL.stepMs);
  // k full steps at startWpm, startWpm + step, …, then the part of the current step
  const full = charsPerMs(1) * WALL.stepMs * (k * WALL.startWpm + (WALL.stepWpm * k * (k - 1)) / 2);
  return full + charsPerMs(WALL.startWpm + WALL.stepWpm * k) * (x - k * WALL.stepMs);
}

/** Inverse of wallChars: the moment the wall reaches `chars`. */
export function wallTime(chars: number): number {
  let acc = 0;
  for (let k = 0; ; k++) {
    const rate = charsPerMs(WALL.startWpm + WALL.stepWpm * k);
    const step = rate * WALL.stepMs;
    if (chars <= acc + step) return WALL.graceMs + k * WALL.stepMs + (chars - acc) / rate;
    acc += step;
  }
}

// ───────────── Engine ─────────────

export interface EngineOptions {
  settings: RaceSettings;
  words: string[];
  /** Clock in ms (Date.now in the app, fake in tests). */
  now: () => number;
  /** When GO happens, on the `now()` scale. Before that the engine is in its countdown. */
  startAt: number;
}

/**
 * Pure typing logic for one player: no I/O, no timers. Feed it keystrokes and call `update()`
 * now and then (the UI does on every frame); time-based endings are decided from `now()`.
 *
 * Rules: characters are checked against the current word; space ends the word (correct only
 * if it matches exactly, otherwise it counts as an error and the race goes on); there's no way
 * back into a finished word. In sudden death the first wrong keystroke ends the run, there's
 * no correcting, and a wall that speeds up chases the player.
 */
export class TypingEngine {
  readonly settings: RaceSettings;
  readonly words: string[];
  readonly startAt: number;
  private readonly now: () => number;

  index = 0;
  typed = '';
  readonly done: DoneWord[] = [];
  /** characters of correct words, plus one space each */
  correctChars = 0;
  correctWords = 0;
  /** wrong words */
  errors = 0;
  /** keystrokes without backspace */
  keys = 0;
  correctKeys = 0;
  status: EngineStatus = 'countdown';
  /** ms since GO when the run ended */
  endedAt: number | null = null;
  outReason: 'typo' | 'wall' | null = null;
  /** race: reached the target */
  completed = false;

  constructor(opts: EngineOptions) {
    this.settings = opts.settings;
    this.words = opts.words;
    this.startAt = opts.startAt;
    this.now = opts.now;
    this.update();
  }

  get sudden(): boolean {
    return this.settings.mode === 'sudden';
  }

  get ended(): boolean {
    return this.status === 'finished' || this.status === 'out';
  }

  /** ms since GO (negative during the countdown, frozen once the run ended). */
  elapsed(): number {
    return this.endedAt ?? this.now() - this.startAt;
  }

  /** Characters that count for the wall: everything typed so far is correct in sudden death. */
  get progressChars(): number {
    return this.correctChars + (this.sudden ? this.typed.length : 0);
  }

  wpm(): number {
    return wpmOf(this.correctChars, this.elapsed());
  }

  accuracy(): number {
    return accuracyOf(this.correctKeys, this.keys);
  }

  /** Sudden death: characters ahead of the wall (negative = caught). */
  wallGap(): number {
    return this.progressChars - wallChars(Math.max(0, this.elapsed()));
  }

  /** Applies everything time decides: GO, end of a sprint, time limits, the wall. */
  update(): void {
    if (this.ended) return;
    const t = this.now() - this.startAt;
    if (this.status === 'countdown') {
      if (t < 0) return;
      this.status = 'racing';
    }
    if (this.sudden && wallChars(t) > this.progressChars) {
      // the exact moment the wall caught up (the check may run a bit later)
      return this.end('out', Math.min(t, wallTime(this.progressChars)), 'wall');
    }
    const limit = runLimitMs(this.settings);
    if (t >= limit) this.end('finished', limit);
  }

  /** Typed text (one or more characters, e.g. when keys arrive in one chunk). */
  input(text: string): void {
    for (const ch of text) {
      this.update();
      if (this.status !== 'racing') return;
      if (ch === ' ') this.space();
      else if (ch >= ' ' && ch !== '\u007f') this.char(ch);
    }
  }

  backspace(): void {
    this.update();
    if (this.status !== 'racing' || this.sudden || !this.typed) return;
    this.typed = [...this.typed].slice(0, -1).join('');
  }

  /** alt/ctrl+backspace: clears the current word. */
  deleteWord(): void {
    this.update();
    if (this.status !== 'racing' || this.sudden) return;
    this.typed = '';
  }

  private get word(): string {
    return this.words[this.index] ?? '';
  }

  private char(ch: string): void {
    const word = this.word;
    const pos = this.typed.length;
    const correct = pos < word.length && word[pos] === ch;
    this.keys++;
    if (correct) this.correctKeys++;
    if (this.sudden && !correct) {
      this.typed += ch;
      this.errors++;
      return this.end('out', this.elapsed(), 'typo');
    }
    if (pos < word.length + MAX_EXTRA) this.typed += ch;
    // race: the last word needed ends the race without a space
    if (this.settings.mode === 'race' && this.correctWords === this.settings.param - 1 && this.typed === word) {
      this.completeWord();
    }
  }

  private space(): void {
    if (!this.typed) return; // space in an empty word is ignored
    const word = this.word;
    this.keys++;
    if (this.typed === word) {
      this.correctKeys++;
      this.completeWord();
      return;
    }
    if (this.sudden) {
      this.errors++;
      return this.end('out', this.elapsed(), 'typo');
    }
    this.done.push({ typed: this.typed, correct: false });
    this.errors++;
    this.advance();
  }

  private completeWord(): void {
    this.done.push({ typed: this.typed, correct: true });
    this.correctChars += this.word.length + 1;
    this.correctWords++;
    if (this.settings.mode === 'race' && this.correctWords >= this.settings.param) {
      this.completed = true;
      this.index++;
      this.typed = '';
      return this.end('finished', this.elapsed());
    }
    this.advance();
  }

  private advance(): void {
    this.index++;
    this.typed = '';
    if (this.index >= this.words.length) this.end('finished', this.elapsed());
  }

  private end(status: 'finished' | 'out', at: number, reason: 'typo' | 'wall' | null = null): void {
    if (this.ended) return;
    this.status = status;
    this.endedAt = Math.max(0, at);
    this.outReason = reason;
  }

  /** What a guest reports to the host. */
  progress(): Progress {
    return {
      chars: this.correctChars,
      words: this.correctWords,
      errors: this.errors,
      keys: this.keys,
      correctKeys: this.correctKeys,
      idx: this.index,
      status: this.status === 'countdown' ? 'racing' : this.status,
      ms: Math.max(0, Math.round(this.elapsed())),
      ...(this.completed ? { completed: true } : {}),
    };
  }
}
