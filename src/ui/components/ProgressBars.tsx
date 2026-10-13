import { Box, Text } from 'ink';
import type { Game } from '../../game/session.js';
import { ordinal } from '../../game/scoring.js';
import { runLimitMs, wpmOf, type Progress } from '../../game/types.js';
import { icons, senderHex, theme } from '../theme.js';

export interface BarRow {
  id: string;
  name: string;
  isMe: boolean;
  progress: Progress | null;
  left: boolean;
  /** 0..1 */
  fill: number;
  wpm: number;
  label: string;
  labelColor: string;
}

const EMPTY: Progress = { chars: 0, words: 0, errors: 0, keys: 0, correctKeys: 0, idx: 0, status: 'racing', ms: 0 };

/**
 * One row per racer: how far they are, their WPM and their place or status. Our own row
 * uses the live engine; everyone else what the host last relayed.
 */
export function barRows(game: Game, myId: string, elapsed: number): BarRow[] {
  const e = game.engine;
  const { mode, param } = game.settings;
  const rows = game.racers.map((r) => {
    const isMe = r.id === myId;
    const p = (isMe && e ? e.progress() : r.progress) ?? EMPTY;
    return { r, isMe, p };
  });
  const leaderWords = Math.max(1, ...rows.map((x) => x.p.words));
  const leaderChars = Math.max(1, ...rows.map((x) => x.p.chars));
  const timeShare = Math.min(1, Math.max(0, elapsed) / runLimitMs(game.settings));
  // race: finishers by time; sprint: live order by words
  const finishers = rows.filter((x) => x.p.completed).sort((a, b) => a.p.ms - b.p.ms);
  const byWords = [...rows].filter((x) => !x.r.left).sort((a, b) => b.p.words - a.p.words || b.p.chars - a.p.chars);

  return rows.map(({ r, isMe, p }) => {
    let fill: number;
    if (mode === 'race') fill = p.words / param;
    else if (mode === 'sprint') fill = (p.words / leaderWords) * (p.status === 'racing' ? timeShare : 1);
    else fill = p.chars / leaderChars;
    let label = '';
    let labelColor: string = theme.dim;
    if (r.left) {
      label = `${icons.left} left`;
      labelColor = theme.faint;
    } else if (p.status === 'out') {
      label = `${icons.error} out`;
      labelColor = theme.error;
    } else if (mode === 'race' && p.completed) {
      label = `${icons.flag} ${ordinal(finishers.findIndex((x) => x.r.id === r.id) + 1)}`;
      labelColor = theme.success;
    } else if (mode === 'sprint' && p.words > 0) {
      label = ordinal(byWords.findIndex((x) => x.r.id === r.id) + 1);
      if (p.status === 'finished') label = `${icons.flag} ${label}`;
    }
    return {
      id: r.id,
      name: r.name,
      isMe,
      progress: p,
      left: r.left,
      fill: Math.max(0, Math.min(1, fill)),
      wpm: wpmOf(p.chars, isMe && e ? e.elapsed() : p.ms),
      label,
      labelColor,
    };
  });
}

export function ProgressBars({ rows, width }: { rows: BarRow[]; width: number }) {
  const nameWidth = Math.min(16, Math.max(8, ...rows.map((r) => r.name.length + 2)));
  const barWidth = Math.max(8, width - nameWidth - 2 - 9 - 9);
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {rows.map((r) => {
        const filled = Math.round(r.fill * barWidth);
        const color = r.left ? theme.faint : r.isMe ? theme.accent : senderHex(r.id);
        return (
          <Box key={r.id} width={width}>
            <Box width={2} flexShrink={0}>
              <Text color={theme.accent}>{r.isMe ? icons.pointer : ' '}</Text>
            </Box>
            <Box width={nameWidth} flexShrink={0}>
              <Text color={r.left ? theme.faint : color} bold={r.isMe} wrap="truncate-end">
                {r.isMe ? 'You' : r.name}
              </Text>
            </Box>
            <Text>
              <Text color={color}>{'━'.repeat(filled)}</Text>
              <Text color={theme.border}>{'─'.repeat(barWidth - filled)}</Text>
            </Text>
            <Box width={9} flexShrink={0} justifyContent="flex-end">
              <Text color={r.isMe ? undefined : theme.dim} bold={r.isMe}>
                {Math.round(r.wpm)}
              </Text>
              <Text color={theme.faint}> wpm</Text>
            </Box>
            <Box width={9} flexShrink={0} paddingLeft={1}>
              <Text color={r.labelColor} wrap="truncate-end">
                {r.label}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
