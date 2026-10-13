import { Box, Text, useInput } from 'ink';
import type { AppStore } from '../../core/store.js';
import { wallWpm } from '../../game/engine.js';
import type { Game } from '../../game/session.js';
import { runLimitMs, settingsLabel } from '../../game/types.js';
import type { Actions } from '../actions.js';
import { BIG_HEIGHT, BigText } from '../components/BigText.js';
import { Dialog, type DialogSpec } from '../components/Dialog.js';
import { Footer } from '../components/Footer.js';
import { barRows, ProgressBars } from '../components/ProgressBars.js';
import { TEXT_LINES, TypingText } from '../components/TypingText.js';
import { clockDown, duration, pct } from '../format.js';
import { useTicker } from '../hooks.js';
import { icons, theme } from '../theme.js';

interface Props {
  store: AppStore;
  game: Game;
  width: number;
  height: number;
  actions: Actions;
  dialog: DialogSpec | null;
}

/** Text area: tall enough for the countdown digits, so nothing moves at GO. */
const AREA = Math.max(BIG_HEIGHT, TEXT_LINES + 2);
const GO_MS = 900;

/** Danger bar for sudden death: fills up as the wall gets closer (10 words ahead = empty). */
function WallBar({ gap, wpm, width }: { gap: number; wpm: number; width: number }) {
  const words = gap / 5;
  const danger = Math.max(0, Math.min(1, 1 - words / 10));
  const barWidth = Math.max(6, Math.min(24, width - 44));
  const filled = Math.round(danger * barWidth);
  const color = danger > 0.75 ? theme.error : danger > 0.45 ? theme.warning : theme.success;
  const ahead = words >= 1 ? `you're ${Math.floor(words)} ${Math.floor(words) === 1 ? 'word' : 'words'} ahead` : "it's right behind you!";
  return (
    <Text wrap="truncate-end">
      <Text color={theme.dim}>wall </Text>
      <Text bold>{wpm ? `${wpm} wpm` : 'waiting'}</Text>
      <Text color={theme.faint}> ▕</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color={theme.border}>{'░'.repeat(barWidth - filled)}</Text>
      <Text color={theme.faint}>▏ </Text>
      <Text color={wpm ? color : theme.dim}>{wpm ? ahead : 'starts in a moment'}</Text>
    </Text>
  );
}

export function Race({ store, game, width, height, actions, dialog }: Props) {
  const e = game.engine!;
  // the clock, the wall and others' bars move without keystrokes
  useTicker(100, !e.ended || game.role !== 'solo');
  e.update();
  const me = store.identity.id;
  const elapsed = e.elapsed();
  const limit = runLimitMs(game.settings);
  const { mode, param } = game.settings;

  useInput(
    (input, key) => {
      if (key.escape) {
        const question =
          game.role === 'host'
            ? 'Give up? The race ends for everyone – you are the host.'
            : game.role === 'solo'
              ? 'Stop this practice run?'
              : 'Give up this race? It counts as not finished.';
        void actions.confirm(question).then((ok) => ok && store.games.leave());
        return;
      }
      if ((key.backspace || key.delete) && key.meta) return store.games.deleteWord();
      // ctrl+backspace arrives as ^H in most terminals, plain backspace as DEL
      if (key.backspace) return store.games.deleteWord();
      if (key.delete) return store.games.backspace();
      if (key.ctrl && input === 'w') return store.games.deleteWord();
      if (key.ctrl || key.meta || key.return || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
      if (input) store.games.input(input);
    },
    { isActive: !dialog },
  );

  const textWidth = Math.min(width - 4, 76);
  const rows = barRows(game, me, elapsed);
  const showGo = e.status === 'racing' && elapsed < GO_MS;

  // ── own stats line ──
  const wpm = Math.round(e.wpm());
  const parts: string[] = [];
  if (mode === 'sprint') parts.push(`${clockDown(limit - Math.max(0, elapsed))} left`);
  else if (mode === 'race') parts.push(`${e.correctWords}/${param} words`, duration(Math.max(0, elapsed)));
  else parts.push(`${duration(Math.max(0, elapsed))} survived`);
  const statLine = (
    <Text wrap="truncate-end">
      <Text bold>{parts[0]}</Text>
      {parts[1] ? <Text color={theme.dim}> · {parts[1]}</Text> : null}
      <Text color={theme.faint}> · </Text>
      <Text bold color={theme.accent}>
        {wpm}
      </Text>
      <Text color={theme.dim}> wpm · {pct(e.accuracy())} acc</Text>
      {mode !== 'race' ? <Text color={theme.dim}> · {e.correctWords} words</Text> : null}
      {mode !== 'sudden' ? (
        <Text color={e.errors ? theme.error : theme.dim}>
          {' '}
          · {e.errors} {e.errors === 1 ? 'error' : 'errors'}
        </Text>
      ) : null}
    </Text>
  );

  // ── the text area: countdown, the text, or how our run ended ──
  let area;
  if (e.status === 'countdown') {
    const n = Math.ceil(-elapsed / 1000);
    area = <BigText text={String(Math.max(1, Math.min(3, n)))} color={theme.accent} width={width - 2} />;
  } else if (e.ended) {
    const waiting = game.role !== 'solo' && game.racers.some((r) => !r.left && r.id !== me && r.progress?.status === 'racing');
    const headline =
      e.status === 'out'
        ? e.outReason === 'wall'
          ? `${icons.error} The wall caught you after ${duration(e.endedAt ?? 0)}`
          : `${icons.error} Out – a typo after ${duration(e.endedAt ?? 0)}`
        : mode === 'race' && !e.completed
          ? `Time's up – ${e.correctWords} of ${param} words`
          : `${icons.flag} Finished – ${wpm} wpm`;
    area = (
      <Box flexDirection="column" alignItems="center" width={width - 2}>
        <Text bold color={e.status === 'out' ? theme.error : theme.success}>
          {headline}
        </Text>
        <Text color={theme.dim}>{waiting ? 'Waiting for the others …' : 'Tallying the results …'}</Text>
      </Box>
    );
  } else {
    area = <TypingText engine={e} width={textWidth} active={!dialog} />;
  }

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        <Box width={width - 2} flexShrink={0}>
          <Box flexGrow={1}>
            <Text color={theme.dim} bold>
              {settingsLabel(game.settings).toUpperCase()}
              {game.role === 'solo' ? ' · SOLO' : ''}
            </Text>
          </Box>
          {showGo ? (
            <Text color={theme.accent} bold>
              GO!
            </Text>
          ) : null}
        </Box>
        <Text> </Text>
        {game.role !== 'solo' ? (
          <>
            <ProgressBars rows={rows} width={width - 2} />
            <Text> </Text>
          </>
        ) : null}
        <Box height={AREA} flexDirection="column" justifyContent="center" alignItems="center" flexShrink={0}>
          {area}
        </Box>
        <Text> </Text>
        <Box flexDirection="column" alignItems="center" width={width - 2} flexShrink={0}>
          {e.status === 'countdown' ? <Text color={theme.dim}>get ready …</Text> : statLine}
          {mode === 'sudden' && e.status === 'racing' ? <WallBar gap={e.wallGap()} wpm={wallWpm(elapsed)} width={width - 2} /> : null}
        </Box>
      </Box>
      {dialog ? <Dialog spec={dialog} width={width} /> : null}
      <Footer
        hints={e.ended ? ['esc leave'] : ['type the words', 'space next word', 'backspace fix', 'esc give up']}
        toast={store.toast}
        width={width}
      />
    </Box>
  );
}
