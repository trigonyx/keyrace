import crypto from 'node:crypto';
import type { Wire, WirePlayer, WireStanding } from '../core/protocol.js';
import { MAX_CHAT } from '../core/protocol.js';
import { sanitizeText } from '../core/sanitize.js';
import { TypingEngine } from './engine.js';
import * as L from './lobby.js';
import type { Lobby, LobbyPlayer, Who } from './lobby.js';
import { finalResult, rank } from './scoring.js';
import type { RaceRecord } from './stats.js';
import {
  MAX_PLAUSIBLE_WPM,
  runLimitMs,
  settingsPhrase,
  wpmOf,
  type Progress,
  type RaceSettings,
  type RankedResult,
} from './types.js';
import { randomWords } from './words.js';

export type Role = 'host' | 'guest' | 'solo';
/** joining = asked the host to join, waiting for the lobby · closed = called off (see closedReason) */
export type Phase = 'joining' | 'lobby' | 'race' | 'results' | 'closed';

export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
}

export interface Racer {
  id: string;
  name: string;
  progress: Progress | null;
  left: boolean;
}

export interface Game {
  gid: string;
  role: Role;
  hostId: string;
  hostName: string;
  settings: RaceSettings;
  phase: Phase;
  /** lobby players as last known (the host's own lobby, or the host's latest update) */
  players: LobbyPlayer[];
  chat: ChatLine[];
  /** when the automatic start fires (on our clock) */
  autoStartAt: number | null;
  engine: TypingEngine | null;
  racers: Racer[];
  results: RankedResult[] | null;
  newBest: boolean;
  closedReason: string | null;
  /** guest after the results: the host already invited everyone to a rematch */
  rematch: PendingInvite | null;
}

export interface PendingInvite {
  gid: string;
  hostId: string;
  hostName: string;
  settings: RaceSettings;
  players: WirePlayer[];
  at: number;
}

export interface GameDeps {
  me(): Who;
  send(id: string, msg: Wire): boolean;
  isOnline(id: string): boolean;
  /** accepted, unblocked friend – only they can invite us */
  isFriend(id: string): boolean;
  nameOf(id: string): string;
  changed(): void;
  toast(text: string, kind?: 'info' | 'success' | 'error'): void;
  /** desktop notification (the store only shows it while the terminal is in the background) */
  notify(title: string, body: string): void;
  save(rec: RaceRecord): { newBest: boolean };
  /** we entered or left a race (presence for friends: "▶ racing") */
  racingChanged(racing: boolean): void;
  now?: () => number;
  timing?: Partial<Timing>;
}

export interface Timing {
  /** 3 · 2 · 1 · GO */
  countdownMs: number;
  /** "everyone's here" notice before the automatic start */
  autoStartMs: number;
  /** progress / standings interval */
  tickMs: number;
  /** how long the host waits for final reports after the time limit */
  graceMs: number;
  /** how long a guest waits for the lobby after joining */
  joinTimeoutMs: number;
}

const DEFAULT_TIMING: Timing = { countdownMs: 3000, autoStartMs: 3000, tickMs: 250, graceMs: 2500, joinTimeoutMs: 6000 };
const MAX_CHAT_LINES = 50;

/** Enough text that nobody runs out: 250 WPM for a sprint, 50 % spare words for a race. */
export function wordCount(s: RaceSettings): number {
  if (s.mode === 'sprint') return Math.ceil((s.param * 250) / 60);
  if (s.mode === 'race') return Math.ceil(s.param * 1.5) + 20;
  return 600;
}

const newGid = () => crypto.randomBytes(9).toString('base64url');

/**
 * One game at a time, as host, guest or solo, plus the invites waiting for an answer.
 * The host is the authority: it keeps the lobby, collects everyone's progress, relays
 * the standings and decides the results. Guests only ever talk to the host.
 */
export class GameManager {
  game: Game | null = null;
  readonly invites = new Map<string, PendingInvite>();
  private lobby: Lobby | null = null;
  private timer: NodeJS.Timeout | null = null;
  private autoTimer: NodeJS.Timeout | null = null;
  private joinTimer: NodeJS.Timeout | null = null;
  private lastSent = '';
  private chatSeq = 0;
  private wasRacing = false;
  private readonly t: Timing;
  private readonly now: () => number;

  constructor(private readonly deps: GameDeps) {
    this.t = { ...DEFAULT_TIMING, ...deps.timing };
    this.now = deps.now ?? Date.now;
  }

  get racing(): boolean {
    return this.game?.phase === 'race';
  }

  pendingInvites(): PendingInvite[] {
    return [...this.invites.values()].sort((a, b) => b.at - a.at);
  }

  stop(): void {
    this.clearTimers();
  }

  // ───────────── Starting ─────────────

  /** New race: invites the given friends (none = solo practice). */
  create(settings: RaceSettings, inviteIds: string[]): void {
    const ids = inviteIds.filter((id) => this.deps.isFriend(id) && this.deps.isOnline(id));
    if (!ids.length) return this.solo(settings);
    this.leave();
    const me = this.deps.me();
    const gid = newGid();
    this.lobby = L.createLobby(gid, me, settings, ids.map((id) => ({ id, name: this.deps.nameOf(id) })));
    this.game = this.newGame(gid, 'host', me, settings, 'lobby');
    for (const id of ids) this.sendInvite(id);
    this.lobbyChanged();
  }

  solo(settings: RaceSettings): void {
    this.leave();
    const me = this.deps.me();
    this.game = this.newGame(newGid(), 'solo', me, settings, 'race');
    this.beginRace(randomWords(wordCount(settings)), [me], this.t.countdownMs);
  }

  private newGame(gid: string, role: Role, host: Who, settings: RaceSettings, phase: Phase): Game {
    return {
      gid,
      role,
      hostId: host.id,
      hostName: host.name,
      settings,
      phase,
      players: [],
      chat: [],
      autoStartAt: null,
      engine: null,
      racers: [],
      results: null,
      newBest: false,
      closedReason: null,
      rematch: null,
    };
  }

  // ───────────── Host: lobby ─────────────

  private get hosting(): { game: Game; lobby: Lobby } | null {
    return this.game?.role === 'host' && this.lobby ? { game: this.game, lobby: this.lobby } : null;
  }

  private wirePlayers(l: Lobby): WirePlayer[] {
    return l.players.map((p) => ({ id: p.id, name: p.name, status: p.status, ...(p.busy ? { busy: true } : {}) }));
  }

  private sendInvite(id: string): void {
    const h = this.hosting;
    if (!h) return;
    const { mode, param } = h.lobby.settings;
    const ok = this.deps.send(id, { t: 'invite', gid: h.lobby.gid, mode, param, players: this.wirePlayers(h.lobby) });
    if (!ok) this.lobby = L.leave(h.lobby, id);
  }

  /** After every lobby change: arm or cancel the automatic start, tell everyone who joined. */
  private lobbyChanged(): void {
    const h = this.hosting;
    if (!h || h.game.phase !== 'lobby') return;
    const { game, lobby } = h;
    if (L.readyToAutoStart(lobby)) {
      if (game.autoStartAt === null) {
        game.autoStartAt = this.now() + this.t.autoStartMs;
        this.autoTimer = setTimeout(() => {
          this.autoTimer = null;
          if (this.game === game && game.phase === 'lobby' && this.lobby && L.readyToAutoStart(this.lobby)) this.startRace();
        }, this.t.autoStartMs);
        this.autoTimer.unref();
      }
    } else if (game.autoStartAt !== null) {
      game.autoStartAt = null;
      if (this.autoTimer) clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    game.players = lobby.players;
    const { mode, param } = lobby.settings;
    const starting = game.autoStartAt !== null ? Math.max(0, game.autoStartAt - this.now()) : undefined;
    for (const p of L.joinedGuests(lobby)) {
      this.deps.send(p.id, { t: 'lobby', gid: lobby.gid, mode, param, players: this.wirePlayers(lobby), ...(starting !== undefined ? { starting } : {}) });
    }
    this.deps.changed();
  }

  /** Host: invite more online friends into the lobby. */
  inviteMore(ids: string[]): void {
    const h = this.hosting;
    if (!h || h.game.phase !== 'lobby') return;
    const who = ids.filter((id) => this.deps.isFriend(id) && this.deps.isOnline(id)).map((id) => ({ id, name: this.deps.nameOf(id) }));
    this.lobby = L.invite(h.lobby, who);
    for (const w of who) if (L.playerOf(this.lobby, w.id)?.status === 'invited') this.sendInvite(w.id);
    this.lobbyChanged();
  }

  /** Host: remove a player, joined or still invited. */
  kick(id: string): void {
    const h = this.hosting;
    if (!h || h.game.phase !== 'lobby') return;
    const { lobby, was } = L.kick(h.lobby, id);
    if (!was) return;
    this.lobby = lobby;
    if (was === 'joined') this.deps.send(id, { t: 'kick', gid: lobby.gid });
    else if (was === 'invited') this.deps.send(id, { t: 'invite_cancel', gid: lobby.gid, reason: 'closed' });
    this.lobbyChanged();
  }

  /** Host: players who haven't joined yet (the UI asks before starting without them). */
  pendingPlayers(): LobbyPlayer[] {
    return this.lobby && this.game?.role === 'host' ? L.pending(this.lobby) : [];
  }

  /** Host: start now. Pending invites are withdrawn. */
  startRace(): void {
    const h = this.hosting;
    if (!h || h.game.phase !== 'lobby') return;
    const { lobby, withdrawn, racers } = L.start(h.lobby);
    this.lobby = lobby;
    for (const p of withdrawn) this.deps.send(p.id, { t: 'invite_cancel', gid: lobby.gid, reason: 'started' });
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    h.game.autoStartAt = null;
    h.game.players = lobby.players;
    const words = randomWords(wordCount(lobby.settings));
    const players = racers.map((p) => ({ id: p.id, name: p.name }));
    const { mode, param } = lobby.settings;
    for (const p of racers) {
      if (p.id === lobby.hostId) continue;
      this.deps.send(p.id, { t: 'start', gid: lobby.gid, mode, param, words, countdownMs: this.t.countdownMs, players });
    }
    this.beginRace(words, players, this.t.countdownMs);
  }

  /** Host: back to a fresh lobby with the same settings and everyone from the last race. */
  rematch(): void {
    const g = this.game;
    if (!g || g.role !== 'host' || g.phase !== 'results' || !g.results) return;
    const me = this.deps.me().id;
    const ids = g.results.filter((r) => r.id !== me && r.status !== 'left').map((r) => r.id);
    const online = ids.filter((id) => this.deps.isOnline(id) && this.deps.isFriend(id));
    if (!online.length) {
      this.deps.toast('Nobody from the last race is online anymore', 'error');
      return;
    }
    this.create(g.settings, online);
  }

  // ───────────── Guest ─────────────

  /** Join an invite. Leaves whatever game we were in. */
  accept(gid: string): void {
    const inv = this.invites.get(gid);
    if (!inv) return;
    this.invites.delete(gid);
    if (!this.deps.isOnline(inv.hostId)) {
      this.deps.toast(`${inv.hostName} is offline – the invite expired`, 'error');
      this.deps.changed();
      return;
    }
    this.leave();
    this.game = this.newGame(gid, 'guest', { id: inv.hostId, name: inv.hostName }, inv.settings, 'joining');
    this.game.players = inv.players.map((p) => ({ ...p }));
    this.deps.send(inv.hostId, { t: 'join', gid });
    const game = this.game;
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (this.game === game && game.phase === 'joining') this.close(`${inv.hostName} didn't answer – the lobby may be gone`);
    }, this.t.joinTimeoutMs);
    this.joinTimer.unref();
    this.deps.changed();
  }

  decline(gid: string): void {
    const inv = this.invites.get(gid);
    if (!inv) return;
    this.invites.delete(gid);
    this.deps.send(inv.hostId, { t: 'invite_decline', gid });
    if (this.game?.rematch?.gid === gid) this.game.rematch = null;
    this.deps.changed();
  }

  // ───────────── Everyone ─────────────

  /**
   * Leaves the current game. A guest tells the host; a host closes the lobby or calls off the
   * race for everyone (no host migration); solo just stops. Nothing is recorded.
   */
  leave(): void {
    const g = this.game;
    if (!g) return;
    if (g.role === 'guest' && g.phase !== 'results' && g.phase !== 'closed') {
      this.deps.send(g.hostId, { t: 'leave', gid: g.gid });
    } else if (g.role === 'host' && this.lobby && (g.phase === 'lobby' || g.phase === 'race')) {
      const reason = g.phase === 'race' ? 'host_left' : 'closed';
      const targets = g.phase === 'race' ? g.racers.filter((r) => !r.left).map((r) => r.id) : this.lobby.players.map((p) => p.id);
      for (const id of targets) if (id !== g.hostId) this.deps.send(id, { t: 'invite_cancel', gid: g.gid, reason });
    }
    this.reset();
  }

  /** Back to the dashboard after results or a called-off game. */
  dismiss(): void {
    if (this.game && (this.game.phase === 'results' || this.game.phase === 'closed')) this.reset();
  }

  sendChat(raw: string): void {
    const g = this.game;
    if (!g || g.phase !== 'lobby') return;
    const text = sanitizeText(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
    if (!text) return;
    if (g.role === 'guest') {
      this.deps.send(g.hostId, { t: 'lchat', gid: g.gid, text });
      return;
    }
    const me = this.deps.me();
    this.relayChat(me.id, me.name, text);
  }

  private relayChat(from: string, name: string, text: string): void {
    const h = this.hosting;
    if (!h) return;
    this.addChat(h.game, from, name, text);
    for (const p of L.joinedGuests(h.lobby)) this.deps.send(p.id, { t: 'lchat', gid: h.lobby.gid, text, from, name });
  }

  private addChat(g: Game, from: string, name: string, text: string): void {
    g.chat = [...g.chat, { id: ++this.chatSeq, from, name, text }].slice(-MAX_CHAT_LINES);
    this.deps.changed();
  }

  // ───────────── Typing ─────────────

  input(text: string): void {
    this.withEngine((e) => e.input(text));
  }

  backspace(): void {
    this.withEngine((e) => e.backspace());
  }

  deleteWord(): void {
    this.withEngine((e) => e.deleteWord());
  }

  private withEngine(fn: (e: TypingEngine) => void): void {
    const g = this.game;
    const e = g?.engine;
    if (!g || !e || g.phase !== 'race') return;
    const before = `${e.index}:${e.status}`;
    fn(e);
    // every finished word (and the end of the run) is reported right away
    if (`${e.index}:${e.status}` !== before) this.onOwnProgress();
    this.deps.changed();
  }

  private onOwnProgress(): void {
    const g = this.game;
    if (!g?.engine) return;
    if (g.role === 'guest') this.sendProgress();
    else {
      this.ownRacer(g).progress = g.engine.progress();
      this.checkEnd();
    }
  }

  private ownRacer(g: Game): Racer {
    const me = this.deps.me().id;
    return g.racers.find((r) => r.id === me)!;
  }

  private sendProgress(): void {
    const g = this.game;
    if (!g?.engine || g.role !== 'guest') return;
    const p = g.engine.progress();
    const key = JSON.stringify(p);
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.ownRacer(g).progress = p;
    this.deps.send(g.hostId, { t: 'progress', gid: g.gid, ...p });
  }

  // ───────────── Race ─────────────

  private beginRace(words: string[], players: Who[], countdownMs: number): void {
    const g = this.game!;
    g.phase = 'race';
    g.racers = players.map((p) => ({ id: p.id, name: p.name, progress: null, left: false }));
    g.engine = new TypingEngine({ settings: g.settings, words, now: this.now, startAt: this.now() + countdownMs });
    this.lastSent = '';
    this.timer = setInterval(() => this.tick(), this.t.tickMs);
    this.timer.unref();
    this.updateRacing();
    this.deps.changed();
  }

  private tick(): void {
    const g = this.game;
    if (!g?.engine || g.phase !== 'race') return;
    const before = g.engine.status;
    g.engine.update();
    if (g.role === 'guest') this.sendProgress();
    else {
      this.ownRacer(g).progress = g.engine.progress();
      if (g.role === 'host') this.broadcastStandings();
      this.checkEnd();
    }
    if (g.engine.status !== before || g.role !== 'solo') this.deps.changed();
  }

  private broadcastStandings(): void {
    const g = this.game;
    if (!g || g.role !== 'host') return;
    const players: WireStanding[] = g.racers.map((r) => {
      const p = r.progress ?? { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: 'racing' as const, ms: 0 };
      return { id: r.id, ...p, status: r.left ? 'left' : p.status };
    });
    for (const r of g.racers) if (r.id !== g.hostId && !r.left) this.deps.send(r.id, { t: 'standings', gid: g.gid, players });
  }

  /** Host and solo: the race is over once everyone is done, or after the time limit. */
  private checkEnd(): void {
    const g = this.game;
    if (!g?.engine || g.phase !== 'race' || g.role === 'guest') return;
    const me = this.deps.me().id;
    const elapsed = this.now() - g.engine.startAt;
    const done = g.racers.every((r) => r.left || (r.id === me ? g.engine!.ended : r.progress !== null && r.progress.status !== 'racing'));
    if (done || elapsed > runLimitMs(g.settings) + this.t.graceMs) this.finish();
  }

  private finish(): void {
    const g = this.game!;
    const me = this.deps.me().id;
    const results = rank(
      g.settings.mode,
      g.racers.map((r) => finalResult(g.settings, r, r.id === me ? g.engine!.progress() : r.progress, r.left)),
    );
    if (g.role === 'host') {
      const { mode, param } = g.settings;
      for (const r of g.racers) if (r.id !== me && !r.left) this.deps.send(r.id, { t: 'results', gid: g.gid, mode, param, players: results });
    }
    this.showResults(results);
  }

  private showResults(results: RankedResult[]): void {
    const g = this.game!;
    this.clearTimers();
    g.phase = 'results';
    g.results = results;
    const rec: RaceRecord = {
      v: 1,
      gid: g.gid,
      ts: Date.now(),
      mode: g.settings.mode,
      param: g.settings.param,
      solo: g.role === 'solo',
      hostId: g.hostId,
      me: this.deps.me().id,
      players: results,
    };
    g.newBest = this.deps.save(rec).newBest;
    this.updateRacing();
    this.deps.changed();
  }

  private close(reason: string): void {
    const g = this.game;
    if (!g) return;
    this.clearTimers();
    g.phase = 'closed';
    g.closedReason = reason;
    this.updateRacing();
    this.deps.changed();
  }

  private reset(): void {
    this.clearTimers();
    this.game = null;
    this.lobby = null;
    this.lastSent = '';
    this.updateRacing();
    this.deps.changed();
  }

  private clearTimers(): void {
    for (const t of [this.timer, this.autoTimer, this.joinTimer]) if (t) clearTimeout(t);
    this.timer = this.autoTimer = this.joinTimer = null;
  }

  private updateRacing(): void {
    const racing = this.racing;
    if (racing === this.wasRacing) return;
    this.wasRacing = racing;
    this.deps.racingChanged(racing);
  }

  // ───────────── Network ─────────────

  onPeerOffline(id: string): void {
    for (const [gid, inv] of this.invites) if (inv.hostId === id) this.invites.delete(gid);
    const g = this.game;
    if (!g) return this.deps.changed();
    if (g.role === 'guest' && g.hostId === id) {
      if (g.phase === 'joining' || g.phase === 'lobby') this.close(`${g.hostName} went offline – the lobby is gone`);
      else if (g.phase === 'race') this.close(`${g.hostName} left – the race was called off`);
      if (g.rematch) g.rematch = null;
      return this.deps.changed();
    }
    if (g.role === 'host') {
      if (g.phase === 'lobby' && this.lobby && L.playerOf(this.lobby, id)) {
        this.lobby = L.leave(this.lobby, id);
        return this.lobbyChanged();
      }
      if (g.phase === 'race') {
        const r = g.racers.find((x) => x.id === id);
        if (r && !r.left) {
          r.left = true;
          this.checkEnd();
          this.deps.changed();
        }
      }
    }
  }

  onWire(from: string, m: Wire): void {
    switch (m.t) {
      case 'invite':
        return this.onInvite(from, m);
      case 'invite_cancel':
        return this.onCancel(from, m.gid, m.reason);
      case 'join':
        return this.onJoin(from, m.gid);
      case 'invite_decline': {
        const h = this.hosting;
        if (!h || h.lobby.gid !== m.gid || h.game.phase !== 'lobby') return;
        const p = L.playerOf(h.lobby, from);
        if (p?.status !== 'invited') return;
        this.lobby = L.decline(h.lobby, from, m.busy);
        this.deps.toast(m.busy ? `${p.name} is busy racing` : `${p.name} declined`, 'info');
        return this.lobbyChanged();
      }
      case 'leave':
        return this.onLeave(from, m.gid);
      case 'lobby': {
        const g = this.guestGame(from, m.gid);
        if (!g || (g.phase !== 'joining' && g.phase !== 'lobby')) return;
        if (this.joinTimer) clearTimeout(this.joinTimer);
        this.joinTimer = null;
        g.phase = 'lobby';
        g.settings = { mode: m.mode, param: m.param };
        g.players = m.players.map((p) => ({ ...p }));
        g.autoStartAt = m.starting !== undefined ? this.now() + m.starting : null;
        return this.deps.changed();
      }
      case 'kick': {
        const g = this.guestGame(from, m.gid);
        if (!g || (g.phase !== 'joining' && g.phase !== 'lobby')) return;
        this.reset();
        this.deps.toast(`${g.hostName} removed you from the lobby`, 'error');
        return;
      }
      case 'lchat': {
        if (m.from === undefined) {
          // a guest's message → relay it to everyone
          const h = this.hosting;
          if (!h || h.lobby.gid !== m.gid || h.game.phase !== 'lobby') return;
          const p = L.playerOf(h.lobby, from);
          if (p?.status !== 'joined') return;
          return this.relayChat(from, p.name, m.text);
        }
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== 'lobby') return;
        return this.addChat(g, m.from, m.name ?? 'Unknown', m.text);
      }
      case 'start': {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== 'lobby') return;
        const me = this.deps.me().id;
        if (!m.players.some((p) => p.id === me)) return;
        g.settings = { mode: m.mode, param: m.param };
        g.autoStartAt = null;
        return this.beginRace(m.words, m.players, m.countdownMs);
      }
      case 'progress':
        return this.onProgress(from, m);
      case 'standings': {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== 'race') return;
        const me = this.deps.me().id;
        for (const s of m.players) {
          const r = g.racers.find((x) => x.id === s.id);
          if (!r || s.id === me) continue;
          const { id: _id, status, ...rest } = s;
          r.left = status === 'left';
          r.progress = { ...rest, status: status === 'left' ? (r.progress?.status ?? 'racing') : status };
        }
        return this.deps.changed();
      }
      case 'results': {
        const g = this.guestGame(from, m.gid);
        if (!g || g.phase !== 'race') return;
        return this.showResults(m.players.map((p) => ({ ...p })));
      }
    }
  }

  /** Our game as a guest, if `from` is its host and `gid` matches. */
  private guestGame(from: string, gid: string): Game | null {
    const g = this.game;
    return g && g.role === 'guest' && g.gid === gid && g.hostId === from ? g : null;
  }

  private onInvite(from: string, m: Extract<Wire, { t: 'invite' }>): void {
    // only friends can invite us (strangers and blocked peers are ignored)
    if (!this.deps.isFriend(from)) return;
    const me = this.deps.me().id;
    if (!m.players.some((p) => p.id === me)) return;
    // we're in the middle of a race: say so instead of interrupting
    if (this.game?.phase === 'race') {
      this.deps.send(from, { t: 'invite_decline', gid: m.gid, busy: true });
      return;
    }
    const hostName = this.deps.nameOf(from);
    const inv: PendingInvite = { gid: m.gid, hostId: from, hostName, settings: { mode: m.mode, param: m.param }, players: m.players, at: Date.now() };
    // one invite per host: a newer one replaces the old
    for (const [gid, old] of this.invites) if (old.hostId === from) this.invites.delete(gid);
    this.invites.set(m.gid, inv);
    const g = this.game;
    if (g && g.role === 'guest' && g.hostId === from && g.phase === 'results') g.rematch = inv;
    const text = `${hostName} invites you to ${settingsPhrase(inv.settings)}`;
    this.deps.toast(text, 'info');
    this.deps.notify('keyrace', text);
    this.deps.changed();
  }

  private onCancel(from: string, gid: string, reason?: 'closed' | 'host_left' | 'started'): void {
    const inv = this.invites.get(gid);
    if (inv && inv.hostId === from) {
      this.invites.delete(gid);
      if (this.game?.rematch?.gid === gid) this.game.rematch = null;
      this.deps.changed();
    }
    const g = this.guestGame(from, gid);
    if (!g) return;
    if (g.phase === 'race' || reason === 'host_left') this.close(`${g.hostName} left – the race was called off`);
    else if (g.phase === 'joining' || g.phase === 'lobby') {
      this.reset();
      this.deps.toast(reason === 'started' ? `${g.hostName} started without you` : `${g.hostName} closed the lobby`, 'error');
    }
  }

  private onJoin(from: string, gid: string): void {
    const h = this.hosting;
    if (!h || h.lobby.gid !== gid) return void this.deps.send(from, { t: 'invite_cancel', gid, reason: 'closed' });
    if (h.game.phase !== 'lobby') return void this.deps.send(from, { t: 'invite_cancel', gid, reason: 'started' });
    const { lobby, ok } = L.join(h.lobby, from);
    if (!ok) return void this.deps.send(from, { t: 'invite_cancel', gid, reason: 'closed' });
    this.lobby = lobby;
    this.lobbyChanged();
  }

  private onLeave(from: string, gid: string): void {
    const h = this.hosting;
    if (!h || h.lobby.gid !== gid) return;
    if (h.game.phase === 'lobby') {
      this.lobby = L.leave(h.lobby, from);
      return this.lobbyChanged();
    }
    if (h.game.phase === 'race') {
      const r = h.game.racers.find((x) => x.id === from);
      if (!r || r.left) return;
      r.left = true;
      this.checkEnd();
      this.deps.changed();
    }
  }

  /** Host: a guest's progress. Must only move forward and stay humanly possible. */
  private onProgress(from: string, m: Extract<Wire, { t: 'progress' }>): void {
    const g = this.game;
    if (!g || g.role !== 'host' || g.gid !== m.gid || g.phase !== 'race' || !g.engine) return;
    const r = g.racers.find((x) => x.id === from);
    if (!r || r.left) return;
    const prev = r.progress;
    const { t: _type, gid: _gid, completed: claimed, ...p } = m;
    if (p.status === 'left') return;
    if (prev) {
      if (prev.status !== 'racing') return; // final report already in
      if (p.chars < prev.chars || p.words < prev.words || p.errors < prev.errors || p.keys < prev.keys || p.ms < prev.ms) return;
    }
    // their clock and ours run at the same pace; the network adds a few ms at most
    const hostElapsed = this.now() - g.engine.startAt;
    const ms = Math.min(p.ms, Math.max(0, hostElapsed + 2000));
    if (p.chars > 30 && wpmOf(p.chars, ms) > MAX_PLAUSIBLE_WPM) return;
    const completed = g.settings.mode === 'race' && claimed === true && p.words >= g.settings.param;
    r.progress = { ...p, status: p.status, ms, ...(completed ? { completed: true } : {}) };
    this.checkEnd();
    this.deps.changed();
  }
}
