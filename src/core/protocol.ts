import { cleanName, sanitizeText } from 'termcore/app/sanitize';
import { encodeWire, parseWire as parseBaseWire, type BaseWire, type WireExtension } from 'termcore/friends/wire';
import { isValidSettings, type Mode, type RunStatus } from '../game/types.js';

export { encodeWire };
export { reconcile, relStateFor, type ContactState, type RelState } from 'termcore/friends/state';

/** A player as listed in invites and lobby updates. */
export interface WirePlayer {
  id: string;
  name: string;
  status: 'joined' | 'invited' | 'declined' | 'left';
  /** declined because they were in another race */
  busy?: boolean;
}

/** A player's live progress in `standings` (relayed by the host). */
export interface WireStanding {
  id: string;
  chars: number;
  words: number;
  errors: number;
  keys: number;
  correctKeys: number;
  idx: number;
  status: RunStatus | 'left';
  /** ms since GO */
  ms: number;
  completed?: boolean;
}

/** A player's final line in `results`. */
export interface WireResult {
  id: string;
  name: string;
  place: number;
  status: 'finished' | 'out' | 'left';
  completed: boolean;
  wpm: number;
  acc: number;
  words: number;
  errors: number;
  chars: number;
  timeMs: number;
}

/**
 * keyrace's own messages (the base ones – state, presence, links … – come from termcore).
 * Game messages all carry a random game id (`gid`). The host is the authority: guests only
 * ever talk to the host, and the host relays to everyone (star topology). Presence carries
 * `racing: true` while we're in a countdown or race.
 */
export type GameWire =
  /** host → guest */
  | { t: 'invite'; gid: string; mode: Mode; param: number; players: WirePlayer[] }
  /** host → guest: invite withdrawn, lobby closed, kicked before joining, or the host left */
  | { t: 'invite_cancel'; gid: string; reason?: 'closed' | 'host_left' | 'started' }
  /** guest → host */
  | { t: 'join'; gid: string }
  | { t: 'invite_decline'; gid: string; busy?: boolean }
  /** host → joined guests, on every change; `starting` = ms until the automatic start */
  | { t: 'lobby'; gid: string; mode: Mode; param: number; players: WirePlayer[]; starting?: number }
  /** host → guest */
  | { t: 'kick'; gid: string }
  /** guest → host */
  | { t: 'leave'; gid: string }
  /** lobby chat: guest → host without `from`; host → everyone with `from` and `name` */
  | { t: 'lchat'; gid: string; text: string; from?: string; name?: string }
  /** host → racers: the text and a countdown that starts on receipt (no clock sync needed) */
  | { t: 'start'; gid: string; mode: Mode; param: number; words: string[]; countdownMs: number; players: { id: string; name: string }[] }
  /** guest → host */
  | ({ t: 'progress'; gid: string } & Omit<WireStanding, 'id'>)
  /** host → racers */
  | { t: 'standings'; gid: string; players: WireStanding[] }
  /** host → racers: final ranking */
  | { t: 'results'; gid: string; mode: Mode; param: number; players: WireResult[] };

export type Wire = BaseWire | GameWire;

const PEER_ID_RE = /^[A-Z2-7]{20}$/;
export const GID_RE = /^[A-Za-z0-9_-]{8,32}$/;
const WORD_RE = /^[a-z]{1,24}$/;
export const MAX_WORDS = 1000;
export const MAX_PLAYERS = 16;
export const MAX_CHAT = 200;
const MAX_COUNTDOWN = 10_000;
/** Upper bound for counters (chars, keys …) – far beyond anything a human types in 10 minutes. */
const MAX_COUNT = 100_000;
/** Upper bound for times (ms since GO). */
const MAX_TIME = 60 * 60_000;
const PLAYER_STATUS = ['joined', 'invited', 'declined', 'left'];
const RUN_STATUS = ['racing', 'finished', 'out'];

const isGid = (v: unknown): v is string => typeof v === 'string' && GID_RE.test(v);
const isPeerId = (v: unknown): v is string => typeof v === 'string' && PEER_ID_RE.test(v);
const isCount = (v: unknown, max = MAX_COUNT): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isNum = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

function parsePlayers(v: unknown): WirePlayer[] | null {
  if (!Array.isArray(v) || v.length > MAX_PLAYERS) return null;
  const out: WirePlayer[] = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (!isPeerId(o.id) || !PLAYER_STATUS.includes(o.status as string)) return null;
    out.push({ id: o.id, name: cleanName(o.name), status: o.status as WirePlayer['status'], ...(o.busy === true ? { busy: true } : {}) });
  }
  return out;
}

/** Fields of a progress report / standing, without the id. */
function parseRun(o: Record<string, unknown>, allowLeft: boolean): Omit<WireStanding, 'id'> | null {
  const statuses = allowLeft ? [...RUN_STATUS, 'left'] : RUN_STATUS;
  if (!statuses.includes(o.status as string)) return null;
  if (![o.chars, o.words, o.errors, o.keys, o.correctKeys].every((n) => isCount(n))) return null;
  if (!isCount(o.idx, MAX_WORDS) || !isCount(o.ms, MAX_TIME)) return null;
  if ((o.correctKeys as number) > (o.keys as number)) return null;
  return {
    chars: o.chars as number,
    words: o.words as number,
    errors: o.errors as number,
    keys: o.keys as number,
    correctKeys: o.correctKeys as number,
    idx: o.idx as number,
    status: o.status as WireStanding['status'],
    ms: o.ms as number,
    ...(o.completed === true ? { completed: true } : {}),
  };
}

/** Strictly validates keyrace's messages. Anything unexpected yields `null` and is dropped. */
export function parseGameWire(o: Record<string, unknown>): GameWire | null {
  switch (o.t) {
    case 'invite':
    case 'lobby': {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      const players = parsePlayers(o.players);
      if (!players) return null;
      if (o.t === 'invite') return { t: 'invite', gid: o.gid, mode: o.mode, param: o.param as number, players };
      const starting = isCount(o.starting, MAX_COUNTDOWN) ? (o.starting as number) : undefined;
      return { t: 'lobby', gid: o.gid, mode: o.mode, param: o.param as number, players, ...(starting !== undefined ? { starting } : {}) };
    }
    case 'invite_cancel': {
      if (!isGid(o.gid)) return null;
      const reason = ['closed', 'host_left', 'started'].includes(o.reason as string) ? (o.reason as 'closed' | 'host_left' | 'started') : undefined;
      return { t: 'invite_cancel', gid: o.gid, ...(reason ? { reason } : {}) };
    }
    case 'invite_decline':
      if (!isGid(o.gid)) return null;
      return { t: 'invite_decline', gid: o.gid, ...(o.busy === true ? { busy: true } : {}) };
    case 'join':
    case 'kick':
    case 'leave':
      return isGid(o.gid) ? { t: o.t, gid: o.gid } : null;
    case 'lchat': {
      if (!isGid(o.gid) || typeof o.text !== 'string' || o.text.length > MAX_CHAT * 2) return null;
      const text = sanitizeText(o.text).replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
      if (!text) return null;
      if (o.from === undefined) return { t: 'lchat', gid: o.gid, text };
      if (!isPeerId(o.from)) return null;
      return { t: 'lchat', gid: o.gid, text, from: o.from, name: cleanName(o.name) };
    }
    case 'start': {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      if (!Array.isArray(o.words) || o.words.length === 0 || o.words.length > MAX_WORDS) return null;
      if (!o.words.every((w) => typeof w === 'string' && WORD_RE.test(w))) return null;
      if (!isCount(o.countdownMs, MAX_COUNTDOWN)) return null;
      if (!Array.isArray(o.players) || o.players.length === 0 || o.players.length > MAX_PLAYERS) return null;
      const players: { id: string; name: string }[] = [];
      for (const p of o.players) {
        if (!p || typeof p !== 'object' || !isPeerId((p as Record<string, unknown>).id)) return null;
        players.push({ id: (p as { id: string }).id, name: cleanName((p as Record<string, unknown>).name) });
      }
      return { t: 'start', gid: o.gid, mode: o.mode, param: o.param as number, words: o.words as string[], countdownMs: o.countdownMs as number, players };
    }
    case 'progress': {
      if (!isGid(o.gid)) return null;
      const run = parseRun(o, false);
      return run ? { t: 'progress', gid: o.gid, ...run } : null;
    }
    case 'standings': {
      if (!isGid(o.gid) || !Array.isArray(o.players) || o.players.length > MAX_PLAYERS) return null;
      const players: WireStanding[] = [];
      for (const p of o.players) {
        if (!p || typeof p !== 'object') return null;
        const r = p as Record<string, unknown>;
        const run = parseRun(r, true);
        if (!run || !isPeerId(r.id)) return null;
        players.push({ id: r.id, ...run });
      }
      return { t: 'standings', gid: o.gid, players };
    }
    case 'results': {
      if (!isGid(o.gid) || !isValidSettings(o.mode, o.param)) return null;
      if (!Array.isArray(o.players) || o.players.length === 0 || o.players.length > MAX_PLAYERS) return null;
      const players: WireResult[] = [];
      for (const p of o.players) {
        if (!p || typeof p !== 'object') return null;
        const r = p as Record<string, unknown>;
        if (!isPeerId(r.id) || !isCount(r.place, MAX_PLAYERS) || (r.place as number) < 1) return null;
        if (!['finished', 'out', 'left'].includes(r.status as string)) return null;
        if (!isNum(r.wpm, MAX_COUNT) || !isNum(r.acc, 1) || !isCount(r.timeMs, MAX_TIME)) return null;
        if (![r.words, r.errors, r.chars].every((n) => isCount(n))) return null;
        players.push({
          id: r.id,
          name: cleanName(r.name),
          place: r.place as number,
          status: r.status as WireResult['status'],
          completed: r.completed === true,
          wpm: r.wpm,
          acc: r.acc,
          words: r.words as number,
          errors: r.errors as number,
          chars: r.chars as number,
          timeMs: r.timeMs as number,
        });
      }
      return { t: 'results', gid: o.gid, mode: o.mode, param: o.param as number, players };
    }
    default:
      return null;
  }
}

export const WIRE: WireExtension<GameWire> = {
  parse: parseGameWire,
  // `racing`: in a countdown or race right now
  presence: (o) => (o.racing === true ? { racing: true } : {}),
};

/** Everything that can arrive on a friend session. */
export function parseWire(buf: Buffer): Wire | null {
  return parseBaseWire(buf, WIRE);
}
