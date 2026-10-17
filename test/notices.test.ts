import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { basePaths } from 'termcore/app/paths';
import { defineApp } from 'termcore/app/suite';
import { FriendNet, type FriendEvent } from 'termcore/friends/net';
import { Hub } from 'termcore/store/hub';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';

const TUNING = { countdownMs: 150, autoStartMs: 300, tickMs: 40, graceMs: 600, joinTimeoutMs: 3000, maxWpm: 1e9 };
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((s) => s()));
});

async function until(cond: () => boolean, ms = 8000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

function profile(name: string): Paths {
  const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `keyrace-notices-${name}-`)));
  AppStore.createProfile(paths, name);
  return paths;
}

async function keyrace(paths: Paths): Promise<AppStore & { halt(): Promise<void> }> {
  const s = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100, tuning: TUNING }) as AppStore & { halt(): Promise<void> };
  await s.start();
  let stopped = false;
  s.halt = async () => {
    if (stopped) return;
    stopped = true;
    await s.stop();
  };
  stops.push(() => s.halt());
  return s;
}

/** termhub (only termcore's part of it), running next to keyrace. */
async function termhub(paths: Paths) {
  const p = basePaths('termhub', paths.hub.dir, {});
  const hub = new Hub(p.hub);
  const events: FriendEvent[] = [];
  const net = new FriendNet<never, object>({
    app: defineApp('termhub', { version: '1.1.0', repository: { url: 'https://github.com/trigonyx/termhub' } }),
    paths: p,
    hub,
    port: 0,
    discovery: false,
    dialIntervalMs: 100,
    notify: () => {},
    wire: { parse: () => null },
    hooks: { changed: () => {}, message: () => {}, event: (e) => events.push(e) },
  });
  await net.start();
  stops.push(() => net.stop());
  return { net, hub, events };
}

describe('invites for friends without keyrace open', { timeout: 40_000 }, () => {
  it('go to their termhub as a notice; once their keyrace opens, the real invite follows', async () => {
    const alicePaths = profile('Alice');
    const bobPaths = profile('Bob');
    const alice = await keyrace(alicePaths);
    let bob = await keyrace(bobPaths);
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => bob.friend(alice.identity.id)?.state === 'incoming', 6000, 'request');
    bob.accept(alice.identity.id);
    await until(() => alice.friend(bob.identity.id)?.state === 'accepted' && alice.isOnline(bob.identity.id), 6000, 'friends');
    const bobId = bob.identity.id;
    await bob.halt();

    // both have termhub open, and the termhubs are connected
    const aliceHub = await termhub(alicePaths);
    const bobHub = await termhub(bobPaths);
    aliceHub.net.contacts.setPorts(bobId, { termhub: bobHub.net.network.port });
    await until(() => aliceHub.net.isOnline(bobId), 8000, 'termhubs connected');
    await until(() => alice.friend(bobId)?.elsewhere.includes('termhub') ?? false, 6000, 'Bob seen in termhub');
    expect(alice.onlineFriends().map((f) => f.id)).toEqual([bobId]);

    alice.games.create({ mode: 'sprint', param: 30 }, [bobId]);
    expect(alice.games.game?.players.find((p) => p.id === bobId)?.status).toBe('invited');
    await until(() => bobHub.hub.inbox.get().notices.some((n) => n.app === 'keyrace' && n.kind === 'invite'), 8000, 'notice');
    expect(bobHub.hub.inbox.get().notices[0]).toMatchObject({ title: 'Alice', body: 'invites you to a 30s sprint' });
    await until(() => bobHub.events.some((e) => e.kind === 'notice'), 6000, 'shown in termhub');

    // Bob opens keyrace: it connects to Alice's, and the invite arrives for real
    bob = await keyrace(bobPaths);
    await until(() => bob.games.pendingInvites().length === 1, 8000, 'invite');
    await until(() => bobHub.hub.inbox.get().notices.length === 0, 6000, 'notice gone');
    await until(() => bobHub.hub.inbox.get().waiting.keyrace?.n === 1, 6000, 'counted');
    expect(alice.hub.outbox.get().notices.filter((n) => !n.withdrawn)).toEqual([]);

    // Bob joins: the lobby goes on as always
    bob.games.accept(bob.games.pendingInvites()[0]!.gid);
    await until(() => alice.games.game?.players.find((p) => p.id === bobId)?.status === 'joined' || alice.games.game?.phase === 'race', 8000, 'joined');
    await until(() => !bobHub.hub.inbox.get().waiting.keyrace, 6000, 'count cleared');
  });

  it('an invite that is over is taken back', async () => {
    const alicePaths = profile('Alice');
    const bobPaths = profile('Bob');
    const alice = await keyrace(alicePaths);
    const bob = await keyrace(bobPaths);
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => bob.friend(alice.identity.id)?.state === 'incoming', 6000, 'request');
    bob.accept(alice.identity.id);
    await until(() => alice.isOnline(bob.identity.id), 6000, 'friends');
    const bobId = bob.identity.id;
    await bob.halt();
    const aliceHub = await termhub(alicePaths);
    const bobHub = await termhub(bobPaths);
    aliceHub.net.contacts.setPorts(bobId, { termhub: bobHub.net.network.port });
    await until(() => alice.friend(bobId)?.elsewhere.length === 1, 8000, 'Bob seen in termhub');

    alice.games.create({ mode: 'sprint', param: 30 }, [bobId]);
    await until(() => bobHub.hub.inbox.get().notices.length === 1, 8000, 'notice');
    alice.games.leave();
    await until(() => bobHub.hub.inbox.get().notices.length === 0, 8000, 'withdrawn');
    await until(() => alice.hub.outbox.get().notices.length === 0, 8000, 'outbox empty');
  });
});
