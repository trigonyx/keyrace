import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonl } from 'termcore/app/storage';
import { parseFriendsFile } from 'termcore/store/files';
import { Hub } from 'termcore/store/hub';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';
import { ResultsBook } from '../src/game/results.js';
import type { RaceRecord } from '../src/game/stats.js';

/** Real data of termchat 1.4.0 and keyrace 1.1.0 (see termcore/test/fixtures/legacy). */
const FIXTURES = path.resolve(import.meta.dirname, '../../termcore/test/fixtures/legacy');
const OLD = {
  alice: { termchat: 'NKISSPLQRD3ILGYERG7P', keyrace: '23LZSIQIJQCQOALWWWKL' },
  bob: { termchat: 'DFUXKKL7GTQ4QMMLE3NA', keyrace: 'VMFNJZELIEDA4YVKTXSK' },
  carl: { keyrace: 'TOJVCLXTZEXMJGKEOOAS' },
};
const TUNING = { countdownMs: 150, autoStartMs: 300, tickMs: 40, graceMs: 600, joinTimeoutMs: 3000, maxWpm: 1e9 };

const stores: AppStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

async function until(cond: () => boolean, ms = 6000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

function home(who: 'alice' | 'bob', apps: string[]): string {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', `keyrace-suite-${who}-`));
  for (const app of apps) fs.cpSync(path.join(FIXTURES, who, app), path.join(dir, app), { recursive: true });
  return dir;
}

/** Starts keyrace 2.0 on a home with old data, like the app does (migration first). */
async function start(dir: string): Promise<AppStore> {
  const paths = resolvePaths(dir, {});
  Hub.prepare(paths.hub);
  const s = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100, tuning: TUNING });
  await s.start();
  stores.push(s);
  return s;
}

describe('from termchat 1.4 + keyrace 1.1 to one id', { timeout: 40_000 }, () => {
  it('friends everywhere under one id, head-to-head kept', async () => {
    const ha = home('alice', ['termchat', 'keyrace']);
    const hb = home('bob', ['termchat', 'keyrace']);
    // what keyrace 1.1 showed Alice: 3 races against Bob, 1 won, 2 lost
    const before = new ResultsBook(resolvePaths(ha, {})).stats(OLD.alice.keyrace).h2h.get(OLD.bob.keyrace)!;
    expect(before).toMatchObject({ races: 3, wins: 1, losses: 2 });

    const alice = await start(ha);
    const bob = await start(hb);
    // the shared id is termchat's; keyrace's own data already moved to it
    expect(alice.identity.id).toBe(OLD.alice.termchat);
    expect(alice.stats()).toMatchObject({ races: 3, wins: 1 });
    const own = readJsonl<RaceRecord>(alice.paths.results);
    expect(own.every((r) => r.me === OLD.alice.termchat)).toBe(true);

    // first connection: Bob's keyrace id turns into his shared id
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => !alice.contacts.get(OLD.bob.keyrace) && !bob.contacts.get(OLD.alice.keyrace), 6000, 'links');
    await until(() => alice.friend(OLD.bob.termchat)?.online === true && bob.friend(OLD.alice.termchat)?.online === true, 6000, 'online');

    // one friend each, the same entry termchat reads
    for (const [s, other] of [
      [alice, OLD.bob],
      [bob, OLD.alice],
    ] as const) {
      const shared = parseFriendsFile(JSON.parse(fs.readFileSync(s.paths.hub.friends, 'utf8'))).friends;
      const entries = shared.filter((f) => f.id === other.termchat || f.id === other.keyrace);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ id: other.termchat, state: 'accepted' });
      expect(Object.keys(entries[0]!.ports ?? {}).sort()).toEqual(['keyrace', 'termchat']);
    }
    expect(alice.friend(OLD.bob.termchat)?.alias).toBe('Bobby');

    // head-to-head: the same record, now under Bob's new id – for both of them
    expect(alice.stats().h2h.get(OLD.bob.termchat)).toMatchObject({ races: 3, wins: 1, losses: 2 });
    expect(alice.stats().h2h.has(OLD.bob.keyrace)).toBe(false);
    expect(bob.stats().h2h.get(OLD.alice.termchat)).toMatchObject({ races: 3, wins: 2, losses: 1 });
    expect(alice.leaderboard().some((r) => r.id === OLD.bob.termchat)).toBe(true);
    // Carl never migrated: still blocked under his old id
    expect(alice.contacts.get(OLD.carl.keyrace)?.state).toBe('blocked');

    // and the next race counts on top
    alice.games.create({ mode: 'race', param: 25 }, [bob.identity.id]);
    await until(() => bob.games.pendingInvites().length === 1, 6000, 'invite');
    bob.games.accept(bob.games.pendingInvites()[0]!.gid);
    await until(() => alice.games.game?.engine?.status === 'racing' && bob.games.game?.engine?.status === 'racing', 6000, 'GO');
    for (const s of [alice, bob]) {
      const e = s.games.game!.engine!;
      for (let i = 0; i < 25; i++) s.games.input(`${e.words[e.index]!} `);
      await new Promise((r) => setTimeout(r, 60));
    }
    await until(() => alice.games.game?.phase === 'results' && bob.games.game?.phase === 'results', 8000, 'results');
    expect(alice.stats().h2h.get(OLD.bob.termchat)).toMatchObject({ races: 4, wins: 2, losses: 2 });
  });

  it('do not disturb: an invite waits under Requests without a toast or notification', async () => {
    const notes: string[] = [];
    const ha = home('alice', ['keyrace']);
    const hb = home('bob', ['keyrace']);
    const paths = resolvePaths(hb, {});
    Hub.prepare(paths.hub);
    const bob = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100, tuning: TUNING, notify: (_t, b) => notes.push(b) });
    await bob.start();
    stores.push(bob);
    const alice = await start(ha);
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => alice.friend(bob.identity.id)?.online === true && bob.friend(alice.identity.id)?.online === true, 6000, 'online');
    bob.hub.setProfile({ status: 'dnd', statusMsg: 'exam week' });
    await until(() => alice.friend(bob.identity.id)?.status === 'dnd', 4000, 'status');
    expect(alice.friend(bob.identity.id)?.statusMsg).toBe('exam week');
    bob.setFocused(false);
    const toastBefore = bob.toast?.text;
    alice.games.create({ mode: 'sprint', param: 30 }, [bob.identity.id]);
    await until(() => bob.games.pendingInvites().length === 1, 6000, 'invite');
    expect(bob.dashboard().requests[0]).toMatchObject({ kind: 'invite' });
    expect(bob.toast?.text).toBe(toastBefore);
    expect(notes).toEqual([]);
  });
});
