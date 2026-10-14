import { describe, expect, it } from 'vitest';
import { MAX_FRAME } from 'termcore/net/framing';
import { encodeWire, MAX_CHAT, MAX_PLAYERS, MAX_WORDS, parseWire, type Wire } from '../src/core/protocol.js';
import { wordCount } from '../src/game/session.js';
import { randomWords } from '../src/game/words.js';

const ID = 'AAAAAAAAAAAAAAAAAAAA';
const ID2 = 'BBBBBBBBBBBBBBBBBBBB';
const GID = 'abcDEF123_-x';
const parse = (o: unknown) => parseWire(Buffer.from(JSON.stringify(o)));
const run = { chars: 50, words: 9, errors: 1, keys: 60, correctKeys: 55, idx: 10, status: 'racing', ms: 12_000 };

describe('game messages', () => {
  it('invite / lobby: valid settings and players only', () => {
    const players = [{ id: ID, name: 'Al\u001b[31mice', status: 'joined' }, { id: ID2, name: 'Bob', status: 'invited', busy: true }];
    expect(parse({ t: 'invite', gid: GID, mode: 'sprint', param: 60, players })).toEqual({
      t: 'invite',
      gid: GID,
      mode: 'sprint',
      param: 60,
      players: [{ id: ID, name: 'Alice', status: 'joined' }, { id: ID2, name: 'Bob', status: 'invited', busy: true }],
    });
    expect(parse({ t: 'lobby', gid: GID, mode: 'race', param: 50, players, starting: 2500 })).toMatchObject({ starting: 2500 });
    expect(parse({ t: 'lobby', gid: GID, mode: 'race', param: 50, players, starting: -1 })).not.toHaveProperty('starting');
    // unknown mode, length that isn't offered, broken gid, bad player
    expect(parse({ t: 'invite', gid: GID, mode: 'marathon', param: 60, players })).toBeNull();
    expect(parse({ t: 'invite', gid: GID, mode: 'sprint', param: 45, players })).toBeNull();
    expect(parse({ t: 'invite', gid: '../x', mode: 'sprint', param: 60, players })).toBeNull();
    expect(parse({ t: 'invite', gid: GID, mode: 'sprint', param: 60, players: [{ id: 'x', name: 'a', status: 'joined' }] })).toBeNull();
    expect(parse({ t: 'invite', gid: GID, mode: 'sprint', param: 60, players: [{ id: ID, status: 'boss' }] })).toBeNull();
    const many = Array.from({ length: MAX_PLAYERS + 1 }, () => ({ id: ID, name: 'x', status: 'invited' }));
    expect(parse({ t: 'invite', gid: GID, mode: 'sprint', param: 60, players: many })).toBeNull();
  });

  it('small messages carry just a gid', () => {
    for (const t of ['join', 'kick', 'leave'] as const) {
      expect(parse({ t, gid: GID })).toEqual({ t, gid: GID });
      expect(parse({ t, gid: 5 })).toBeNull();
    }
    expect(parse({ t: 'invite_decline', gid: GID, busy: true })).toEqual({ t: 'invite_decline', gid: GID, busy: true });
    expect(parse({ t: 'invite_cancel', gid: GID, reason: 'host_left' })).toEqual({ t: 'invite_cancel', gid: GID, reason: 'host_left' });
    expect(parse({ t: 'invite_cancel', gid: GID, reason: 'whatever' })).toEqual({ t: 'invite_cancel', gid: GID });
  });

  it('lobby chat is cleaned and limited', () => {
    expect(parse({ t: 'lchat', gid: GID, text: '  hi\u001b]0;x\u0007 there \n you ' })).toEqual({ t: 'lchat', gid: GID, text: 'hi there you' });
    expect(parse({ t: 'lchat', gid: GID, text: '   ' })).toBeNull();
    expect(parse({ t: 'lchat', gid: GID, text: 'x'.repeat(MAX_CHAT * 3) })).toBeNull();
    expect((parse({ t: 'lchat', gid: GID, text: 'y'.repeat(MAX_CHAT + 50) }) as { text: string }).text).toHaveLength(MAX_CHAT);
    expect(parse({ t: 'lchat', gid: GID, text: 'hi', from: ID, name: 'Bob' })).toEqual({ t: 'lchat', gid: GID, text: 'hi', from: ID, name: 'Bob' });
    expect(parse({ t: 'lchat', gid: GID, text: 'hi', from: 'evil' })).toBeNull();
  });

  it('start: lowercase words, a bounded countdown and the racers', () => {
    const words = randomWords(30);
    const ok = { t: 'start', gid: GID, mode: 'sudden', param: 0, words, countdownMs: 3000, players: [{ id: ID, name: 'A' }] };
    expect(parse(ok)).toEqual(ok);
    expect(parse({ ...ok, words: ['Hello'] })).toBeNull();
    expect(parse({ ...ok, words: ['a b'] })).toBeNull();
    expect(parse({ ...ok, words: [] })).toBeNull();
    expect(parse({ ...ok, words: Array(MAX_WORDS + 1).fill('a') })).toBeNull();
    expect(parse({ ...ok, countdownMs: 60_000 })).toBeNull();
    expect(parse({ ...ok, players: [] })).toBeNull();
    expect(parse({ ...ok, players: [{ id: 'nope' }] })).toBeNull();
  });

  it('progress and standings: non-negative integers, sane statuses', () => {
    expect(parse({ t: 'progress', gid: GID, ...run })).toEqual({ t: 'progress', gid: GID, ...run });
    expect(parse({ t: 'progress', gid: GID, ...run, completed: true })).toMatchObject({ completed: true });
    expect(parse({ t: 'progress', gid: GID, ...run, chars: -1 })).toBeNull();
    expect(parse({ t: 'progress', gid: GID, ...run, keys: 1.5 })).toBeNull();
    expect(parse({ t: 'progress', gid: GID, ...run, correctKeys: 61 })).toBeNull();
    expect(parse({ t: 'progress', gid: GID, ...run, status: 'left' })).toBeNull();
    expect(parse({ t: 'progress', gid: GID, ...run, ms: undefined })).toBeNull();
    expect(parse({ t: 'standings', gid: GID, players: [{ id: ID, ...run, status: 'left' }] })).toMatchObject({ players: [{ status: 'left' }] });
    expect(parse({ t: 'standings', gid: GID, players: [{ id: 'x', ...run }] })).toBeNull();
  });

  it('results: places, stats in range', () => {
    const line = { id: ID, name: 'A', place: 1, status: 'finished', completed: false, wpm: 71.5, acc: 0.97, words: 50, errors: 2, chars: 300, timeMs: 60_000 };
    expect(parse({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [line] })).toEqual({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [line] });
    expect(parse({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [{ ...line, place: 0 }] })).toBeNull();
    expect(parse({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [{ ...line, acc: 1.2 }] })).toBeNull();
    expect(parse({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [{ ...line, wpm: Infinity }] })).toBeNull();
    expect(parse({ t: 'results', gid: GID, mode: 'sprint', param: 60, players: [] })).toBeNull();
  });

  it('even the biggest messages stay well below MAX_FRAME', () => {
    const players = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: ID, name: 'N'.repeat(32) + i }));
    for (const s of [{ mode: 'sprint', param: 120 }, { mode: 'race', param: 100 }, { mode: 'sudden', param: 0 }] as const) {
      const words = randomWords(wordCount(s)).map(() => 'x'.repeat(24));
      const msg: Wire = { t: 'start', gid: GID, ...s, words, countdownMs: 3000, players };
      expect(encodeWire(msg).length).toBeLessThan(MAX_FRAME / 2);
    }
  });
});
