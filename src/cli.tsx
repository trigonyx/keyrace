import fs from 'node:fs';
import { render } from 'ink';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolvePaths } from './core/paths.js';
import {
  fetchLatestVersion,
  compareVersions,
  installedVersion,
  installHint,
  installKind,
  newerLocalInstall,
  restartRequested,
  runInstall,
  SOURCE_HINT,
  staleInstallHint,
} from './core/update.js';
import { REPO_CONFIGURED, VERSION } from './core/version.js';
import { acquireLock, startInstanceServer, type Lock } from './core/instance.js';
import { Root } from './ui/App.js';
import { MOUSE_OFF, MOUSE_ON, MouseFilterStdin } from './ui/mouse.js';

const HELP = `keyrace – multiplayer typing races for your local network

Usage: keyrace [options]
       keyrace update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.keyrace, or $KEYRACE_HOME)
  --port <port>     TCP port (default: 5052, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/keyrace.log
  -h, --help        Show this help
  -v, --version     Show the version
`;

const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
const ALT_SCREEN_OFF = '\u001b[?1049l';
const SHOW_CURSOR = '\u001b[?25h';

/** `keyrace update`: same as running INSTALL_CMD, with a version check first. */
async function update(): Promise<number> {
  if (installKind() === 'source') {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, '')}\n`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json → repository).\n");
    return 1;
  }
  process.stdout.write('Checking for updates …\n');
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`keyrace ${VERSION} is up to date.\n`);
    return 0;
  }
  process.stdout.write(latest ? `Updating keyrace ${VERSION} → ${latest} …\n` : `Couldn't check the latest version – installing anyway …\n`);
  const res = await runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      process.stderr.write(`\n${staleInstallHint(installed).replace(/`/g, '')}\n`);
      return 1;
    }
    process.stdout.write(`\nDone${installed ? ` – keyrace ${installed} is installed` : ''}. Start it with: keyrace\n`);
    return 0;
  }
  process.stderr.write(`\nUpdate failed. ${installHint(res.output) ?? 'See the npm output above.'}\n`);
  return 1;
}

async function main(): Promise<void> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: 'string' },
        port: { type: 'string' },
        'no-discovery': { type: 'boolean' },
        debug: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
    }));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    process.exit(2);
  }

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`keyrace ${VERSION}\n`);
    return;
  }
  if (positionals[0] === 'update' && positionals.length === 1) {
    void update().then((code) => process.exit(code));
    return;
  }
  if (positionals.length) {
    process.stderr.write(`Unknown command: ${positionals.join(' ')}\n\n${HELP}`);
    process.exit(2);
  }
  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}\n`);
      process.exit(2);
    }
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('keyrace needs an interactive terminal.\n');
    process.exit(1);
  }

  const paths = resolvePaths(values.home);

  // one keyrace per data folder
  let lock: Lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!('release' in got)) {
      process.stdout.write('keyrace is already open in another window.\n');
      process.exit(0);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start keyrace: ${(err as Error).message}\n`);
    process.exit(1);
  }
  try {
    await startInstanceServer(paths.socket);
  } catch {
    // a second start can't probe us then – the lock alone still keeps it out
  }

  // full screen like vim/less – on exit the terminal is back to how it was
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== 'win32') fs.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  // alternate scroll + focus reports: trackpad/wheel move lists, focus drives notifications
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on('exit', restore);
  const crash = (err: unknown) => {
    restore();
    process.stderr.write(`\nkeyrace crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  for (const sig of ['SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(0));

  const app = render(
    <Root paths={paths} options={{ port, discovery: !values['no-discovery'], debug: values.debug }} />,
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) as unknown as NodeJS.ReadStream },
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      // after /update: start the freshly installed version in this terminal – and stop
      // reading the terminal here, so every keystroke goes to the new process
      process.stdin.removeAllListeners('data');
      process.stdin.pause();
      const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      child.on('error', () => process.exit(0));
    },
    crash,
  );
}

/**
 * Updates without write access to npm's global folder land in ~/.keyrace/app. If a newer
 * copy is there, it runs instead of this one (with the same arguments).
 */
async function start(): Promise<void> {
  const local = installKind() === 'npm' ? newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start keyrace ${local.version} (${(err as Error).message}) – starting ${VERSION} instead.\n`);
    }
  }
  await main();
}

void start();
