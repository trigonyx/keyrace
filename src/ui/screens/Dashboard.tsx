import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { DiscoveredPeer } from 'termcore/net/discovery';
import type { AppStore, FriendView, RequestEntry } from '../../core/store.js';
import type { PendingInvite } from '../../game/session.js';
import { settingsPhrase } from '../../game/types.js';
import type { Actions } from '../actions.js';
import { Banner, bannerCompact, bannerHeight } from '../components/Banner.js';
import { CommandMenu, menuHeight } from 'termcore/ui/components/CommandMenu';
import { Dialog, dialogHeight, type DialogSpec } from 'termcore/ui/components/Dialog';
import { Footer } from 'termcore/ui/components/Footer';
import { InputBox, inputBoxHeight } from 'termcore/ui/components/InputBox';
import { panelHeight, StatsPanel } from '../components/StatsPanel.js';
import { cleanPaste, edit, emptyEditor, type EditorState } from 'termcore/ui/editor';
import { useWheel } from 'termcore/ui/mouse';
import { icons, theme, personHex } from 'termcore/ui/theme';
import { elsewhereDot, elsewhereText, presenceDot, statusText } from 'termcore/ui/presence';
import { useCommandInput } from './useCommandInput.js';

type Entry =
  | { type: 'banner'; key: string }
  | { type: 'request'; key: string; request: RequestEntry }
  | { type: 'friend'; key: string; friend: FriendView }
  | { type: 'nearby'; key: string; peer: DiscoveredPeer };

type Line = { kind: 'section'; title: string } | { kind: 'gap' } | { kind: 'entry'; entry: Entry; index: number };

interface Props {
  store: AppStore;
  width: number;
  height: number;
  rows: number;
  actions: Actions;
  dialog: DialogSpec | null;
  selectedKey: string | null;
  onSelect(key: string | null): void;
  history: string[];
}

/** Side-by-side list and stats from this width on; below it they're stacked. */
const SIDE_BY_SIDE = 84;
const PANEL_WIDTH = 36;

function friendStatus(f: FriendView): { icon: string; color: string; text: string } {
  switch (f.state) {
    case 'outgoing':
      return { icon: icons.pending, color: theme.faint, text: 'request sent' };
    case 'declined':
      return { icon: icons.error, color: theme.faint, text: 'declined your request' };
    case 'blocked':
      return { icon: icons.error, color: theme.error, text: 'blocked' };
    default: {
      if (!f.online && f.elsewhere.length) return { ...elsewhereDot(), text: elsewhereText(f.elsewhere) };
      if (!f.online) return { icon: icons.offline, color: theme.faint, text: 'offline' };
      // their status (busy, do not disturb, a message) comes with their presence
      const status = statusText(f.status, f.statusMsg);
      if (f.racing) return { icon: icons.racing, color: theme.accent, text: ['racing', status].filter(Boolean).join(' · ') };
      if (f.status !== 'available') return { ...presenceDot(f), text: status };
      return { ...presenceDot(f), text: [f.away ? 'away' : 'online', status].filter(Boolean).join(' · ') };
    }
  }
}

export function Dashboard({ store, width, height, rows, actions, dialog, selectedKey, onSelect, history }: Props) {
  const data = store.dashboard();
  const sections = {
    banner: [{ type: 'banner', key: 'banner' } as Entry],
    requests: data.requests.map(
      (r): Entry => ({ type: 'request', key: r.kind === 'invite' ? `i:${r.invite.gid}` : `r:${r.friend.id}`, request: r }),
    ),
    friends: data.friends.map((f): Entry => ({ type: 'friend', key: `f:${f.id}`, friend: f })),
    nearby: data.nearby.map((p): Entry => ({ type: 'nearby', key: `n:${p.id}`, peer: p })),
  };
  const entries: Entry[] = Object.values(sections).flat();
  // the banner has two actions side by side: start a race ('banner') and solo practice ('banner:solo')
  const bannerSolo = selectedKey === 'banner:solo';
  let selected = bannerSolo ? 0 : entries.findIndex((e) => e.key === selectedKey);
  // nothing picked (yet, or it's gone): an open request first, so enter answers it – else the banner
  if (selected === -1) selected = sections.requests.length ? 1 : 0;
  const current = entries[selected];
  const selectedFriend = current?.type === 'friend' && current.friend.state === 'accepted' ? current.friend : null;

  // a new race invite gets selected, so enter joins it (invites are what people react to right away)
  const newestInvite = data.requests.find((r) => r.kind === 'invite');
  const newestKey = newestInvite?.kind === 'invite' ? `i:${newestInvite.invite.gid}` : null;
  const seenInvite = useRef<string | null>(null);
  useEffect(() => {
    // do not disturb: the invite waits under Requests without grabbing the selection
    if (newestKey && newestKey !== seenInvite.current && !dialog && !store.dnd) onSelect(newestKey);
    seenInvite.current = newestKey;
  }, [newestKey]);

  const [commandMode, setCommandMode] = useState(false);
  // set synchronously so characters typed right after "/" are not lost
  const commandRef = useRef(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const selectedId = current?.type === 'friend' ? current.friend.id : null;
  const cmd = useCommandInput({
    editor,
    setEditor,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim(), selectedId);
    },
    onEscape: closeCommand,
  });

  /** Runs an action and turns errors into a toast instead of crashing. */
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };

  const acceptInvite = (inv: PendingInvite) => attempt(() => store.games.accept(inv.gid));

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    if (e.type === 'banner') return void (bannerSolo ? actions.soloRace() : actions.newRace());
    if (e.type === 'request') {
      const r = e.request;
      if (r.kind === 'invite') return acceptInvite(r.invite);
      const id = r.friend.id;
      attempt(() => store.accept(id));
      return onSelect(`f:${id}`);
    }
    if (e.type === 'nearby') return attempt(() => store.requestNearby(e.peer.id));
    const f = e.friend;
    if (f.state === 'accepted') {
      if (!f.online && !f.elsewhere.length) return store.showToast(`${f.display} is offline`, 'error');
      if (f.racing) return store.showToast(`${f.display} is racing right now – try again in a moment`, 'info');
      return void actions.newRace([f.id]);
    }
    if (f.state === 'declined') return attempt(() => store.request(f.id));
    if (f.state === 'blocked') return store.showToast(`${f.display} is blocked – /unblock to undo`, 'info');
    store.showToast(`Waiting for ${f.display} to accept your friend request`, 'info');
  };

  useWheel((dir) => {
    const next = Math.max(0, Math.min(entries.length - 1, selected + dir));
    if (next !== selected) onSelect(entries[next]!.key);
  }, !dialog && !commandMode);

  useInput(
    (input, key) => {
      if (commandRef.current) {
        // input isn't active yet – forward characters to it
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      const move = (d: number) => {
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        // staying on the banner keeps whichever of its two actions is picked
        if (next !== selected) onSelect(entries[next]!.key);
      };
      if (current?.type === 'banner') {
        if (key.leftArrow || input === 'h') return onSelect('banner');
        if (key.rightArrow || input === 'l') return onSelect('banner:solo');
      }
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input.startsWith('/')) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === '?') return void actions.runCommand('/help', null);
      if (input === 'q') return actions.quit();
      if (input === 's') return void actions.soloRace();
      if (input === 'a') {
        void actions.prompt('Add a friend by IP', { hint: 'e.g. 192.168.1.20 or 192.168.1.20:5052' }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`, null);
        });
        return;
      }
      if (input === 'x' && current?.type === 'request') {
        const r = current.request;
        attempt(() => (r.kind === 'invite' ? store.games.decline(r.invite.gid) : store.decline(r.friend.id)));
        return;
      }
      if (input === 'r' && current?.type === 'friend') {
        const f = current.friend;
        void actions
          .prompt(`Nickname for ${f.name}`, { hint: "Leave empty to use the person's own name", initial: f.alias })
          .then((v) => {
            if (v !== null) store.rename(f.id, v);
          });
        return;
      }
      if (input === 'd' && current?.type === 'friend') {
        const f = current.friend;
        void actions.confirm(`Remove ${f.display} as a friend?`).then((ok) => ok && store.removeFriend(f.id));
      }
    },
    { isActive: !dialog && !commandMode },
  );

  // ── Layout ──
  const compact = bannerCompact(width, rows);
  const banner = bannerHeight(compact);
  const bottom = dialog ? dialogHeight(dialog) : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const side = width >= SIDE_BY_SIDE;
  const mainHeight = Math.max(3, height - banner - bottom - 1);
  // the full panel where it fits, else the compact one, else none (e.g. while a dialog is open)
  const fullRows = panelHeight(store, selectedFriend, false);
  const compactRows = panelHeight(store, selectedFriend, true);
  const panelCompact = !side || mainHeight < fullRows;
  const panelRows = panelCompact ? compactRows : fullRows;
  // stacked: the panel only shows if the list still gets a few rows
  const showPanel = side ? mainHeight >= panelRows : mainHeight - panelRows >= 4;
  const listHeight = Math.max(2, mainHeight - (showPanel && !side ? panelRows : 0));
  const listWidth = side ? width - PANEL_WIDTH - 1 : width;
  const inner = listWidth - 2;

  const lines: Line[] = [];
  const section = (title: string, list: Entry[], showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: 'gap' });
    lines.push({ kind: 'section', title });
    for (const e of list) lines.push({ kind: 'entry', entry: e, index: entries.indexOf(e) });
  };
  section(`Requests · ${data.requests.length}`, sections.requests);
  const online = data.friends.filter((f) => f.state === 'accepted' && f.online).length;
  section(data.friends.length ? `Friends · ${online} online` : 'Friends', sections.friends, true);
  const scanning = store.me.scanning;
  section(scanning ? 'Nearby · searching the network …' : 'Nearby', sections.nearby, scanning);

  const selLine = lines.findIndex((l) => l.kind === 'entry' && l.index === selected);
  const start = Math.max(0, Math.min(selLine - Math.floor(listHeight / 2), lines.length - listHeight));
  const visible = lines.slice(start, start + listHeight);

  const hints = (() => {
    const base = ['↑↓ select'];
    if (!current || current.type === 'banner') base.push('←→ race / solo', bannerSolo ? 'enter solo practice' : 'enter start a race');
    else if (current.type === 'request') {
      base.push(current.request.kind === 'invite' ? 'enter join' : 'enter accept', 'x decline');
    } else if (current.type === 'nearby') base.push('enter add friend');
    else {
      if (current.friend.state === 'accepted') base.push('enter invite');
      base.push('r rename', 'd remove');
    }
    return [...base, 'a add by IP', '/ commands', '? help', 'q quit'];
  })();

  const empty = data.friends.length === 0 && data.requests.length === 0;
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Banner
        width={width}
        compact={compact}
        selected={current?.type === 'banner' ? (bannerSolo ? 'solo' : 'race') : null}
        animate={store.isFocused && !dialog && !commandMode}
        mode={store.settings.animations}
      />
      <Box flexDirection={side ? 'row' : 'column'} height={mainHeight} width={width} alignItems="flex-start" overflow="hidden">
        <Box flexDirection="column" height={listHeight} width={listWidth} paddingX={1} overflow="hidden" flexShrink={0}>
          {visible.map((l, i) => {
            if (l.kind === 'gap') return <Text key={`g${i}`}> </Text>;
            if (l.kind === 'section') {
              return (
                <Text key={`s${i}`} color={theme.dim} bold>
                  {l.title.toUpperCase()}
                </Text>
              );
            }
            return <Row key={l.entry.key} entry={l.entry} selected={l.index === selected} width={inner} store={store} />;
          })}
          {empty && listHeight - visible.length >= 3 ? <EmptyHint store={store} width={inner} /> : null}
        </Box>
        {showPanel ? (
          <Box marginLeft={side ? 1 : 0} flexShrink={0}>
            <StatsPanel store={store} friend={selectedFriend} width={side ? PANEL_WIDTH : width} compact={panelCompact} />
          </Box>
        ) : null}
      </Box>
      {dialog ? (
        <Dialog spec={dialog} width={width} />
      ) : commandMode ? (
        <>
          <InputBox
            state={editor}
            onChange={setEditor}
            onSubmit={cmd.submit}
            onKey={cmd.onKey}
            isActive
            width={width}
            history={history}
            borderColor={theme.accent}
            singleLine
          />
          <CommandMenu items={cmd.items} selected={cmd.selected} width={width} />
        </>
      ) : null}
      <Footer hints={commandMode ? ['enter run', 'tab complete', 'esc cancel'] : hints} toast={store.toast} width={width} />
    </Box>
  );
}

function Pointer({ selected }: { selected: boolean }) {
  return (
    <Box width={2} flexShrink={0}>
      <Text color={theme.accent}>{selected ? icons.pointer : ' '}</Text>
    </Box>
  );
}

function Row({ entry, selected, width, store }: { entry: Entry; selected: boolean; width: number; store: AppStore }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text: string, color?: string) => (
    <Box width={nameWidth} flexShrink={0}>
      <Text bold={selected} color={selected ? theme.accent : color} wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
  const dot = (icon: string, color: string) => (
    <Box width={2} flexShrink={0}>
      <Text color={color}>{icon}</Text>
    </Box>
  );

  if (entry.type === 'banner') return null;
  if (entry.type === 'nearby') {
    const p = entry.peer;
    return (
      <Box>
        <Pointer selected={selected} />
        {dot(icons.online, theme.success)}
        {name(p.name)}
        <Text color={theme.dim} wrap="truncate-end">
          on your network · {p.ip}
        </Text>
      </Box>
    );
  }
  if (entry.type === 'request') {
    const r = entry.request;
    const who = r.kind === 'invite' ? r.invite.hostName : r.friend.display;
    const text = r.kind === 'invite' ? `invites you to ${settingsPhrase(r.invite.settings)}` : 'wants to be friends';
    return (
      <Box>
        <Pointer selected={selected} />
        {dot(icons.request, theme.accent)}
        {name(who)}
        <Text wrap="truncate-end">{text}</Text>
      </Box>
    );
  }
  const f = entry.friend;
  const st = friendStatus(f);
  const h = f.state === 'accepted' ? store.stats().h2h.get(f.id) : undefined;
  return (
    <Box>
      <Pointer selected={selected} />
      {dot(st.icon, st.color)}
      {name(f.display, f.state === 'accepted' ? personHex(f.id, f.color) : undefined)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={f.state === 'accepted' && f.online ? st.color : theme.dim} italic={f.state !== 'accepted'} wrap="truncate-end">
          {st.text}
        </Text>
      </Box>
      {h ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.dim}>you </Text>
          <Text color={h.wins >= h.losses ? theme.success : undefined}>{h.wins}</Text>
          <Text color={theme.dim}> : </Text>
          <Text color={h.losses > h.wins ? theme.error : undefined}>{h.losses}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function EmptyHint({ store, width }: { store: AppStore; width: number }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(', ') : 'no network';
  return (
    <Box paddingLeft={2} width={width}>
      <Text color={theme.dim} wrap="wrap">
        Other keyrace players on your network show up under "Nearby" – press enter to send them a friend request. Not
        showing up? Press <Text color={theme.accent}>a</Text> and enter their IP. Yours:{' '}
        <Text color={theme.accent}>{addr}</Text>
      </Text>
    </Box>
  );
}
