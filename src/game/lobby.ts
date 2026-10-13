import type { RaceSettings } from './types.js';

export type LobbyStatus = 'joined' | 'invited' | 'declined' | 'left';

export interface LobbyPlayer {
  id: string;
  name: string;
  status: LobbyStatus;
  /** declined automatically because they were racing elsewhere */
  busy?: boolean;
}

/**
 * The waiting room, as the host keeps it. Pure data and functions – the session decides
 * which messages go out for each change. The host is always the first player.
 */
export interface Lobby {
  gid: string;
  hostId: string;
  settings: RaceSettings;
  players: LobbyPlayer[];
}

export interface Who {
  id: string;
  name: string;
}

export function createLobby(gid: string, host: Who, settings: RaceSettings, invitees: Who[]): Lobby {
  return invite({ gid, hostId: host.id, settings, players: [{ ...host, status: 'joined' }] }, invitees);
}

const update = (l: Lobby, id: string, patch: Partial<LobbyPlayer>): Lobby => ({
  ...l,
  players: l.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

export const playerOf = (l: Lobby, id: string): LobbyPlayer | undefined => l.players.find((p) => p.id === id);

/**
 * Invites more players. New ones are added; anyone who declined or left gets a fresh invite;
 * players already waiting or joined (and the host) are left alone.
 */
export function invite(l: Lobby, who: Who[]): Lobby {
  let next = l;
  for (const w of who) {
    if (w.id === l.hostId) continue;
    const p = playerOf(next, w.id);
    if (!p) next = { ...next, players: [...next.players, { id: w.id, name: w.name, status: 'invited' }] };
    else if (p.status === 'declined' || p.status === 'left') next = update(next, w.id, { status: 'invited', busy: undefined, name: w.name });
  }
  return next;
}

/** An invited player joins. `ok: false` if they weren't (or no longer are) invited. */
export function join(l: Lobby, id: string): { lobby: Lobby; ok: boolean } {
  const p = playerOf(l, id);
  if (!p || id === l.hostId) return { lobby: l, ok: false };
  if (p.status === 'joined') return { lobby: l, ok: true };
  if (p.status !== 'invited') return { lobby: l, ok: false };
  return { lobby: update(l, id, { status: 'joined' }), ok: true };
}

export function decline(l: Lobby, id: string, busy = false): Lobby {
  const p = playerOf(l, id);
  if (!p || p.status !== 'invited') return l;
  return update(l, id, { status: 'declined', ...(busy ? { busy: true } : {}) });
}

/** Removes a player, joined or still invited. `was` tells the caller which message to send. */
export function kick(l: Lobby, id: string): { lobby: Lobby; was: LobbyStatus | null } {
  const p = playerOf(l, id);
  if (!p || id === l.hostId) return { lobby: l, was: null };
  return { lobby: { ...l, players: l.players.filter((x) => x.id !== id) }, was: p.status };
}

/** A guest left (or went offline). Invited players who go offline count as left as well. */
export function leave(l: Lobby, id: string): Lobby {
  const p = playerOf(l, id);
  if (!p || id === l.hostId || (p.status !== 'joined' && p.status !== 'invited')) return l;
  return update(l, id, { status: 'left' });
}

/** Players who haven't answered yet. */
export const pending = (l: Lobby): LobbyPlayer[] => l.players.filter((p) => p.status === 'invited');

/** Everyone who races if the host starts now (host included). */
export const racers = (l: Lobby): LobbyPlayer[] => l.players.filter((p) => p.status === 'joined');

/** Guests who joined. */
export const joinedGuests = (l: Lobby): LobbyPlayer[] => racers(l).filter((p) => p.id !== l.hostId);

/**
 * Everyone answered and at least one friend joined: the race starts on its own (after a
 * short notice). Declines and leaves don't hold it up.
 */
export function readyToAutoStart(l: Lobby): boolean {
  return pending(l).length === 0 && joinedGuests(l).length > 0;
}

/**
 * Starting: whoever hasn't joined yet is dropped (their invite gets withdrawn), the rest race.
 * Players who declined or left stay out of it.
 */
export function start(l: Lobby): { lobby: Lobby; withdrawn: LobbyPlayer[]; racers: LobbyPlayer[] } {
  const withdrawn = pending(l);
  const lobby = { ...l, players: l.players.filter((p) => p.status !== 'invited') };
  return { lobby, withdrawn, racers: racers(lobby) };
}
