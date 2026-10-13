import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';
import { readJsonl } from '../src/core/storage.js';
import type { RaceRecord } from '../src/game/stats.js';
import type { RaceSettings } from '../src/game/types.js';

const stores: AppStore[] = [];
// short countdowns, and the tests type a whole race at once – far beyond any human WPM
const TUNING = { countdownMs: 150, autoStartMs: 300, tickMs: 40, graceMs: 600, joinTimeoutMs: 3000, maxWpm: 1e9 };

function profile(name: string): Paths {
  const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `keyrace-${name}-`)));
  AppStore.createProfile(paths, name);
  return paths;
}

async function boot(name: string, opts: { notify?: (t: string, b: string) => void; maxWpm?: number } = {}): Promise<AppStore> {
  const tuning = { ...TUNING, ...(opts.maxWpm ? { maxWpm: opts.maxWpm } : {}) };
  const s = new AppStore({ paths: profile(name), port: 0, discovery: false, dialIntervalMs: 100, tuning, notify: opts.notify });
  await s.start();
  stores.push(s);
  return s;
}

async function stop(s: AppStore): Promise<void> {
  stores.splice(stores.indexOf(s), 1);
  await s.stop();
}

async function until(cond: () => boolean, ms = 6000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Makes a and b friends: a asks by IP, b accepts. */
async function befriend(a: AppStore, b: AppStore): Promise<void> {
  await a.addByAddress('127.0.0.1', b.network.port);
  await until(() => b.friend(a.identity.id)?.state === 'incoming', 6000, 'friend request');
  expect(b.dashboard().requests.some((r) => r.kind === 'friend' && r.friend.id === a.identity.id)).toBe(true);
  b.accept(a.identity.id);
  await until(() => a.friend(b.identity.id)?.state === 'accepted' && b.friend(a.identity.id)?.state === 'accepted', 6000, 'friendship');
}

const invited = (s: AppStore) => s.games.pendingInvites();
const phase = (s: AppStore) => s.games.game?.phase ?? null;

/** Types `n` words of the store's own text; the first `wrong` of them with a typo. */
function typeWords(s: AppStore, n: number, wrong = 0): void {
  const e = s.games.game!.engine!;
  for (let i = 0; i < n; i++) {
    const w = e.words[e.index]!;
    s.games.input(i < wrong ? `${w}q ` : `${w} `);
  }
}

async function racing(...all: AppStore[]): Promise<void> {
  await until(() => all.every((s) => s.games.game?.engine?.status === 'racing'), 6000, 'GO');
}

const records = (s: AppStore) => readJsonl<RaceRecord>(s.paths.results);

afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

describe('a race between three friends', { timeout: 40_000 }, () => {
  it('invite → join → kick → auto start → typing → the same results everywhere', async () => {
    const notes: string[] = [];
    const host = await boot('Alice');
    const bob = await boot('Bob', { notify: (_t, b) => notes.push(b) });
    const carl = await boot('Carl');
    const dana = await boot('Dana');
    for (const s of [bob, carl, dana]) await befriend(s, host);
    // Bob and Carl are not friends with each other – everything goes through the host

    bob.setFocused(false);
    const settings: RaceSettings = { mode: 'race', param: 25 };
    host.games.create(settings, [bob.identity.id, carl.identity.id, dana.identity.id]);
    expect(phase(host)).toBe('lobby');
    await until(() => [bob, carl, dana].every((s) => invited(s).length === 1), 6000, 'invites');
    expect(bob.dashboard().requests[0]).toMatchObject({ kind: 'invite', invite: { hostName: 'Alice', settings } });
    // desktop notification while the terminal is in the background
    expect(notes).toEqual(['Alice invites you to a 25-word race']);

    // Dana joins, then gets kicked; nothing starts while Bob and Carl haven't answered
    dana.games.accept(invited(dana)[0]!.gid);
    await until(() => phase(dana) === 'lobby', 6000, 'dana in lobby');
    expect(dana.games.game!.players.find((p) => p.id === dana.identity.id)?.status).toBe('joined');
    host.games.kick(dana.identity.id);
    await until(() => dana.games.game === null, 6000, 'dana kicked');
    expect(host.games.game!.players.some((p) => p.id === dana.identity.id)).toBe(false);

    // lobby chat goes through the host to everyone
    bob.games.accept(invited(bob)[0]!.gid);
    await until(() => phase(bob) === 'lobby');
    bob.games.sendChat('hi \u001b[2Jall');
    await until(() => host.games.game!.chat.length === 1 && bob.games.game!.chat.length === 1, 6000, 'chat');
    expect(host.games.game!.chat[0]).toMatchObject({ from: bob.identity.id, name: 'Bob', text: 'hi all' });
    expect(host.games.game!.autoStartAt).toBeNull();

    // Carl joins → everyone is here → automatic start
    carl.games.accept(invited(carl)[0]!.gid);
    await until(() => [host, bob, carl].every((s) => phase(s) === 'race'), 6000, 'auto start');
    expect(carl.games.game!.racers.map((r) => r.name).sort()).toEqual(['Alice', 'Bob', 'Carl']);
    // same text for everyone
    expect(bob.games.game!.engine!.words).toEqual(host.games.game!.engine!.words);
    expect(carl.games.game!.engine!.words).toEqual(host.games.game!.engine!.words);
    await until(() => host.friend(bob.identity.id)?.racing === true, 6000, 'racing presence');

    await racing(host, bob, carl);
    // Carl finishes first, then Alice (with two typos), then Bob
    typeWords(carl, 25);
    await sleep(60);
    typeWords(host, 27, 2);
    await sleep(60);
    typeWords(bob, 10);
    await until(() => host.games.game!.racers.find((r) => r.id === bob.identity.id)?.progress?.words === 10, 6000, 'bob progress');
    // standings reach the other guests too
    await until(() => (carl.games.game!.racers.find((r) => r.id === bob.identity.id)?.progress?.words ?? 0) >= 10, 6000, 'standings');
    typeWords(bob, 15);

    await until(() => [host, bob, carl].every((s) => phase(s) === 'results'), 8000, 'results');
    const order = (s: AppStore) => s.games.game!.results!.map((r) => `${r.place}:${r.name}`);
    expect(order(host)).toEqual(['1:Carl', '2:Alice', '3:Bob']);
    expect(order(bob)).toEqual(order(host));
    expect(order(carl)).toEqual(order(host));
    const alice = host.games.game!.results!.find((r) => r.name === 'Alice')!;
    expect(alice).toMatchObject({ completed: true, words: 25, errors: 2 });
    expect(alice.acc).toBeLessThan(1);

    // everyone saved the same race
    const saved = [host, bob, carl].map((s) => records(s));
    expect(saved.map((r) => r.length)).toEqual([1, 1, 1]);
    expect(new Set(saved.map((r) => r[0]!.gid)).size).toBe(1);
    expect(saved[1]![0]!.players).toEqual(saved[0]![0]!.players);
    expect(records(dana)).toHaveLength(0);

    // stats: wins, head-to-head
    expect(carl.stats()).toMatchObject({ races: 1, wins: 1 });
    expect(host.stats()).toMatchObject({ races: 1, wins: 0 });
    const vsBob = host.stats().h2h.get(bob.identity.id)!;
    const vsCarl = host.stats().h2h.get(carl.identity.id)!;
    expect([vsBob.wins, vsBob.losses, vsCarl.wins, vsCarl.losses]).toEqual([1, 0, 0, 1]);
    // Bob and Carl aren't friends, but each knows the other from the race
    expect(bob.stats().h2h.get(carl.identity.id)).toMatchObject({ name: 'Carl', wins: 0, losses: 1 });
    await until(() => host.friend(bob.identity.id)?.racing === false, 6000, 'presence back');

    // rematch: same settings, everyone invited again
    host.games.rematch();
    await until(() => bob.games.game?.rematch !== null && !!carl.games.game?.rematch, 6000, 'rematch invites');
    expect(host.games.game).toMatchObject({ phase: 'lobby', settings });
    bob.games.accept(bob.games.game!.rematch!.gid);
    carl.games.decline(carl.games.game!.rematch!.gid);
    await until(() => phase(bob) === 'lobby' && host.games.game!.players.find((p) => p.name === 'Carl')?.status === 'declined');
    // all answered, Bob joined → it starts by itself
    await until(() => phase(host) === 'race' && phase(bob) === 'race', 6000, 'rematch start');
  });

  it('starting with pending players withdraws their invites; invites from strangers are ignored', async () => {
    const host = await boot('Alice');
    const bob = await boot('Bob');
    const carl = await boot('Carl');
    const eve = await boot('Eve');
    await befriend(bob, host);
    await befriend(carl, host);

    // Eve isn't Bob's friend: her invite never shows up
    await eve.addByAddress('127.0.0.1', bob.network.port);
    await until(() => eve.isOnline(bob.identity.id));
    eve.network.get(bob.identity.id)!.send({ t: 'invite', gid: 'eveeveeveeve', mode: 'sprint', param: 60, players: [{ id: bob.identity.id, name: 'Bob', status: 'invited' }] });
    await sleep(200);
    expect(invited(bob)).toHaveLength(0);

    host.games.create({ mode: 'sprint', param: 30 }, [bob.identity.id, carl.identity.id]);
    await until(() => invited(bob).length === 1 && invited(carl).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    await until(() => phase(bob) === 'lobby');
    expect(host.games.pendingPlayers().map((p) => p.name)).toEqual(['Carl']);
    host.games.startRace();
    await until(() => phase(bob) === 'race' && invited(carl).length === 0, 6000, 'withdrawn');
    expect(host.games.game!.racers.map((r) => r.name)).toEqual(['Alice', 'Bob']);

    // Carl gets invited elsewhere while... no: Bob is racing, so a new invite to Bob is declined as busy
    await befriend(bob, carl);
    carl.games.create({ mode: 'sudden', param: 0 }, [bob.identity.id]);
    await until(() => carl.games.game?.players.find((p) => p.id === bob.identity.id)?.status === 'declined', 6000, 'busy');
    expect(carl.games.game!.players.find((p) => p.id === bob.identity.id)?.busy).toBe(true);
    expect(invited(bob)).toHaveLength(0);
  });

  it('lobby: a guest leaves, the host closes it', async () => {
    const host = await boot('Alice');
    const bob = await boot('Bob');
    const carl = await boot('Carl');
    await befriend(bob, host);
    await befriend(carl, host);
    host.games.create({ mode: 'sprint', param: 60 }, [bob.identity.id, carl.identity.id]);
    await until(() => invited(bob).length === 1 && invited(carl).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    await until(() => phase(bob) === 'lobby');
    bob.games.leave();
    await until(() => host.games.game!.players.find((p) => p.name === 'Bob')?.status === 'left', 6000, 'left');
    expect(phase(bob)).toBeNull();

    host.games.leave();
    await until(() => invited(carl).length === 0, 6000, 'invite gone');
    expect(phase(host)).toBeNull();
  });
});

describe('the host checks progress', { timeout: 20_000 }, () => {
  it('ignores progress that runs backwards or is faster than humanly possible', async () => {
    const host = await boot('Alice', { maxWpm: 350 });
    const bob = await boot('Bob');
    await befriend(bob, host);
    host.games.create({ mode: 'sprint', param: 30 }, [bob.identity.id]);
    await until(() => invited(bob).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    await racing(host, bob);
    const gid = host.games.game!.gid;
    const send = (p: object) =>
      bob.network.get(host.identity.id)!.send({ t: 'progress', gid, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: 'racing', ...p } as never);
    const seen = () => host.games.game!.racers.find((r) => r.name === 'Bob')?.progress;
    await sleep(300);
    send({ chars: 12, words: 2, keys: 12, correctKeys: 12, ms: 2000 });
    await until(() => seen()?.chars === 12, 3000, 'plausible progress');
    // 400 characters in 2 seconds: ~2400 wpm
    send({ chars: 400, words: 70, keys: 400, correctKeys: 400, ms: 2100 });
    // backwards
    send({ chars: 6, words: 1, keys: 12, correctKeys: 12, ms: 2200 });
    await sleep(300);
    expect(seen()).toMatchObject({ chars: 12, words: 2, status: 'racing' });
    // an implausible final report still ends the run, with the last believable numbers
    send({ chars: 500, words: 90, keys: 500, correctKeys: 500, ms: 2400, status: 'finished' });
    await until(() => seen()?.status === 'finished', 3000, 'final report');
    expect(seen()).toMatchObject({ chars: 12, words: 2 });
    typeWords(host, 3);
    host.games.game!.engine!.endedAt = 5000;
    host.games.game!.engine!.status = 'finished';
    await until(() => phase(host) === 'results' && phase(bob) === 'results', 3000, 'results');
    expect(host.games.game!.results!.find((r) => r.name === 'Bob')).toMatchObject({ words: 2 });
  });
});

describe('connections dropping mid-race', { timeout: 30_000 }, () => {
  it('a guest who drops is ranked as left; the others finish', async () => {
    const host = await boot('Alice');
    const bob = await boot('Bob');
    const carl = await boot('Carl');
    await befriend(bob, host);
    await befriend(carl, host);
    host.games.create({ mode: 'race', param: 25 }, [bob.identity.id, carl.identity.id]);
    await until(() => invited(bob).length === 1 && invited(carl).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    carl.games.accept(invited(carl)[0]!.gid);
    await racing(host, bob, carl);

    typeWords(carl, 5);
    await until(() => (host.games.game!.racers.find((r) => r.name === 'Carl')?.progress?.words ?? 0) === 5);
    await stop(carl); // gone without a word
    await until(() => host.games.game!.racers.find((r) => r.name === 'Carl')?.left === true, 6000, 'carl left');

    typeWords(host, 25);
    typeWords(bob, 25);
    await until(() => phase(host) === 'results' && phase(bob) === 'results', 6000, 'results');
    const res = host.games.game!.results!;
    expect(res.map((r) => `${r.place}:${r.name}:${r.status}`)).toEqual(['1:Alice:finished', '2:Bob:finished', '3:Carl:left']);
    expect(bob.games.game!.results).toEqual(res);
  });

  it('the host dropping calls the race off for everyone, without results', async () => {
    const host = await boot('Alice');
    const bob = await boot('Bob');
    await befriend(bob, host);
    host.games.create({ mode: 'sprint', param: 30 }, [bob.identity.id]);
    await until(() => invited(bob).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    await racing(host, bob);
    typeWords(bob, 3);
    await stop(host);
    await until(() => phase(bob) === 'closed', 8000, 'called off');
    expect(bob.games.game!.closedReason).toMatch(/Alice left/);
    expect(records(bob)).toHaveLength(0);
    expect(bob.friend(host.identity.id)?.racing).toBe(false);
    bob.games.dismiss();
    expect(phase(bob)).toBeNull();
  });

  it('the host giving up tells the guests right away', async () => {
    const host = await boot('Alice');
    const bob = await boot('Bob');
    await befriend(bob, host);
    host.games.create({ mode: 'sudden', param: 0 }, [bob.identity.id]);
    await until(() => invited(bob).length === 1);
    bob.games.accept(invited(bob)[0]!.gid);
    await racing(host, bob);
    host.games.leave();
    await until(() => phase(bob) === 'closed', 3000, 'called off');
    expect(host.isOnline(bob.identity.id)).toBe(true);
  });
});
