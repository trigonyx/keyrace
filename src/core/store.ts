import fs from 'node:fs';
import { GameManager, type PendingInvite, type Tuning } from '../game/session.js';
import { ResultsBook } from '../game/results.js';
import { leaderboard, type LeaderRow, type RaceRecord, type Stats } from '../game/stats.js';
import { ContactBook, displayName, type Contact } from './contacts.js';
import { Dialer } from './dialer.js';
import { Discovery, localIPv4s, type DiscoveredPeer, type DiscoveryOptions } from './discovery.js';
import { loadConfig, loadOrCreateIdentity, safetyCode, saveConfig, type Identity } from './identity.js';
import { DEFAULT_PORT, Network } from './network.js';
import { notify } from './notify.js';
import type { Paths } from './paths.js';
import type { Session } from './peer.js';
import { PeerBook } from './peers.js';
import { reconcile, relStateFor, type ContactState, type Wire } from './protocol.js';
import { cleanName } from './sanitize.js';
import { Toasts, type NoteKind, type Toast } from './toasts.js';

export type { NoteKind, Toast };

export interface StoreOptions {
  paths: Paths;
  port?: number;
  discovery?: boolean;
  discoveryPort?: number;
  /** Simulated network for discovery (tests). */
  discoveryOptions?: Pick<DiscoveryOptions, 'transport' | 'interfaces'>;
  dialIntervalMs?: number;
  debug?: boolean;
  /** Desktop notification sink (defaults to the OS notifier). */
  notify?: (title: string, body: string) => void;
  /** Game timings and limits (tests use short countdowns and type instantly). */
  tuning?: Partial<Tuning>;
}

export interface FriendView extends Contact {
  display: string;
  online: boolean;
  /** connected, but their terminal is in the background */
  away: boolean;
  /** in a countdown or race right now */
  racing: boolean;
}

export type RequestEntry = { kind: 'friend'; friend: FriendView } | { kind: 'invite'; invite: PendingInvite };

export interface DashboardData {
  /** friend requests and race invites */
  requests: RequestEntry[];
  /** accepted friends (racing and online first), then pending, declined and blocked ones */
  friends: FriendView[];
  /** keyrace users on the network who aren't friends yet */
  nearby: DiscoveredPeer[];
}

/** Unknown connections that don't introduce themselves are dropped after this time. */
const UNKNOWN_PEER_TIMEOUT = 15_000;

const FRIEND_ORDER: Record<ContactState, number> = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };

/**
 * Central app logic: friends, presence and the network, plus the game manager. Exposes a
 * subscribable state to the UI and also runs without a UI (tests). Auto-connecting lives in
 * dialer.ts, everything about races in game/session.ts.
 */
export class AppStore {
  readonly identity: Identity;
  readonly contacts: ContactBook;
  readonly network: Network;
  readonly games: GameManager;
  readonly results: ResultsBook;
  readonly paths: Paths;
  private readonly peerBook: PeerBook;
  private readonly dialer: Dialer;
  private readonly toasts: Toasts;
  private discovery: Discovery | null = null;
  private name: string;
  private readonly preferredPort: number;
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private focused = true;
  /** Peers that reported their terminal is in the background … */
  private away = new Set<string>();
  /** … or that they're racing. */
  private racingPeers = new Set<string>();
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable: string | null = null;

  constructor(private readonly opts: StoreOptions) {
    const cfg = loadConfig(opts.paths);
    if (!cfg) throw new Error('No profile found');
    this.paths = opts.paths;
    this.name = cfg.name;
    this.preferredPort = opts.port ?? cfg.port ?? DEFAULT_PORT;
    this.identity = loadOrCreateIdentity(opts.paths);
    this.contacts = new ContactBook(opts.paths);
    this.network = new Network(this.identity, () => this.name);
    this.peerBook = new PeerBook(opts.paths);
    this.results = new ResultsBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      contacts: this.contacts,
      discovery: () => this.discovery,
      log: (l) => this.log(l),
      unreachable: (_id, text) => this.showToast(text, 'error'),
    });
    this.games = new GameManager({
      me: () => ({ id: this.identity.id, name: this.name }),
      send: (id, msg) => this.network.get(id)?.send(msg) ?? false,
      isOnline: (id) => this.network.isOnline(id),
      isFriend: (id) => this.contacts.get(id)?.state === 'accepted',
      nameOf: (id) => this.peerName(id),
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.desktopNotify(title, body),
      save: (rec) => this.saveResult(rec),
      racingChanged: () => this.broadcastPresence(),
      tuning: opts.tuning,
    });
    this.network.on('session', (s) => this.onSession(s));
    this.network.on('offline', (id) => this.onOffline(id));
    this.network.on('log', (l) => this.log(l));
  }

  /** Creates the profile and keys on first launch. */
  static createProfile(paths: Paths, name: string): void {
    loadOrCreateIdentity(paths);
    saveConfig(paths, { name: cleanName(name) });
  }

  // ───────────── Lifecycle ─────────────

  async start(): Promise<void> {
    await this.network.start(this.preferredPort);
    if (this.opts.discovery !== false) {
      this.discovery = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...this.opts.discoveryOptions,
        udpPort: this.opts.discoveryPort,
        hints: () => this.dialer.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id),
      });
      this.discovery.on('change', () => {
        for (const p of this.discovery?.peers.values() ?? []) {
          // Recognized by ID: if a friend's address changed, remember the new one (the dialer retries)
          const c = this.contacts.get(p.id);
          if (c && (c.lastIp !== p.ip || c.lastPort !== p.port)) this.contacts.upsert(p.id, { lastIp: p.ip, lastPort: p.port });
        }
        this.dialer.discovered(this.discovery?.peers.keys() ?? []);
        this.changed();
      });
      this.discovery.on('log', (l) => this.log(l));
      this.discovery.on('callback', (id) => this.dialer.onCallback(id));
      this.discovery.start();
    }
    this.dialer.start(this.opts.dialIntervalMs ?? 1500);
    this.changed();
  }

  async stop(): Promise<void> {
    this.games.leave();
    this.games.stop();
    this.dialer.stop();
    this.toasts.stop();
    this.discovery?.stop();
    await this.network.stop();
  }

  // ───────────── Subscription for React ─────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }

  // ───────────── Queries ─────────────

  get me() {
    return {
      id: this.identity.id,
      name: this.name,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discovery !== null,
      scanning: this.discovery?.scanning ?? false,
    };
  }

  get toast(): Toast | null {
    return this.toasts.current;
  }

  isOnline(id: string): boolean {
    return this.network.isOnline(id);
  }

  friend(id: string): FriendView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    const online = this.isOnline(id);
    return { ...c, display: displayName(c), online, away: online && this.away.has(id), racing: online && this.racingPeers.has(id) };
  }

  /** Best name for any peer: own nickname/friend name, else what we remember from races. */
  peerName(id: string): string {
    if (id === this.identity.id) return this.name;
    const c = this.contacts.get(id);
    if (c) return displayName(c);
    return this.peerBook.get(id)?.name ?? 'Unknown';
  }

  /** Accepted friends who are online right now (who can be invited). */
  onlineFriends(): FriendView[] {
    return this.contacts
      .all()
      .filter((c) => c.state === 'accepted' && this.isOnline(c.id))
      .map((c) => this.friend(c.id)!)
      .sort((a, b) => a.display.localeCompare(b.display));
  }

  dashboard(): DashboardData {
    const all = this.contacts.all().map((c) => this.friend(c.id)!);
    const known = new Set(all.map((f) => f.id));
    const presence = (f: FriendView) => (f.state !== 'accepted' ? 4 : f.racing ? 0 : f.online && !f.away ? 1 : f.away ? 2 : 3);
    const friends = all
      .filter((f) => f.state !== 'incoming')
      .sort(
        (a, b) =>
          FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display),
      );
    const requests: RequestEntry[] = [
      ...this.games.pendingInvites().map((invite): RequestEntry => ({ kind: 'invite', invite })),
      ...all
        .filter((f) => f.state === 'incoming')
        .sort((a, b) => b.lastActivity - a.lastActivity)
        .map((friend): RequestEntry => ({ kind: 'friend', friend })),
    ];
    return {
      requests,
      friends,
      nearby: [...(this.discovery?.peers.values() ?? [])].filter((p) => !known.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Number of accepted friends online. */
  onlineCount(): number {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === 'accepted') n++;
    return n;
  }

  stats(): Stats {
    return this.results.stats(this.identity.id);
  }

  leaderboard(): LeaderRow[] {
    const friends = new Map<string, string>();
    for (const c of this.contacts.all()) if (c.state === 'accepted') friends.set(c.id, displayName(c));
    return leaderboard(this.stats(), { id: this.identity.id, name: this.name }, friends);
  }

  safetyCodeWith(id: string): string | null {
    const c = this.contacts.get(id);
    if (!c?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c.publicKey, 'base64url'));
  }

  // ───────────── UI helpers ─────────────

  showToast(text: string, kind: NoteKind = 'info'): void {
    this.toasts.show(text, kind);
  }

  private log(line: string): void {
    if (!this.opts.debug) return;
    try {
      fs.appendFileSync(this.opts.paths.log, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // logging must never break the app
    }
  }

  // ───────────── Friends ─────────────

  /** Request to a peer from "Nearby". */
  requestNearby(id: string): void {
    const p = this.discovery?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      // they asked us first (maybe at the same moment) → that's a yes from both sides
      if (existing.state === 'incoming') this.accept(id);
      else if (existing.state === 'declined' || existing.state === 'blocked') this.setState(id, 'outgoing');
      this.dialer.connect(id);
      return;
    }
    if (!p) throw new Error('Player is no longer nearby');
    this.contacts.upsert(id, { publicKey: '', name: p.name, state: 'outgoing', lastIp: p.ip, lastPort: p.port });
    this.showToast(`Friend request sent to ${p.name}`);
    this.dialer.connect(id);
    this.changed();
  }

  /** Ask again (after a decline). */
  request(id: string): void {
    this.setState(id, 'outgoing');
    this.showToast('Friend request sent again');
    this.dialer.connect(id);
  }

  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host: string, port = DEFAULT_PORT): Promise<string> {
    const session = await this.network.dial(host, port, undefined, 'request');
    return session.peerId;
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (!c || c.state !== 'incoming') return;
    this.setState(id, 'accepted');
    this.showToast(`You and ${displayName(c)} are now friends`, 'success');
    this.dialer.connect(id);
  }

  decline(id: string): void {
    const c = this.contacts.get(id);
    if (!c) return;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: 'decline' });
      s.close('Declined');
    }
    this.contacts.remove(id);
    this.showToast(`Declined ${displayName(c)}'s request`);
    this.changed();
  }

  block(id: string): void {
    const c = this.contacts.get(id);
    if (!c) return;
    this.contacts.upsert(id, { state: 'blocked' });
    this.network.get(id)?.close('Blocked');
    this.showToast(`${displayName(c)} is blocked. No more connections will be accepted.`, 'error');
    this.changed();
  }

  unblock(id: string): void {
    const c = this.contacts.get(id);
    if (c?.state !== 'blocked') return;
    this.setState(id, 'outgoing');
    this.showToast(`Unblocked ${displayName(c)} – friend request sent`, 'success');
    this.dialer.connect(id);
  }

  removeFriend(id: string): void {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: 'state', name: this.name, state: 'none', port: this.network.port });
      s.close('Friend removed');
    }
    this.changed();
  }

  rename(id: string, alias: string): void {
    const clean = alias.trim() ? cleanName(alias) : undefined;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }

  setName(name: string): string {
    this.name = cleanName(name);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), name: this.name });
    for (const id of this.network.sessions.keys()) this.sendState(id);
    this.discovery?.announce(false);
    this.changed();
    return this.name;
  }

  // ───────────── Presence and notifications ─────────────

  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }

  private broadcastPresence(): void {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }

  private sendPresence(id: string): void {
    this.network.get(id)?.send({ t: 'presence', away: !this.focused, ...(this.games.racing ? { racing: true } : {}) });
  }

  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused(): boolean {
    return this.focused;
  }

  notificationsEnabled(): boolean {
    return loadConfig(this.opts.paths)?.notifications !== false;
  }

  setNotifications(on: boolean): void {
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths)!, notifications: on });
  }

  setUpdateAvailable(version: string | null): void {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`keyrace ${version} is available – /update installs it`);
    else this.changed();
  }

  private desktopNotify(title: string, body: string): void {
    if (this.focused || !this.notificationsEnabled()) return;
    (this.opts.notify ?? notify)(title, body);
  }

  // ───────────── Races ─────────────

  private saveResult(rec: RaceRecord): { newBest: boolean } {
    // remember opponents who aren't friends, so stats can still name them
    for (const p of rec.players) {
      if (p.id !== this.identity.id && !this.contacts.get(p.id)) this.peerBook.update(p.id, { name: p.name, lastSeen: rec.ts });
    }
    return this.results.add(rec);
  }

  // ───────────── Network events ─────────────

  private setState(id: string, state: ContactState): void {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }

  private sendState(id: string): void {
    const s = this.network.get(id);
    const c = this.contacts.get(id);
    s?.send({ t: 'state', name: this.name, state: relStateFor(c?.state ?? null), port: this.network.port });
  }

  private onSession(s: Session): void {
    const id = s.peerId;
    let c = this.contacts.get(id);
    if (c?.state === 'blocked') {
      s.close('Blocked', false);
      return;
    }
    this.dialer.connected(id);

    if (s.tag === 'request') {
      // user explicitly added them by IP
      if (!c) {
        c = this.contacts.upsert(id, { publicKey: '', name: s.peerName, state: 'outgoing' });
        this.showToast(`Friend request sent to ${s.peerName} – waiting for them to accept`);
      } else if (c.state === 'incoming') {
        this.accept(id);
      } else if (c.state === 'declined') {
        this.contacts.upsert(id, { state: 'outgoing' });
      }
    }
    if (c) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString('base64url'),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now(),
      });
    }

    s.on('message', (m) => this.onWire(s, m));
    if (!c) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id)) s.close('No request received');
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    this.sendState(id);
    if (!this.focused || this.games.racing) this.sendPresence(id);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }

  private onOffline(id: string): void {
    this.away.delete(id);
    this.racingPeers.delete(id);
    this.games.onPeerOffline(id);
    this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }

  private onWire(s: Session, m: Wire): void {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    switch (m.t) {
      case 'state':
        return this.onState(s, m);
      case 'decline': {
        const c = this.contacts.get(id);
        if (c?.state === 'outgoing') {
          this.contacts.upsert(id, { state: 'declined' });
          this.showToast(`${displayName(c)} declined your friend request`, 'error');
        }
        return;
      }
      case 'presence': {
        if (!this.contacts.get(id)) return;
        const racing = m.racing === true;
        if (m.away === this.away.has(id) && racing === this.racingPeers.has(id)) return;
        if (m.away) this.away.add(id);
        else this.away.delete(id);
        if (racing) this.racingPeers.add(id);
        else this.racingPeers.delete(id);
        this.changed();
        return;
      }
      case 'ping':
      case 'pong':
      case 'bye':
        return;
      default:
        // everything else is about races; the game manager checks who may send what
        if (this.contacts.get(id)?.state === 'blocked') return;
        this.games.onWire(id, m);
    }
  }

  private onState(s: Session, m: Extract<Wire, { t: 'state' }>): void {
    const id = s.peerId;
    const c = this.contacts.get(id);
    const prev = c?.state ?? null;
    const next = reconcile(prev, m.state);

    if (next === null) {
      if (c) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c)} withdrew their friend request`);
      }
      s.close('Not a friend');
      this.changed();
      return;
    }

    const updated = this.contacts.upsert(id, {
      publicKey: s.peerPublicRaw.toString('base64url'),
      name: m.name,
      state: next,
      lastIp: s.remoteAddress,
      lastPort: m.port || c?.lastPort,
      lastSeen: Date.now(),
      ...(prev !== next ? { lastActivity: Date.now() } : {}),
    });
    const who = displayName(updated);

    if (next === 'accepted' && prev !== 'accepted') {
      this.showToast(prev === 'outgoing' ? `${who} accepted your friend request` : `You and ${who} are now friends`, 'success');
    } else if (next === 'incoming' && prev !== 'incoming') {
      this.showToast(`${who} wants to be friends`, 'info');
      this.desktopNotify('keyrace', `${who} wants to be friends`);
    } else if (prev === 'accepted' && next === 'outgoing') {
      this.showToast(`${who} removed you as a friend – your request is waiting to be accepted`, 'error');
    }

    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.changed();
  }
}
