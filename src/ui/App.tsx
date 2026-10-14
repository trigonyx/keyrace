import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registry } from '../commands/builtin.js';
import type { Paths } from '../core/paths.js';
import { AppStore, type StoreOptions } from '../core/store.js';
import { checkForUpdate } from '../core/update.js';
import { VERSION } from '../core/version.js';
import type { Actions } from './actions.js';
import type { DialogSpec } from 'termcore/ui/components/Dialog';
import { Header } from 'termcore/ui/components/Header';
import { Panel } from 'termcore/ui/components/Panel';
import { useStoreVersion, useTerminalSize } from 'termcore/ui/hooks';
import { mouse } from 'termcore/ui/mouse';
import { Dashboard } from './screens/Dashboard.js';
import { Lobby } from './screens/Lobby.js';
import { Onboarding } from 'termcore/ui/components/Onboarding';
import { LOGO_SMALL } from './components/Banner.js';
import { modeDialog } from './components/ModeDialog.js';
import { Race } from './screens/Race.js';
import { Results } from './screens/Results.js';
import { theme } from 'termcore/ui/theme';

type Phase = { name: 'onboarding' } | { name: 'starting' } | { name: 'ready'; store: AppStore } | { name: 'error'; message: string };

export function Root({
  paths,
  options,
  notice,
}: {
  paths: Paths;
  options: Omit<StoreOptions, 'paths'>;
  /** shown once the app runs (e.g. that the profile moved to ~/.termhub) */
  notice?: string;
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState<Phase>(() => (AppStore.hasProfile(paths) ? { name: 'starting' } : { name: 'onboarding' }));
  const storeRef = useRef<AppStore | null>(null);
  const quitting = useRef(false);

  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') quit();
  });

  useEffect(() => {
    if (phase.name !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (notice) store.showToast(notice, 'success');
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: 'ready', store });
      } catch (err) {
        setPhase({ name: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);

  // one spare row so Ink doesn't clear the whole screen on every render
  const height = Math.max(10, rows - 1);

  if (phase.name === 'onboarding') {
    return (
      <Onboarding
        logo={LOGO_SMALL}
        tagline="typing races with friends on your network"
        width={columns}
        create={(name) => AppStore.createProfile(paths, name)}
        onDone={() => setPhase({ name: 'starting' })}
      />
    );
  }
  if (phase.name === 'starting') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color={theme.dim}>Starting keyrace …</Text>
      </Box>
    );
  }
  if (phase.name === 'error') {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.error} bold>
          keyrace could not start
        </Text>
        <Text>{phase.message}</Text>
        <Text color={theme.dim}>ctrl+c to quit</Text>
      </Box>
    );
  }
  return <Main store={phase.store} width={columns} height={height} rows={rows} quit={quit} />;
}

export function Main({ store, width, height, rows, quit }: { store: AppStore; width: number; height: number; rows: number; quit(): void }) {
  useStoreVersion(store);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  // once per launch: is there a newer version on GitHub? (shown in the header)
  useEffect(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);

  // terminal window focus (reported by the terminal) → desktop notifications while in background
  useEffect(() => {
    mouse.on('focus', (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners('focus');
  }, [store]);

  const actions: Actions = useMemo(() => {
    const ask = <T,>(make: (resolve: (v: T) => void) => DialogSpec) =>
      new Promise<T>((resolve) =>
        setDialog(
          make((v) => {
            setDialog(null);
            resolve(v);
          }),
        ),
      );
    const a: Actions = {
      quit,
      confirm: (title) => ask<boolean>((resolve) => ({ kind: 'confirm', title, resolve })),
      prompt: (title, opts) => ask<string | null>((resolve) => ({ kind: 'prompt', title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, multi, opts) => ask<string[] | null>((resolve) => ({ kind: 'pick', title, options, multi, opts, resolve })),
      chooseMode: (title, initial) => ask((resolve) => modeDialog(title, initial, resolve)),
      newRace: async (preselect) => {
        const settings = await a.chooseMode(preselect?.length ? `Race ${preselect.map((id) => store.peerName(id)).join(', ')}` : 'Start a race');
        if (!settings) return;
        const friends = store.onlineFriends();
        if (!friends.length) {
          store.showToast('No friends online – here is a solo run instead');
          store.games.solo(settings);
          return;
        }
        const options = friends.map((f) => ({ id: f.id, label: f.display, hint: f.racing ? 'racing' : f.away ? 'away' : 'online' }));
        const ids = await a.pick('Invite friends', options, true, {
          emptyOk: true,
          preselect: preselect?.filter((id) => friends.some((f) => f.id === id)),
          emptyHint: 'none = solo',
        });
        if (ids === null) return;
        store.games.create(settings, ids);
      },
      soloRace: async () => {
        const settings = await a.chooseMode('Solo practice');
        if (settings) store.games.solo(settings);
      },
      print: (text, kind = 'info') => {
        if (text.includes('\n')) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ''), kind);
      },
      runCommand: async (input, selectedId) => {
        await registry.execute(input, {
          store,
          selectedId,
          ui: {
            print: (text, kind) => a.print(text, kind),
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick,
            chooseMode: a.chooseMode,
            newRace: a.newRace,
          },
        });
        setHistory((h) => (h[h.length - 1] === input ? h : [...h.slice(-99), input]));
      },
    };
    return a;
  }, [store, quit]);

  const bodyHeight = height - 2;
  const game = store.games.game;
  let body;
  if (game && (game.phase === 'joining' || game.phase === 'lobby')) {
    body = <Lobby store={store} game={game} width={width} height={bodyHeight} actions={actions} dialog={dialog} />;
  } else if (game && game.phase === 'race') {
    body = <Race store={store} game={game} width={width} height={bodyHeight} actions={actions} dialog={dialog} />;
  } else if (game) {
    body = <Results store={store} game={game} width={width} height={bodyHeight} />;
  } else if (panel) {
    body = <Panel text={panel} width={width} height={bodyHeight} onClose={() => setPanel(null)} />;
  } else {
    body = (
      <Dashboard
        store={store}
        width={width}
        height={bodyHeight}
        rows={rows}
        actions={actions}
        dialog={dialog}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        history={history}
      />
    );
  }

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header
        app="keyrace"
        version={VERSION}
        width={width}
        me={store.me}
        address={store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : 'no network'}
        online={store.onlineCount()}
        updateAvailable={store.updateAvailable}
      />
      {body}
    </Box>
  );
}
