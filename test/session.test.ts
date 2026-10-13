import { afterEach, describe, expect, it } from 'vitest';
import type { Wire } from '../src/core/protocol.js';
import { GameManager, type GameDeps } from '../src/game/session.js';

const ME = 'MEMEMEMEMEMEMEMEMEME';
const id = (i: number) => `P${String(i).padStart(19, 'A')}`.replace(/[0-9]/g, (d) => 'ABCDEFGHIJ'[Number(d)]!);

const managers: GameManager[] = [];
function setup(over: Partial<GameDeps> = {}) {
  const sent: { to: string; msg: Wire }[] = [];
  const toasts: string[] = [];
  let racing = false;
  const m = new GameManager({
    me: () => ({ id: ME, name: 'Me' }),
    send: (to, msg) => (sent.push({ to, msg }), true),
    isOnline: () => true,
    isFriend: () => true,
    nameOf: (x) => `n-${x.slice(0, 3)}`,
    changed: () => {},
    toast: (t) => toasts.push(t),
    notify: () => {},
    save: () => ({ newBest: false }),
    racingChanged: (r) => void (racing = r),
    tuning: { countdownMs: 10_000, joinTimeoutMs: 50 },
    ...over,
  });
  managers.push(m);
  return { m, sent, toasts, isRacing: () => racing };
}

afterEach(() => {
  for (const m of managers.splice(0)) m.stop();
});

describe('game manager', () => {
  it('no friends picked → solo run, straight to the countdown', () => {
    const { m, sent, isRacing } = setup();
    m.create({ mode: 'sprint', param: 30 }, []);
    expect(m.game).toMatchObject({ role: 'solo', phase: 'race' });
    expect(m.game!.engine!.status).toBe('countdown');
    expect(sent).toHaveLength(0);
    expect(isRacing()).toBe(true);
    m.leave();
    expect(isRacing()).toBe(false);
  });

  it('a lobby holds at most 16 players', () => {
    const { m, sent, toasts } = setup();
    const ids = Array.from({ length: 20 }, (_, i) => id(i));
    m.create({ mode: 'race', param: 25 }, ids);
    expect(m.game!.players).toHaveLength(16);
    expect(sent.filter((s) => s.msg.t === 'invite')).toHaveLength(15);
    expect(toasts.some((t) => t.includes('room for 16'))).toBe(true);
    m.inviteMore([id(18)]);
    expect(m.game!.players).toHaveLength(16);
  });

  it('only invites friends who are online', () => {
    const { m } = setup({ isFriend: (x) => x !== id(1), isOnline: (x) => x !== id(2) });
    m.create({ mode: 'sprint', param: 60 }, [id(1), id(2), id(3)]);
    expect(m.game!.players.map((p) => p.id)).toEqual([ME, id(3)]);
  });

  it('gives up joining when the host never answers', async () => {
    const { m } = setup();
    const host = id(5);
    m.onWire(host, { t: 'invite', gid: 'gidgidgidgid', mode: 'sprint', param: 60, players: [{ id: ME, name: 'Me', status: 'invited' }] });
    expect(m.pendingInvites()).toHaveLength(1);
    m.accept('gidgidgidgid');
    expect(m.game?.phase).toBe('joining');
    await new Promise((r) => setTimeout(r, 120));
    expect(m.game).toMatchObject({ phase: 'closed' });
    expect(m.game!.closedReason).toMatch(/didn't answer/);
  });

  it('ignores invites that do not list us, and lets a newer invite from the same host replace the old one', () => {
    const { m } = setup();
    const host = id(5);
    m.onWire(host, { t: 'invite', gid: 'gidgidgidgid', mode: 'sprint', param: 60, players: [{ id: id(6), name: 'x', status: 'invited' }] });
    expect(m.pendingInvites()).toHaveLength(0);
    const me = [{ id: ME, name: 'Me', status: 'invited' as const }];
    m.onWire(host, { t: 'invite', gid: 'firstfirst01', mode: 'sprint', param: 60, players: me });
    m.onWire(host, { t: 'invite', gid: 'secondsecond', mode: 'race', param: 50, players: me });
    expect(m.pendingInvites().map((i) => i.gid)).toEqual(['secondsecond']);
    m.onWire(host, { t: 'invite_cancel', gid: 'secondsecond' });
    expect(m.pendingInvites()).toHaveLength(0);
  });
});
