import net from 'node:net';
import { displayName } from 'termcore/friends/book';
import { formatId } from 'termcore/net/identity';
import { statusText } from 'termcore/ui/presence';
import { APP } from '../app.js';
import {
  compareVersions,
  fetchLatestVersion,
  installedVersion,
  installHint,
  installKind,
  requestRestart,
  runInstall,
  SOURCE_HINT,
  staleInstallHint,
} from '../core/update.js';
import { VERSION } from '../core/version.js';
import { bestKey } from '../game/stats.js';
import { MODE_LABEL, PARAMS, settingsLabel, type Mode } from '../game/types.js';
import { duration, pct, shortTime } from 'termcore/ui/format';
import { CommandRegistry, type Command, type CommandContext } from './registry.js';

const STATE_LABEL: Record<string, string> = {
  accepted: 'friend',
  outgoing: 'request sent',
  incoming: 'wants to be friends',
  declined: 'declined your request',
  blocked: 'blocked',
};

/**
 * The friend a command is about: the one selected on the dashboard, or else picked from a
 * list. `filter` limits which friends qualify.
 */
async function friendOf(ctx: CommandContext, title: string, filter: (state: string) => boolean = () => true): Promise<string | null> {
  const sel = ctx.selectedId ? ctx.store.contacts.get(ctx.selectedId) : undefined;
  if (sel && filter(sel.state)) return sel.id;
  const options = ctx.store.contacts
    .all()
    .filter((c) => filter(c.state))
    .map((c) => ({ id: c.id, label: displayName(c), hint: STATE_LABEL[c.state] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (!options.length) throw new Error('No friend to choose from');
  const ids = await ctx.ui.pick(title, options, false);
  return ids?.[0] ?? null;
}

export function parseAddress(input: string): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1]!;
  const port = m[2] ? Number(m[2]) : APP.tcpPort;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}

/** "Sprint 60s  78 wpm · 65 words · 98%" lines for the bests. */
function bestLines(ctx: CommandContext): string[] {
  const stats = ctx.store.stats();
  const lines: string[] = [];
  for (const mode of Object.keys(PARAMS) as Mode[]) {
    for (const param of PARAMS[mode]) {
      const b = stats.bests.get(bestKey(mode, param));
      if (!b) continue;
      const label = settingsLabel({ mode, param });
      const value =
        mode === 'sudden'
          ? `**${duration(b.timeMs)}** survived · ${b.words} words · ${Math.round(b.wpm)} wpm`
          : mode === 'race'
            ? `**${Math.round(b.wpm)} wpm** · ${duration(b.timeMs)} · ${pct(b.acc)}`
            : `**${Math.round(b.wpm)} wpm** · ${b.words} words · ${pct(b.acc)}`;
      lines.push(`- ${label}: ${value} _${shortTime(b.ts)}_`);
    }
  }
  return lines;
}

export const builtinCommands: Command[] = [
  {
    name: 'help',
    aliases: ['?'],
    description: 'Show all commands and shortcuts',
    scope: 'global',
    run(ctx) {
      const cmds = registry.available();
      const width = Math.max(...cmds.map((c) => `/${c.name} ${c.usage ?? ''}`.length));
      const lines = cmds.map((c) => `\`${`/${c.name} ${c.usage ?? ''}`.trimEnd().padEnd(width)}\`  ${c.description}`);
      ctx.ui.print(
        [
          '### Commands',
          '',
          ...lines.map((l) => `- ${l}`),
          '',
          '**Keys:** `↑↓` select · `enter` start a race / accept / invite · `s` solo practice · `x` decline · `a` add by IP · `r` rename · `d` remove · `/` command · `q` quit',
          '**Racing:** type the words, `space` ends a word, `backspace` fixes the current word (`alt+backspace` clears it), `esc` gives up',
        ].join('\n'),
      );
    },
  },
  {
    name: 'race',
    aliases: ['new', 'play'],
    description: 'Start a race and invite friends',
    scope: 'global',
    async run(ctx) {
      await ctx.ui.newRace();
    },
  },
  {
    name: 'solo',
    aliases: ['practice'],
    description: 'Solo practice (counts for your bests, not for wins)',
    scope: 'global',
    async run(ctx) {
      const s = await ctx.ui.chooseMode('Solo practice');
      if (s) ctx.store.games.solo(s);
    },
  },
  {
    name: 'me',
    aliases: ['id'],
    description: 'Show your name, ID and address',
    scope: 'global',
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(', ') : 'no network';
      const status = statusText(me.status, me.statusMsg);
      ctx.ui.print(
        [
          `### ${me.name}`,
          '',
          `- **ID** \`${formatId(me.id, true)}\``,
          ...(status ? [`- **Status** ${status}`] : []),
          `- **Reachable at** ${addr}`,
          '',
          '_Name, ID and friends are shared by termchat, keyrace and termdrop (~/.termhub)._',
        ].join('\n'),
      );
    },
  },
  {
    name: 'name',
    usage: '<new name>',
    minArgs: 1,
    description: 'Change your display name (in all apps)',
    scope: 'global',
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now ${name}`, 'success');
    },
  },
  {
    name: 'add',
    usage: '<ip[:port]>',
    minArgs: 1,
    description: "Add a friend by IP (if they don't show up under Nearby)",
    scope: 'global',
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]!);
      ctx.ui.print(`Connecting to ${host}:${port} …`);
      await ctx.store.addByAddress(host, port);
    },
  },
  {
    name: 'rename',
    usage: '[nickname]',
    description: 'Your own nickname for the selected friend (empty = their own name)',
    scope: 'global',
    async run(ctx, _args, rest) {
      const id = await friendOf(ctx, 'Rename which friend?');
      if (!id) return;
      ctx.store.rename(id, rest);
      ctx.ui.print(rest ? `Now shown as ${ctx.store.friend(id)?.display}` : 'Nickname removed', 'success');
    },
  },
  {
    name: 'remove',
    description: 'Remove the selected friend',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Remove which friend?');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      if (await ctx.ui.confirm(`Remove ${f.display} as a friend?`)) ctx.store.removeFriend(id);
    },
  },
  {
    name: 'block',
    description: 'Block the selected friend',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Block whom?', (s) => s !== 'blocked');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      if (await ctx.ui.confirm(`Block ${f.display}?`)) ctx.store.block(id);
    },
  },
  {
    name: 'unblock',
    description: 'Unblock someone you blocked',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Unblock whom?', (s) => s === 'blocked');
      if (id) ctx.store.unblock(id);
    },
  },
  {
    name: 'whois',
    aliases: ['info'],
    description: 'Friend details and safety code',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Show whom?');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      const code = ctx.store.safetyCodeWith(id);
      const lines = [
        `### ${f.display}${f.alias ? ` _(calls themselves ${f.name})_` : ''}`,
        '',
        `- **ID** \`${formatId(f.id, true)}\``,
        `- **Status** ${f.racing ? 'racing' : f.away ? 'away' : f.online ? 'online' : 'offline'}${f.online && statusText(f.status, f.statusMsg) ? ` · ${statusText(f.status, f.statusMsg)}` : ''} · ${STATE_LABEL[f.state] ?? f.state}`,
        `- **Address** ${f.lastIp ? `\`${f.lastIp}:${f.lastPort ?? '?'}\`` : 'unknown'}`,
        `- **Safety code** ${code ? `\`${code}\`` : 'not connected yet'}`,
        '',
        '_Compare the safety code in person. If it matches, nobody is sitting in the middle._',
      ];
      ctx.ui.print(lines.join('\n'));
    },
  },
  {
    name: 'stats',
    description: 'Your stats, bests and head-to-head records',
    scope: 'global',
    run(ctx) {
      const s = ctx.store.stats();
      const lines = [
        '### Your stats',
        '',
        `- **Races** ${s.races} · **wins** ${s.wins} (${pct(s.winRate)}) · **solo runs** ${s.solo}`,
        `- **Average** ${s.avgWpm === null ? '–' : `${Math.round(s.avgWpm)} wpm`} · ${s.avgAcc === null ? '–' : `${pct(s.avgAcc)} accuracy`}`,
        '',
        '### Personal bests',
        '',
        ...(bestLines(ctx).length ? bestLines(ctx) : ['_No runs yet – press `s` for solo practice._']),
      ];
      const h2h = [...s.h2h.values()].sort((a, b) => b.races - a.races);
      if (h2h.length) {
        lines.push('', '### Head to head', '');
        for (const h of h2h) {
          const name = ctx.store.contacts.get(h.id) ? ctx.store.peerName(h.id) : h.name;
          lines.push(
            `- **${name}**  you ${h.wins} : ${h.losses} · best ${Math.round(h.myBestWpm)} vs ${Math.round(h.theirBestWpm)} wpm` +
              (h.last ? ` _· last: ${MODE_LABEL[h.last.mode]} ${shortTime(h.last.ts)}_` : ''),
          );
        }
      }
      ctx.ui.print(lines.join('\n'));
    },
  },
  {
    name: 'notifications',
    aliases: ['notify'],
    usage: '[on|off]',
    description: 'Desktop notifications while the app is in the background (all apps)',
    scope: 'global',
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== 'on' && arg !== 'off') throw new Error('Usage: /notifications on|off');
      if (arg) ctx.store.setNotifications(arg === 'on');
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? 'on' : 'off'}`, 'info');
    },
  },
  {
    name: 'update',
    description: 'Install the latest keyrace version from GitHub',
    scope: 'global',
    async run(ctx) {
      if (installKind() === 'source') return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print('Checking for updates …');
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub – are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`keyrace ${VERSION} is up to date`, 'success');
        return;
      }
      if (!(await ctx.ui.confirm(`Update keyrace ${VERSION} → ${latest}?`))) return;
      ctx.ui.print(`Installing keyrace ${latest} … (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split('\n').slice(-6).join('\n');
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:\n${tail}`);
      }
      // don't claim success before the new version is really there
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart keyrace now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated – restart keyrace to use ${latest}`, 'success');
      }
    },
  },
  {
    name: 'quit',
    aliases: ['exit', 'q'],
    description: 'Quit keyrace',
    scope: 'global',
    run(ctx) {
      ctx.ui.quit();
    },
  },
];

export const registry = new CommandRegistry(builtinCommands);
