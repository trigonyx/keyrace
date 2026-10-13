import { Box, Text, useInput } from 'ink';
import { useRef, useState } from 'react';
import { MAX_CHAT } from '../../core/protocol.js';
import type { AppStore } from '../../core/store.js';
import type { LobbyPlayer } from '../../game/lobby.js';
import type { Game } from '../../game/session.js';
import { settingsLabel } from '../../game/types.js';
import type { Actions } from '../actions.js';
import { Dialog, dialogHeight, type DialogSpec } from '../components/Dialog.js';
import { Footer } from '../components/Footer.js';
import { InputBox } from '../components/InputBox.js';
import { cleanPaste, emptyEditor, type EditorState } from '../editor.js';
import { useTicker } from '../hooks.js';
import { useWheel } from '../mouse.js';
import { icons, senderHex, theme } from '../theme.js';

interface Props {
  store: AppStore;
  game: Game;
  width: number;
  height: number;
  actions: Actions;
  dialog: DialogSpec | null;
}

const STATUS: Record<LobbyPlayer['status'], { icon: string; color: string; text: string }> = {
  joined: { icon: icons.joined, color: theme.success, text: 'joined' },
  invited: { icon: icons.pending, color: theme.warning, text: 'invited' },
  declined: { icon: icons.error, color: theme.error, text: 'declined' },
  left: { icon: icons.left, color: theme.faint, text: 'left' },
};

export function Lobby({ store, game, width, height, actions, dialog }: Props) {
  const isHost = game.role === 'host';
  const players = game.players;
  const [cursor, setCursor] = useState(0);
  const [focus, setFocus] = useState<'players' | 'chat'>('players');
  // set synchronously so characters typed right after switching aren't lost
  const focusRef = useRef<'players' | 'chat'>('players');
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  useTicker(250, game.autoStartAt !== null);
  const sel = Math.min(cursor, Math.max(0, players.length - 1));
  const selected = players[sel];

  const toChat = (initial = '') => {
    focusRef.current = 'chat';
    setFocus('chat');
    if (initial) setEditor({ value: initial, cursor: initial.length });
  };
  const toPlayers = () => {
    focusRef.current = 'players';
    setFocus('players');
  };

  const inviteMore = async () => {
    const inLobby = new Set(players.filter((p) => p.status === 'joined' || p.status === 'invited').map((p) => p.id));
    const options = store
      .onlineFriends()
      .filter((f) => !inLobby.has(f.id))
      .map((f) => ({ id: f.id, label: f.display, hint: f.racing ? 'racing' : f.away ? 'away' : 'online' }));
    if (!options.length) return store.showToast('No other friends online', 'info');
    const ids = await actions.pick('Invite more friends', options, true);
    if (ids?.length) store.games.inviteMore(ids);
  };

  const start = async () => {
    const pending = store.games.pendingPlayers();
    if (pending.length) {
      const n = pending.length;
      const ok = await actions.confirm(`${n} ${n === 1 ? "player hasn't" : "players haven't"} joined – start without them?`);
      if (!ok) return;
    }
    store.games.startRace();
  };

  const leave = async () => {
    if (game.phase === 'joining') return store.games.leave();
    const ok = await actions.confirm(isHost ? 'Close the lobby for everyone?' : 'Leave the lobby?');
    if (ok) store.games.leave();
  };

  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(players.length - 1, c + dir))), !dialog && focus === 'players');

  useInput(
    (input, key) => {
      if (focusRef.current === 'chat') {
        // the chat input isn't active yet – forward characters to it
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => ({ value: e.value + text, cursor: e.value.length + text.length }));
        return;
      }
      if (key.escape) return void leave();
      if (key.upArrow) return setCursor(Math.max(0, sel - 1));
      if (key.downArrow) return setCursor(Math.min(players.length - 1, sel + 1));
      if (key.tab) return toChat();
      if (isHost) {
        if (input === 'c') return toChat();
        if (key.return) return void start();
        if (input === 'i') return void inviteMore();
        if (input === 'k' && selected && selected.id !== game.hostId) {
          const p = selected;
          void actions.confirm(`Remove ${p.name} from the lobby?`).then((ok) => ok && store.games.kick(p.id));
          return;
        }
        return;
      }
      // guests have no other shortcuts: typing starts a chat message
      const text = cleanPaste(input);
      if (text && !key.ctrl && !key.meta && !key.return && text.trim()) toChat(text);
    },
    { isActive: !dialog && focus === 'players' },
  );

  // ── Layout ──
  const joined = players.filter((p) => p.status === 'joined').length;
  const invited = players.filter((p) => p.status === 'invited').length;
  const startsIn = game.autoStartAt !== null ? Math.max(0, Math.ceil((game.autoStartAt - Date.now()) / 1000)) : null;
  const notice =
    game.phase === 'joining'
      ? `Joining ${game.hostName}'s lobby …`
      : startsIn !== null
        ? `Everyone's here – starting in ${startsIn} …`
        : isHost
          ? invited
            ? `Waiting for ${invited} to answer · enter starts now`
            : joined > 1
              ? 'enter starts the race'
              : 'Nobody has joined yet · i invites more friends'
          : `Waiting for ${game.hostName} to start`;
  const bottom = dialog ? dialogHeight(dialog) : 3;
  const fixed = 2 /* title + gap */ + 1 /* players title */ + players.length + 1 /* gap */ + 2 /* notice + gap */ + 1 /* chat title */;
  const chatRows = Math.max(1, height - fixed - bottom - 1);
  const chat = game.chat.slice(-chatRows);
  const nameWidth = Math.min(20, Math.max(8, ...players.map((p) => p.name.length + 2)));

  const hints =
    focus === 'chat'
      ? ['enter send', 'tab/esc back to players']
      : isHost
        ? ['↑↓ select', 'enter start', 'i invite', 'k kick', 'c chat', 'esc close lobby']
        : ['type to chat', 'esc leave'];

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={theme.dim} bold>
            LOBBY
          </Text>
          <Text color={theme.faint}> · </Text>
          <Text bold>{settingsLabel(game.settings)}</Text>
          <Text color={theme.faint}> · </Text>
          <Text color={theme.dim}>hosted by {isHost ? 'you' : game.hostName}</Text>
        </Text>
        <Text> </Text>
        <Text color={theme.dim} bold>
          PLAYERS · {joined} joined
        </Text>
        {players.map((p, i) => {
          const st = STATUS[p.status];
          const active = focus === 'players' && i === sel;
          const isMe = p.id === store.identity.id;
          return (
            <Box key={p.id}>
              <Box width={2} flexShrink={0}>
                <Text color={theme.accent}>{active ? icons.pointer : ' '}</Text>
              </Box>
              <Box width={2} flexShrink={0}>
                <Text color={st.color}>{st.icon}</Text>
              </Box>
              <Box width={nameWidth} flexShrink={0}>
                <Text bold={active || isMe} color={active ? theme.accent : p.status === 'joined' ? senderHex(p.id) : theme.dim} wrap="truncate-end">
                  {p.name}
                </Text>
              </Box>
              <Text color={p.status === 'joined' ? theme.dim : st.color} wrap="truncate-end">
                {p.id === game.hostId ? 'host' : p.busy ? 'busy racing' : st.text}
                {isMe ? <Text color={theme.faint}> · you</Text> : null}
              </Text>
            </Box>
          );
        })}
        <Text> </Text>
        <Text color={startsIn !== null ? theme.accent : theme.dim} bold={startsIn !== null} wrap="truncate-end">
          {notice}
        </Text>
        <Text> </Text>
        <Text color={theme.dim} bold>
          CHAT
        </Text>
        {chat.length === 0 ? (
          <Text color={theme.faint}>{game.phase === 'joining' ? ' ' : 'No messages yet'}</Text>
        ) : (
          chat.map((m) => (
            <Text key={m.id} wrap="truncate-end">
              <Text color={m.from === store.identity.id ? theme.accent : senderHex(m.from)} bold>
                {m.from === store.identity.id ? 'You' : m.name}
              </Text>
              <Text color={theme.faint}> · </Text>
              {m.text}
            </Text>
          ))
        )}
      </Box>
      {dialog ? (
        <Dialog spec={dialog} width={width} />
      ) : (
        <InputBox
          state={editor}
          onChange={setEditor}
          onSubmit={(v) => {
            if (v.trim()) store.games.sendChat(v);
            setEditor(emptyEditor);
          }}
          onKey={(_i, key) => {
            if (key.escape || key.tab) {
              toPlayers();
              return true;
            }
            return false;
          }}
          isActive={focus === 'chat' && game.phase === 'lobby'}
          width={width}
          singleLine
          maxLength={MAX_CHAT}
          placeholder={focus === 'chat' ? 'Say something …' : isHost ? 'tab to chat' : 'type to chat'}
          borderColor={focus === 'chat' ? theme.accent : theme.border}
        />
      )}
      <Footer hints={hints} toast={store.toast} width={width} />
    </Box>
  );
}
