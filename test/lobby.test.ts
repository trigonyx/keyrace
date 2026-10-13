import { describe, expect, it } from 'vitest';
import * as L from '../src/game/lobby.js';

const host = { id: 'HOST', name: 'Host' };
const bob = { id: 'BOB', name: 'Bob' };
const carl = { id: 'CARL', name: 'Carl' };
const dana = { id: 'DANA', name: 'Dana' };
const settings = { mode: 'sprint' as const, param: 60 };
const statuses = (l: L.Lobby) => l.players.map((p) => `${p.id}:${p.status}`).join(' ');

describe('lobby', () => {
  it('starts with the host joined and everyone else invited', () => {
    const l = L.createLobby('gid', host, settings, [bob, carl, host]);
    expect(statuses(l)).toBe('HOST:joined BOB:invited CARL:invited');
    expect(L.readyToAutoStart(l)).toBe(false);
  });

  it('join and decline; only invited players can join', () => {
    let l = L.createLobby('gid', host, settings, [bob, carl]);
    ({ lobby: l } = L.join(l, 'BOB'));
    l = L.decline(l, 'CARL', true);
    expect(statuses(l)).toBe('HOST:joined BOB:joined CARL:declined');
    expect(l.players[2]?.busy).toBe(true);
    expect(L.join(l, 'CARL').ok).toBe(false);
    expect(L.join(l, 'DANA').ok).toBe(false);
    expect(L.join(l, 'HOST').ok).toBe(false);
    // joining twice is harmless
    expect(L.join(l, 'BOB')).toMatchObject({ ok: true, lobby: l });
  });

  it('kicks joined and invited players, never the host', () => {
    let l = L.createLobby('gid', host, settings, [bob, carl]);
    ({ lobby: l } = L.join(l, 'BOB'));
    let r = L.kick(l, 'BOB');
    expect(r.was).toBe('joined');
    r = L.kick(r.lobby, 'CARL');
    expect(r.was).toBe('invited');
    expect(statuses(r.lobby)).toBe('HOST:joined');
    expect(L.kick(r.lobby, 'HOST').was).toBeNull();
    expect(L.kick(r.lobby, 'NOBODY').was).toBeNull();
  });

  it('invites more later and re-invites those who declined or left', () => {
    let l = L.createLobby('gid', host, settings, [bob]);
    l = L.decline(l, 'BOB');
    l = L.invite(l, [bob, carl, host]);
    expect(statuses(l)).toBe('HOST:joined BOB:invited CARL:invited');
    ({ lobby: l } = L.join(l, 'CARL'));
    l = L.leave(l, 'CARL');
    expect(statuses(l)).toBe('HOST:joined BOB:invited CARL:left');
    l = L.invite(l, [carl]);
    expect(L.playerOf(l, 'CARL')?.status).toBe('invited');
    // already invited or joined: unchanged
    expect(L.invite(l, [bob])).toEqual(l);
  });

  it('starts automatically once everyone answered and someone joined', () => {
    let l = L.createLobby('gid', host, settings, [bob, carl, dana]);
    ({ lobby: l } = L.join(l, 'BOB'));
    expect(L.readyToAutoStart(l)).toBe(false);
    l = L.decline(l, 'CARL');
    expect(L.readyToAutoStart(l)).toBe(false);
    ({ lobby: l } = L.join(l, 'DANA'));
    expect(L.readyToAutoStart(l)).toBe(true);
    // inviting someone new holds it up again
    expect(L.readyToAutoStart(L.invite(l, [{ id: 'EVE', name: 'Eve' }]))).toBe(false);
    // nobody joined (all declined): no automatic start
    let m = L.createLobby('g2', host, settings, [bob]);
    m = L.decline(m, 'BOB');
    expect(L.readyToAutoStart(m)).toBe(false);
  });

  it('starting drops those who have not joined yet', () => {
    let l = L.createLobby('gid', host, settings, [bob, carl, dana]);
    ({ lobby: l } = L.join(l, 'BOB'));
    l = L.decline(l, 'DANA');
    const { lobby, withdrawn, racers } = L.start(l);
    expect(withdrawn.map((p) => p.id)).toEqual(['CARL']);
    expect(racers.map((p) => p.id)).toEqual(['HOST', 'BOB']);
    expect(statuses(lobby)).toBe('HOST:joined BOB:joined DANA:declined');
  });

  it('a guest leaves; the host cannot leave its own lobby this way', () => {
    let l = L.createLobby('gid', host, settings, [bob]);
    ({ lobby: l } = L.join(l, 'BOB'));
    l = L.leave(l, 'BOB');
    expect(L.playerOf(l, 'BOB')?.status).toBe('left');
    expect(L.leave(l, 'HOST')).toBe(l);
    expect(L.joinedGuests(l)).toHaveLength(0);
  });
});
