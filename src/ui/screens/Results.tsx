import { Box, Text, useInput } from 'ink';
import type { AppStore } from '../../core/store.js';
import { ordinal } from '../../game/scoring.js';
import type { Game } from '../../game/session.js';
import { settingsLabel, settingsPhrase, type RankedResult } from '../../game/types.js';
import { Footer } from 'termcore/ui/components/Footer';
import { duration, pct } from 'termcore/ui/format';
import { icons, senderHex, theme } from 'termcore/ui/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

interface Props {
  store: AppStore;
  game: Game;
  width: number;
  height: number;
}

function Cell({ w, children, color, bold, right = true }: { w: number; children: string; color?: string; bold?: boolean; right?: boolean }) {
  return (
    <Box width={w} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'}>
      <Text color={color} bold={bold} wrap="truncate-end">
        {children}
      </Text>
    </Box>
  );
}

/** Ranking after a race (or the notice that it was called off). */
export function Results({ store, game, width, height }: Props) {
  const isHost = game.role === 'host';
  const me = store.identity.id;
  const rematch = game.rematch && store.games.invites.has(game.rematch.gid) ? game.rematch : null;

  useInput((input, key) => {
    if (game.phase === 'closed') {
      if (key.return || key.escape || input === 'q') store.games.dismiss();
      return;
    }
    if (rematch) {
      if (key.return || input === 'y') return store.games.accept(rematch.gid);
      if (input === 'x') return store.games.decline(rematch.gid);
    }
    if (input === 'r' && (isHost || game.role === 'solo')) {
      if (game.role === 'solo') return store.games.solo(game.settings);
      return store.games.rematch();
    }
    if (key.return || key.escape) store.games.dismiss();
  });

  if (game.phase === 'closed') {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
          <Text color={theme.error} bold>
            {icons.error} {game.closedReason ?? 'The race was called off'}
          </Text>
          <Text color={theme.dim}>Nothing was recorded.</Text>
        </Box>
        <Footer hints={['enter back to the dashboard']} toast={store.toast} width={width} />
      </Box>
    );
  }

  const results = game.results ?? [];
  const { mode } = game.settings;
  const showTime = mode !== 'sprint';
  const nameW = Math.min(20, Math.max(8, ...results.map((r) => r.name.length + 2)));
  const timeLabel = mode === 'sudden' ? 'SURVIVED' : 'TIME';
  const solo = game.role === 'solo' || results.length === 1;
  const mine = results.find((r) => r.id === me);
  const statusText = (r: RankedResult) =>
    r.status === 'left' ? `${icons.left} left` : mode === 'race' && !r.completed ? 'not finished' : mode === 'sudden' && r.status === 'finished' ? 'cleared' : '';

  const hints = rematch
    ? ['enter join the rematch', 'x decline', 'esc back']
    : isHost
      ? ['r rematch', 'enter back']
      : game.role === 'solo'
        ? ['r again', 'enter back']
        : ['enter back'];

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={theme.dim} bold>
            RESULTS
          </Text>
          <Text color={theme.faint}> · </Text>
          <Text bold>{settingsLabel(game.settings)}</Text>
          {solo ? <Text color={theme.dim}> · solo</Text> : null}
        </Text>
        <Text> </Text>
        {mine && !solo ? (
          <>
            <Text bold color={mine.place === 1 && mine.status !== 'left' ? theme.success : undefined}>
              {mine.place === 1 && mine.status !== 'left' ? `${icons.flag} You won!` : `You placed ${ordinal(mine.place)} of ${results.length}`}
            </Text>
            <Text> </Text>
          </>
        ) : null}
        <Box>
          <Cell w={8} right={false} color={theme.faint}>
            {''}
          </Cell>
          <Cell w={nameW} right={false} color={theme.faint}>
            PLAYER
          </Cell>
          <Cell w={6} color={theme.faint}>
            WPM
          </Cell>
          <Cell w={7} color={theme.faint}>
            ACC
          </Cell>
          <Cell w={8} color={theme.faint}>
            WORDS
          </Cell>
          {mode !== 'sudden' ? (
            <Cell w={8} color={theme.faint}>
              ERRORS
            </Cell>
          ) : null}
          {showTime ? (
            <Cell w={10} color={theme.faint}>
              {timeLabel}
            </Cell>
          ) : null}
        </Box>
        {results.map((r) => {
          const isMe = r.id === me;
          const color = r.status === 'left' ? theme.faint : isMe ? theme.accent : senderHex(r.id);
          const medal = r.status !== 'left' && !solo ? (MEDALS[r.place - 1] ?? '  ') : '  ';
          return (
            <Box key={r.id}>
              <Box width={8} flexShrink={0}>
                <Text>
                  {medal} <Text color={theme.dim}>{solo ? '' : ordinal(r.place)}</Text>
                </Text>
              </Box>
              <Cell w={nameW} right={false} color={color} bold={isMe}>
                {isMe ? 'You' : r.name}
              </Cell>
              <Cell w={6} bold color={r.status === 'left' ? theme.faint : undefined}>
                {String(Math.round(r.wpm))}
              </Cell>
              <Cell w={7} color={theme.dim}>
                {pct(r.acc)}
              </Cell>
              <Cell w={8} color={theme.dim}>
                {String(r.words)}
              </Cell>
              {mode !== 'sudden' ? (
                <Cell w={8} color={r.errors ? theme.error : theme.dim}>
                  {String(r.errors)}
                </Cell>
              ) : null}
              {showTime ? (
                <Cell w={10} color={theme.dim}>
                  {mode === 'race' && !r.completed ? '–' : duration(r.timeMs)}
                </Cell>
              ) : null}
              <Box marginLeft={2} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end">
                  {isMe && game.newBest ? (
                    <Text color={theme.warning} bold>
                      {icons.star} new best{' '}
                    </Text>
                  ) : null}
                  <Text color={theme.faint}>{statusText(r)}</Text>
                </Text>
              </Box>
            </Box>
          );
        })}
        {rematch ? (
          <>
            <Text> </Text>
            <Text wrap="truncate-end">
              <Text color={theme.accent}>{icons.request} </Text>
              <Text bold>{rematch.hostName}</Text>
              <Text> wants a rematch – {settingsPhrase(rematch.settings)}</Text>
              <Text color={theme.dim}> · enter join · x decline</Text>
            </Text>
          </>
        ) : null}
      </Box>
      <Footer hints={hints} toast={store.toast} width={width} />
    </Box>
  );
}
