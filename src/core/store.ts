import { Toasts, type NoteKind, type Toast } from 'termcore/app/toasts';
import { displayName, type ContactOf } from 'termcore/friends/book';
import { appendLog, FriendNet, type FriendEvent } from 'termcore/friends/net';
import { noticeLine } from 'termcore/friends/notices';
import type { Status } from 'termcore/friends/profile';
import type { ContactState } from 'termcore/friends/state';
import type { DiscoveredPeer, DiscoveryOptions } from 'termcore/net/discovery';
import type { Settings } from 'termcore/store/files';
import { Hub } from 'termcore/store/hub';
import { setAccent, setPersonColors } from 'termcore/ui/theme';
import { APP } from '../app.js';
import { ResultsBook } from '../game/results.js';
import { GameManager, type PendingInvite, type Tuning } from '../game/session.js';
import { leaderboard, type LeaderRow, type RaceRecord, type Stats } from '../game/stats.js';
import { readConfig } from './config.js';
import type { Paths } from './paths.js';
import { WIRE, type GameWire } from './protocol.js';

export type { NoteKind, Toast };

export type Contact = ContactOf<object>;

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
  /** not online in keyrace, but in these apps of theirs (an invite reaches them there) */
  elsewhere: string[];
  /** their status (only while connected) */
  status: Status;
  statusMsg?: string;
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

/** How long an invite as a notice is worth delivering. */
const INVITE_NOTICE_TTL = 15 * 60_000;

const FRIEND_ORDER: Record<ContactState, number> = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };

/**
 * Central app logic: friends (termcore's FriendNet on the shared ~/.termhub) plus the game
 * manager. Exposes a subscribable state to the UI and also runs without a UI (tests).
 * Everything about races lives in game/session.ts.
 */
export class AppStore {
  readonly net: FriendNet<GameWire>;
  readonly hub: Hub;
  readonly games: GameManager;
  readonly results: ResultsBook;
  readonly paths: Paths;
  private readonly toasts: Toasts;
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private started = false;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable: string | null = null;

  constructor(private readonly opts: StoreOptions) {
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.results = new ResultsBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.net = new FriendNet<GameWire>({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port ?? readConfig(opts.paths).port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: opts.discoveryOptions,
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: WIRE,
      hooks: {
        changed: () => this.changed(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: (s, m) => this.games.onWire(s.peerId, m),
        offline: (id) => this.games.onPeerOffline(id),
        session: (s) => this.games.onPeerOnline(s.peerId),
        // invites that came as notices: the real one follows once the host's keyrace connects
        takeNotices: () => {},
        presenceExtra: () => (this.games.racing ? { racing: true } : {}),
        knowsId: (id) => this.results.knows(id),
        rekey: (oldId, newId) => this.results.rekey(oldId, newId),
        settings: (s) => this.applySettings(s),
      },
    });
    this.applySettings(this.hub.settings.get());
    // names in friends' profile colors wherever the UI colors people
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.games = new GameManager({
      me: () => ({ id: this.identity.id, name: this.net.name }),
      send: (id, msg) => this.net.send(id, msg),
      isOnline: (id) => this.net.isOnline(id),
      reachable: (id) => this.net.elsewhere(id).length > 0,
      noticeInvite: (id, gid, text) => {
        this.net.sendNotice(id, { id: `race-${gid}`, kind: 'invite', title: this.net.name, body: text, ttlMs: INVITE_NOTICE_TTL });
      },
      withdrawInvite: (id, gid) => this.net.withdrawNotice(`race-${gid}`, id),
      announce: (from, gid, text) => this.net.noteLocally(from, { id: `race-${gid}`, kind: 'invite', title: this.peerName(from), body: text }),
      isFriend: (id) => this.contacts.get(id)?.state === 'accepted',
      nameOf: (id) => this.peerName(id),
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.net.notify(title, body),
      quiet: () => this.net.dnd,
      save: (rec) => this.saveResult(rec),
      racingChanged: () => this.net.broadcastPresence(),
      tuning: opts.tuning,
    });
  }

  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths: Paths, name: string): string {
    return Hub.createProfile(paths.hub, name).id;
  }

  /** Is there a profile yet (in any app)? */
  static hasProfile(paths: Paths): boolean {
    return Hub.hasProfile(paths.hub);
  }

  // ───────────── Shortcuts ─────────────

  get identity() {
    return this.net.identity;
  }

  get contacts() {
    return this.net.contacts;
  }

  get network() {
    return this.net.network;
  }

  // ───────────── Lifecycle ─────────────

  async start(): Promise<void> {
    await this.net.start();
    this.started = true;
    this.changed();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.games.leave();
    this.games.stop();
    this.toasts.stop();
    await this.net.stop();
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
      // open invites, for termhub's badge (only while keyrace runs)
      if (this.started) this.net.setWaiting(this.games.invites.size, true);
      for (const fn of this.listeners) fn();
    });
  }

  private applySettings(s: Settings): void {
    if (setAccent(s.accent)) this.changed();
  }

  // ───────────── Queries ─────────────

  get me() {
    return this.net.me;
  }

  get toast(): Toast | null {
    return this.toasts.current;
  }

  get settings(): Settings {
    return this.net.settings;
  }

  isOnline(id: string): boolean {
    return this.net.isOnline(id);
  }

  friend(id: string): FriendView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    const online = this.isOnline(id);
    const p = this.net.presenceOf(id);
    return {
      ...c,
      display: displayName(c),
      online,
      away: online && (p?.away ?? false),
      racing: online && p?.extra.racing === true,
      elsewhere: online ? [] : this.net.elsewhere(id),
      status: p?.status ?? 'available',
      ...(p?.msg ? { statusMsg: p.msg } : {}),
    };
  }

  /** Best name for any peer: own nickname/friend name, else what we remember from races. */
  peerName(id: string): string {
    return this.net.peerName(id);
  }

  /** Accepted friends who can be invited: online here or in another app. */
  onlineFriends(): FriendView[] {
    return this.contacts
      .all()
      .filter((c) => c.state === 'accepted' && this.games.canInvite(c.id))
      .map((c) => this.friend(c.id)!)
      .sort((a, b) => a.display.localeCompare(b.display));
  }

  dashboard(): DashboardData {
    const all = this.contacts.all().map((c) => this.friend(c.id)!);
    const presence = (f: FriendView) => (f.state !== 'accepted' ? 5 : f.racing ? 0 : f.online && !f.away ? 1 : f.away ? 2 : f.elsewhere.length ? 3 : 4);
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
    return { requests, friends, nearby: this.net.nearby() };
  }

  /** Number of accepted friends online. */
  onlineCount(): number {
    return this.net.onlineCount();
  }

  stats(): Stats {
    return this.results.stats(this.identity.id);
  }

  leaderboard(): LeaderRow[] {
    const friends = new Map<string, string>();
    for (const c of this.contacts.all()) if (c.state === 'accepted') friends.set(c.id, displayName(c));
    return leaderboard(this.stats(), { id: this.identity.id, name: this.net.name }, friends);
  }

  safetyCodeWith(id: string): string | null {
    return this.net.safetyCodeWith(id);
  }

  // ───────────── UI helpers ─────────────

  showToast(text: string, kind: NoteKind = 'info'): void {
    this.toasts.show(text, kind);
  }

  private log(line: string): void {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }

  private onEvent(e: FriendEvent): void {
    switch (e.kind) {
      case 'accepted':
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, 'success');
      case 'incoming':
        this.showToast(`${e.who} wants to be friends`, 'info');
        return this.net.notify('keyrace', `${e.who} wants to be friends`);
      case 'removedUs':
        return this.showToast(`${e.who} removed you as a friend – your request is waiting to be accepted`, 'error');
      case 'declinedUs':
        return this.showToast(`${e.who} declined your friend request`, 'error');
      case 'withdrawn':
        return this.showToast(`${e.who} withdrew their friend request`);
      case 'requestSent':
        return this.showToast(`Friend request sent to ${e.who} – waiting for them to accept`);
      case 'unreachable':
        return this.showToast(
          `Can't reach ${e.who} at ${e.ip}:${e.port} yet – still trying. A firewall may be blocking keyrace ` +
            '(Windows: allow Node.js for public networks · macOS: allow incoming connections for node).',
          'error',
        );
      case 'notice':
        return this.showToast(noticeLine(e.notice));
      case 'linked':
        return;
    }
  }

  // ───────────── Friends ─────────────

  /** Request to a peer from "Nearby". */
  requestNearby(id: string): void {
    const name = this.net.discovery?.peers.get(id)?.name;
    const r = this.net.requestNearby(id);
    if (r === 'sent') this.showToast(`Friend request sent to ${name ?? 'them'}`);
    else if (r === 'accepted') this.showToast(`You and ${this.peerName(id)} are now friends`, 'success');
  }

  /** Ask again (after a decline). */
  request(id: string): void {
    this.net.request(id);
    this.showToast('Friend request sent again');
  }

  /** Add a friend by IP – for networks that block broadcast. */
  addByAddress(host: string, port = APP.tcpPort): Promise<string> {
    return this.net.addByAddress(host, port);
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (c && this.net.accept(id)) this.showToast(`You and ${displayName(c)} are now friends`, 'success');
  }

  decline(id: string): void {
    const c = this.net.decline(id);
    if (c) this.showToast(`Declined ${displayName(c)}'s request`);
  }

  block(id: string): void {
    const c = this.net.block(id);
    if (c) this.showToast(`${displayName(c)} is blocked. No more connections will be accepted.`, 'error');
  }

  unblock(id: string): void {
    const c = this.net.unblock(id);
    if (c) this.showToast(`Unblocked ${displayName(c)} – friend request sent`, 'success');
  }

  removeFriend(id: string): void {
    const c = this.contacts.get(id);
    // the stats should still be able to name them
    if (c) this.net.peerBook.update(id, { name: displayName(c) });
    this.net.remove(id);
  }

  rename(id: string, alias: string): void {
    this.net.rename(id, alias);
  }

  /** Changes the shared name (all apps). */
  setName(name: string): string {
    return this.net.setName(name);
  }

  // ───────────── Presence and notifications ─────────────

  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused: boolean): void {
    this.net.setFocused(focused);
  }

  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused(): boolean {
    return this.net.isFocused;
  }

  /** Do not disturb (profile status): invites wait quietly, no notifications. */
  get dnd(): boolean {
    return this.net.dnd;
  }

  notificationsEnabled(): boolean {
    return this.net.notificationsEnabled();
  }

  setNotifications(on: boolean): void {
    this.net.setNotifications(on);
  }

  setUpdateAvailable(version: string | null): void {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`keyrace ${version} is available – /update installs it`);
    else this.changed();
  }

  // ───────────── Races ─────────────

  private saveResult(rec: RaceRecord): { newBest: boolean } {
    // remember opponents who aren't friends, so stats can still name them
    for (const p of rec.players) {
      if (p.id !== this.identity.id && !this.contacts.get(p.id)) this.net.peerBook.update(p.id, { name: p.name, lastSeen: rec.ts });
    }
    return this.results.add(rec);
  }
}
