import { describe, expect, it } from 'vitest';
import { TypingEngine, wallChars, wallTime, wallWpm } from '../src/game/engine.js';
import { RACE_TIME_LIMIT_MS, WALL, type RaceSettings } from '../src/game/types.js';
import { randomWords, WORDS } from '../src/game/words.js';

/** An engine on a fake clock that starts at 0 and has GO at 0. */
function setup(settings: RaceSettings, words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'], countdown = 0) {
  const clock = { now: 0 };
  const e = new TypingEngine({ settings, words, now: () => clock.now, startAt: countdown });
  return { e, clock, at: (ms: number) => void (clock.now = ms) };
}

const sprint: RaceSettings = { mode: 'sprint', param: 60 };

describe('typing', () => {
  it('counts correct and wrong words; space ends a word either way', () => {
    const { e } = setup(sprint);
    e.input('the quikc brown ');
    expect(e.correctWords).toBe(2);
    expect(e.errors).toBe(1);
    expect(e.index).toBe(3);
    expect(e.done.map((d) => d.correct)).toEqual([true, false, true]);
    expect(e.done[1]!.typed).toBe('quikc');
    // correct chars: "the " + "brown " = 4 + 6
    expect(e.correctChars).toBe(10);
  });

  it('fixes mistakes in the current word with backspace, but never goes back to a finished word', () => {
    const { e } = setup(sprint);
    e.input('thx');
    e.backspace();
    e.input('e ');
    expect(e.correctWords).toBe(1);
    e.backspace();
    e.backspace();
    expect(e.index).toBe(1);
    expect(e.typed).toBe('');
    expect(e.done).toHaveLength(1);
  });

  it('clears the whole current word with alt/ctrl+backspace', () => {
    const { e } = setup(sprint);
    e.input('the qwerty');
    e.deleteWord();
    expect(e.typed).toBe('');
    e.input('quick ');
    expect(e.correctWords).toBe(2);
  });

  it('ignores space in an empty word', () => {
    const { e } = setup(sprint);
    e.input('   the  ');
    expect(e.index).toBe(1);
    expect(e.correctWords).toBe(1);
    expect(e.keys).toBe(4); // t h e + one space
  });

  it('shows extra characters but caps them, and counts them as wrong keystrokes', () => {
    const { e } = setup(sprint);
    e.input('thexxxxxxxxxxxxxxxxx');
    expect(e.typed).toBe('the' + 'x'.repeat(8));
    expect(e.keys).toBe(20);
    expect(e.correctKeys).toBe(3);
    e.input(' ');
    expect(e.errors).toBe(1);
  });

  it('accuracy = correct keystrokes / all keystrokes, backspace not counted', () => {
    const { e } = setup(sprint);
    e.input('tha');
    e.backspace();
    e.input('e ');
    // t h a e space → 5 keys, 4 correct ("a" was wrong)
    expect(e.keys).toBe(5);
    expect(e.correctKeys).toBe(4);
    expect(e.accuracy()).toBeCloseTo(0.8);
  });

  it('WPM = (chars of correct words + spaces) / 5 per minute', () => {
    const { e, at } = setup(sprint);
    e.input('the quick brown fox ');
    // 4 + 6 + 6 + 4 = 20 chars = 4 words
    at(30_000);
    expect(e.wpm()).toBeCloseTo(8);
    at(60_000);
    e.update();
    expect(e.wpm()).toBeCloseTo(4);
  });

  it('ignores input during the countdown and starts at GO', () => {
    const { e, at } = setup(sprint, undefined, 3000);
    e.input('the ');
    expect(e.status).toBe('countdown');
    expect(e.index).toBe(0);
    at(3000);
    e.input('the ');
    expect(e.status).toBe('racing');
    expect(e.correctWords).toBe(1);
    expect(e.elapsed()).toBe(0);
  });
});

describe('sprint', () => {
  it('ends exactly at the time limit and takes no more input', () => {
    const { e, at } = setup({ mode: 'sprint', param: 30 });
    e.input('the quick ');
    at(29_999);
    e.update();
    expect(e.status).toBe('racing');
    at(30_500);
    e.input('brown ');
    expect(e.status).toBe('finished');
    expect(e.endedAt).toBe(30_000);
    expect(e.correctWords).toBe(2);
    expect(e.wpm()).toBeCloseTo((10 / 5) * 2);
  });

  it('finishes when the text runs out', () => {
    const { e } = setup(sprint, ['a', 'b']);
    e.input('a b ');
    expect(e.status).toBe('finished');
  });
});

describe('race', () => {
  const race: RaceSettings = { mode: 'race', param: 25 };
  const words = randomWords(60);

  it('finishes on the last needed word without a space', () => {
    const { e, at } = setup(race, words);
    at(1000);
    e.input(words.slice(0, 24).join(' ') + ' ');
    expect(e.status).toBe('racing');
    at(20_000);
    e.input(words[24]!);
    expect(e.status).toBe('finished');
    expect(e.completed).toBe(true);
    expect(e.correctWords).toBe(25);
    expect(e.endedAt).toBe(20_000);
    expect(e.progress()).toMatchObject({ status: 'finished', completed: true, words: 25, ms: 20_000 });
  });

  it('needs correct words: wrong ones do not count towards the target', () => {
    const { e } = setup(race, words);
    e.input('nope '.repeat(3));
    e.input(words.slice(3, 27).join(' ') + ' ');
    expect(e.errors).toBe(3);
    expect(e.correctWords).toBe(24);
    expect(e.status).toBe('racing');
  });

  it('ends at the time limit, unfinished', () => {
    const { e, at } = setup(race, words);
    e.input(words.slice(0, 10).join(' ') + ' ');
    at(RACE_TIME_LIMIT_MS + 5);
    e.update();
    expect(e.status).toBe('finished');
    expect(e.completed).toBe(false);
    expect(e.endedAt).toBe(RACE_TIME_LIMIT_MS);
  });
});

describe('sudden death', () => {
  const sudden: RaceSettings = { mode: 'sudden', param: 0 };

  it('the first wrong keystroke ends the run', () => {
    const { e, at } = setup(sudden);
    at(500);
    e.input('the qu');
    at(900);
    e.input('x');
    expect(e.status).toBe('out');
    expect(e.outReason).toBe('typo');
    expect(e.endedAt).toBe(900);
    e.input('ick');
    expect(e.typed).toBe('qux');
  });

  it('a space before the word is complete is a typo too; no correcting', () => {
    const { e } = setup(sudden);
    e.input('th');
    e.backspace();
    e.deleteWord();
    expect(e.typed).toBe('th');
    e.input(' ');
    expect(e.status).toBe('out');
  });

  it('wall math: grace period, then the integral over a speed that steps up', () => {
    expect(wallWpm(0)).toBe(0);
    expect(wallWpm(WALL.graceMs)).toBe(0);
    expect(wallWpm(WALL.graceMs + 1)).toBe(20);
    expect(wallWpm(WALL.graceMs + 10_000)).toBe(25);
    expect(wallWpm(WALL.graceMs + 25_000)).toBe(30);
    expect(wallChars(WALL.graceMs)).toBe(0);
    // 10 s at 20 wpm = 20 * 5 / 60 * 10 chars
    expect(wallChars(WALL.graceMs + 10_000)).toBeCloseTo((20 * 5 * 10) / 60);
    // then 5 s at 25 wpm on top
    expect(wallChars(WALL.graceMs + 15_000)).toBeCloseTo((20 * 5 * 10) / 60 + (25 * 5 * 5) / 60);
    for (const chars of [0.5, 10, 16.6, 40, 300]) expect(wallChars(wallTime(chars))).toBeCloseTo(chars);
  });

  it('the grace period protects, then the wall catches whoever stands still', () => {
    const { e, at } = setup(sudden);
    at(WALL.graceMs);
    e.update();
    expect(e.status).toBe('racing');
    at(WALL.graceMs + 100);
    e.update();
    expect(e.status).toBe('out');
    expect(e.outReason).toBe('wall');
    expect(e.endedAt).toBe(WALL.graceMs);
  });

  it('typing faster than the wall keeps you in; the exact catch time is recorded', () => {
    const { e, at } = setup(sudden);
    at(2000);
    e.input('the quick '); // 10 chars ahead, wall reaches them at wallTime(10)
    at(8000);
    e.update();
    expect(e.status).toBe('racing');
    expect(e.wallGap()).toBeCloseTo(10 - wallChars(8000));
    at(20_000);
    e.update();
    expect(e.status).toBe('out');
    expect(e.endedAt).toBeCloseTo(wallTime(10));
  });
});

describe('words', () => {
  it('has about 1000 lowercase words without duplicates', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(950);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.every((w) => /^[a-z]+$/.test(w))).toBe(true);
  });

  it('never repeats a word right away', () => {
    const list = randomWords(2000);
    expect(list).toHaveLength(2000);
    for (let i = 1; i < list.length; i++) expect(list[i]).not.toBe(list[i - 1]);
  });
});
