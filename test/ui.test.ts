import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAddress, registry } from '../src/commands/builtin.js';
import { parseCommand, tokenize } from '../src/commands/parse.js';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';
import { VERSION } from '../src/core/version.js';
import { TypingEngine } from '../src/game/engine.js';
import { rank } from '../src/game/scoring.js';
import type { Game } from '../src/game/session.js';
import type { RaceSettings } from '../src/game/types.js';
import type { Actions } from '../src/ui/actions.js';
import { bigLines } from '../src/ui/components/BigText.js';
import { LOGO, LOGO_SMALL } from '../src/ui/components/Banner.js';
import { Header } from '../src/ui/components/Header.js';
import { layoutWords, visibleLines } from '../src/ui/components/TypingText.js';
import { cleanPaste, edit, layoutEditor } from '../src/ui/editor.js';
import { Dashboard } from '../src/ui/screens/Dashboard.js';
import { Lobby } from '../src/ui/screens/Lobby.js';
import { Race } from '../src/ui/screens/Race.js';
import { Results } from '../src/ui/screens/Results.js';
import { renderText } from '../src/ui/text.js';

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const frame = (r: { lastFrame(): string | undefined }) => strip(r.lastFrame() ?? '');

const noop = async () => {};
const actions: Actions = {
  quit: () => {},
  confirm: async () => false,
  prompt: async () => null,
  pick: async () => null,
  chooseMode: async () => null,
  newRace: noop,
  soloRace: noop,
  runCommand: noop,
  print: () => {},
};

const stores: AppStore[] = [];
function store(name = 'Alice'): AppStore {
  const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `keyrace-ui-`)));
  AppStore.createProfile(paths, name);
  const s = new AppStore({ paths, port: 0, discovery: false });
  stores.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

const BOB = 'BOBBOBBOBBOBBOBBOBBO';

function game(s: AppStore, patch: Partial<Game>, settings: RaceSettings = { mode: 'sprint', param: 60 }): Game {
  return {
    gid: 'gidgidgidgid',
    role: 'host',
    hostId: s.identity.id,
    hostName: 'Alice',
    settings,
    phase: 'lobby',
    players: [],
    chat: [],
    autoStartAt: null,
    engine: null,
    racers: [],
    results: null,
    newBest: false,
    closedReason: null,
    rematch: null,
    ...patch,
  };
}

describe('command parser', () => {
  it('splits commands and arguments', () => {
    expect(parseCommand('/name Max Power')).toEqual({ name: 'name', args: ['Max', 'Power'], rest: 'Max Power' });
    expect(parseCommand('not a command')).toBeNull();
    expect(parseCommand('/')?.name).toBe('');
    for (const input of ['/"', "/add 'x", '/ / /', '/\u0000', '/spam(x;y']) expect(() => parseCommand(input)).not.toThrow();
    expect(tokenize('a "b c')).toEqual(['a', 'b c']);
  });

  it('finds commands by name and alias only, never by a mere prefix', () => {
    expect(registry.find('s')).toBeUndefined();
    expect(registry.find('practice')?.name).toBe('solo');
    expect(registry.find('exit')?.name).toBe('quit');
    for (const name of ['help', 'race', 'solo', 'me', 'name', 'add', 'remove', 'block', 'unblock', 'whois', 'stats', 'notifications', 'update', 'quit']) {
      expect(registry.find(name)?.name).toBe(name);
    }
  });

  it('validates addresses (default port 5052)', () => {
    expect(parseAddress('192.168.1.20')).toEqual({ host: '192.168.1.20', port: 5052 });
    expect(parseAddress('10.0.0.1:6000')).toEqual({ host: '10.0.0.1', port: 6000 });
    expect(() => parseAddress('1.2.3.4:99999')).toThrow();
    expect(() => parseAddress('rm -rf')).toThrow();
  });
});

describe('editor and text', () => {
  it('edits text, treating an emoji as one character', () => {
    let s = edit.insert({ value: '', cursor: 0 }, 'hi 👋🏽');
    s = edit.backspace(s);
    expect(s.value).toBe('hi ');
    expect(layoutEditor({ value: 'abcdef', cursor: 6 }, 3).map((l) => l.text)).toEqual(['abc', 'def', '']);
    expect(cleanPaste('a\r\nb\u001b[201~')).toBe('a\nb');
  });

  it('renders panel text: headings, lists, bold and code', () => {
    expect(renderText('### Title\n**bold** and `code`\n- one', 40).map(strip)).toEqual(['Title', 'bold and code', '• one']);
  });
});

describe('logo and big digits', () => {
  it('all rows of a glyph block have the same width', () => {
    for (const block of [LOGO, LOGO_SMALL, bigLines('3'), bigLines('GO')]) {
      const widths = new Set(block.map((l) => stringWidth(l.trimEnd())));
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
    }
    expect(stringWidth(LOGO[0]!)).toBeLessThanOrEqual(60);
  });
});

describe('typing text layout', () => {
  it('wraps words into lines and keeps the current line in view', () => {
    const words = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'abcd' : 'xy'));
    const e = { words, index: 0, typed: '', done: [] };
    const lines = layoutWords(e, 20);
    expect(lines.every((l) => l.reduce((n, p) => n + p.width + 1, -1) <= 20)).toBe(true);
    expect(visibleLines(lines, 0)).toEqual({ start: 0, end: 4 });
    const later = layoutWords({ ...e, index: 25 }, 20);
    const line = later.findIndex((l) => l.some((p) => p.index === 25));
    expect(visibleLines(later, 25).start).toBe(line - 1);
  });
});

describe('screens', () => {
  it('header shows the app version, name and friends online', () => {
    const s = store('Max');
    for (const width of [100, 50]) {
      const r = render(createElement(Header, { store: s, width }));
      expect(frame(r)).toContain(`keyrace  v${VERSION}`);
      expect(frame(r)).toContain('Max');
      r.unmount();
    }
  });

  it('dashboard: the banner, the sections and the stats panel', () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    s.contacts.upsert('CARLCARLCARLCARLCARL', { publicKey: '', name: 'Carl', state: 'incoming' });
    for (const [width, rows] of [[100, 32], [64, 24]] as const) {
      const r = render(
        createElement(Dashboard, { store: s, width, height: rows - 3, rows, actions, dialog: null, selectedKey: null, onSelect: () => {}, history: [] }),
      );
      const out = frame(r);
      expect(out).toContain('Start a race');
      expect(out).toContain('Solo practice');
      expect(out).toContain('REQUESTS · 1');
      expect(out).toContain('Carl');
      expect(out).toContain('wants to be friends');
      expect(out).toContain('FRIENDS');
      expect(out).toContain('Bob');
      expect(out).toContain('offline');
      expect(out).toContain('YOUR STATS');
      // the big logo only where it fits, a compact one otherwise
      expect(out.includes('╚═╝')).toBe(width >= 80);
      expect(out.split('\n').every((l) => stringWidth(l) <= width)).toBe(true);
      r.unmount();
    }
  });

  it('dashboard: ←→ on the banner picks solo practice, and enter starts it', async () => {
    const s = store();
    let key: string | null = null;
    const started: string[] = [];
    const acts = { ...actions, soloRace: async () => void started.push('solo'), newRace: async () => void started.push('race') };
    const props = () => ({ store: s, width: 100, height: 29, rows: 32, actions: acts, dialog: null, selectedKey: key, history: [], onSelect: (k: string | null) => void (key = k) });
    const r = render(createElement(Dashboard, props()));
    const tick = () => new Promise((res) => setTimeout(res, 20));
    await tick();
    r.stdin.write('\u001b[C'); // →
    await tick();
    expect(key).toBe('banner:solo');
    r.rerender(createElement(Dashboard, props()));
    expect(frame(r)).toMatch(/❯\s+Solo practice/);
    expect(frame(r)).toContain('enter solo practice');
    r.stdin.write('\r');
    await tick();
    expect(started).toEqual(['solo']);
    r.stdin.write('\u001b[D'); // ←
    await tick();
    expect(key).toBe('banner');
    r.rerender(createElement(Dashboard, props()));
    r.stdin.write('\r');
    await tick();
    expect(started).toEqual(['solo', 'race']);
    r.unmount();
  });

  it('lobby: players with their status and the chat', () => {
    const s = store();
    const g = game(s, {
      players: [
        { id: s.identity.id, name: 'Alice', status: 'joined' },
        { id: BOB, name: 'Bob', status: 'joined' },
        { id: 'CARLCARLCARLCARLCARL', name: 'Carl', status: 'invited' },
        { id: 'DANADANADANADANADANA', name: 'Dana', status: 'declined', busy: true },
      ],
      chat: [{ id: 1, from: BOB, name: 'Bob', text: 'ready when you are' }],
    });
    const r = render(createElement(Lobby, { store: s, game: g, width: 90, height: 24, actions, dialog: null }));
    const out = frame(r);
    expect(out).toContain('LOBBY · Sprint · 60s · hosted by you');
    expect(out).toMatch(/✓ Alice\s+host/);
    expect(out).toMatch(/◷ Carl\s+invited/);
    expect(out).toMatch(/✗ Dana\s+busy racing/);
    expect(out).toContain('Waiting for 1 to answer');
    expect(out).toContain('Bob · ready when you are');
    expect(out).toContain('i invite');
    r.unmount();
  });

  it('race: bars, the text with typed words and the live stats', () => {
    const s = store();
    const now = { t: 10_000 };
    const words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    const engine = new TypingEngine({ settings: { mode: 'sprint', param: 60 }, words, now: () => now.t, startAt: 0 });
    engine.input('the quick bro');
    const g = game(s, {
      phase: 'race',
      engine,
      racers: [
        { id: s.identity.id, name: 'Alice', progress: null, left: false },
        { id: BOB, name: 'Bob', progress: { chars: 20, words: 4, errors: 0, keys: 20, correctKeys: 20, idx: 4, status: 'racing', ms: 9800 }, left: false },
      ],
    });
    const r = render(createElement(Race, { store: s, game: g, width: 90, height: 24, actions, dialog: null }));
    const out = frame(r);
    expect(out).toContain('SPRINT · 60S');
    expect(out).toMatch(/You\s+━+/);
    expect(out).toMatch(/Bob\s+━+─+\s+24 wpm\s+1st/);
    expect(out).toContain('the quick brown fox jumps over the lazy dog');
    expect(out).toContain('0:50 left');
    expect(out).toContain('2 words');
    r.unmount();
  });

  it('race countdown shows big digits; sudden death shows the wall', () => {
    const s = store();
    const now = { t: 0 };
    const engine = new TypingEngine({ settings: { mode: 'sudden', param: 0 }, words: ['abc', 'def'], now: () => now.t, startAt: 2500 });
    const g = game(s, { phase: 'race', role: 'solo', engine, racers: [{ id: s.identity.id, name: 'Alice', progress: null, left: false }] }, { mode: 'sudden', param: 0 });
    const r = render(createElement(Race, { store: s, game: g, width: 90, height: 24, actions, dialog: null }));
    expect(frame(r)).toContain(bigLines('3')[0]!);
    expect(frame(r)).toContain('get ready');
    r.unmount();
    now.t = 2500 + 1000;
    engine.input('abc');
    now.t = 2500 + 4000;
    const r2 = render(createElement(Race, { store: s, game: g, width: 90, height: 24, actions, dialog: null }));
    expect(frame(r2)).toMatch(/wall 20 wpm/);
    r2.unmount();
  });

  it('results: ranking, medals and the new best', () => {
    const s = store();
    const results = rank('race', [
      { id: s.identity.id, name: 'Alice', status: 'finished', completed: true, wpm: 71.4, acc: 0.97, words: 50, errors: 2, chars: 300, timeMs: 42_000 },
      { id: BOB, name: 'Bob', status: 'finished', completed: true, wpm: 80, acc: 0.99, words: 50, errors: 0, chars: 300, timeMs: 39_000 },
      { id: 'CARLCARLCARLCARLCARL', name: 'Carl', status: 'left', completed: false, wpm: 30, acc: 0.9, words: 10, errors: 1, chars: 60, timeMs: 9000 },
    ]);
    const g = game(s, { phase: 'results', results, newBest: true }, { mode: 'race', param: 50 });
    const r = render(createElement(Results, { store: s, game: g, width: 90, height: 20 }));
    const out = frame(r);
    expect(out).toContain('RESULTS · Race · 50 words');
    expect(out).toContain('You placed 2nd of 3');
    expect(out).toMatch(/🥇 1st\s+Bob\s+80\s+99%\s+50\s+0\s+39\.0s/);
    expect(out).toMatch(/🥈 2nd\s+You\s+71\s+97%/);
    expect(out).toContain('★ new best');
    expect(out).toContain('⏏ left');
    expect(out).toContain('r rematch');
    r.unmount();
  });

  it('a called-off race says why', () => {
    const s = store();
    const g = game(s, { phase: 'closed', role: 'guest', closedReason: 'Bob left – the race was called off' });
    const r = render(createElement(Results, { store: s, game: g, width: 80, height: 10 }));
    expect(frame(r)).toContain('Bob left – the race was called off');
    r.unmount();
  });
});
