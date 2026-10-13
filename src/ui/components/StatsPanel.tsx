import { Box, Text } from 'ink';
import type { AppStore, FriendView } from '../../core/store.js';
import { ordinal } from '../../game/scoring.js';
import { bestKey, type Best } from '../../game/stats.js';
import { PARAMS, settingsLabel, type Mode } from '../../game/types.js';
import { duration, pct, shortTime } from '../format.js';
import { theme } from '../theme.js';

const Title = ({ children }: { children: string }) => (
  <Text color={theme.dim} bold>
    {children.toUpperCase()}
  </Text>
);

/** Best run of a mode over all its lengths (sprint/race: WPM, sudden death: survival). */
function bestOf(store: AppStore, mode: Mode): { param: number; best: Best } | null {
  let out: { param: number; best: Best } | null = null;
  for (const param of PARAMS[mode]) {
    const b = store.stats().bests.get(bestKey(mode, param));
    if (!b) continue;
    const better = !out || (mode === 'sudden' ? b.timeMs > out.best.timeMs : b.wpm > out.best.wpm);
    if (better) out = { param, best: b };
  }
  return out;
}

function Row({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <Box width={width}>
      <Box width={Math.min(16, Math.floor(width / 2))} flexShrink={0}>
        <Text color={theme.dim} wrap="truncate-end">
          {label}
        </Text>
      </Box>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}

/** Rows the panel takes, border included (for the layout math). */
export function panelHeight(store: AppStore, friend: FriendView | null, compact: boolean): number {
  if (friend) {
    const h = store.stats().h2h.get(friend.id);
    if (!h) return compact ? 4 : 5;
    if (compact) return h.last ? 6 : 4;
    return 2 + 1 + 1 + 1 + 1 + 2 + (h.last ? 3 : 0);
  }
  if (compact) return 6;
  const leaders = Math.min(5, store.leaderboard().length);
  return 10 + (leaders > 1 ? 2 + leaders : 0);
}

/**
 * Right of the list (or below it when narrow): your stats, bests and a friends leaderboard –
 * or, with a friend selected, the head-to-head against them.
 */
export function StatsPanel({ store, friend, width, compact }: { store: AppStore; friend: FriendView | null; width: number; compact: boolean }) {
  const inner = width - 4;
  const stats = store.stats();
  if (friend) {
    const h = stats.h2h.get(friend.id);
    const name = friend.display;
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width={width} flexShrink={0}>
        <Title>{`You vs ${name}`}</Title>
        {!h ? (
          <>
            <Text color={theme.dim} wrap="truncate-end">
              No races together yet.
            </Text>
            {!compact ? (
              <Text color={theme.dim} wrap="truncate-end">
                Press enter to invite {name}.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text wrap="truncate-end">
              <Text color={theme.dim}>you </Text>
              <Text bold color={h.wins >= h.losses ? theme.success : undefined}>
                {h.wins}
              </Text>
              <Text color={theme.dim}> : </Text>
              <Text bold color={h.losses > h.wins ? theme.error : undefined}>
                {h.losses}
              </Text>
              <Text color={theme.dim}> {name}</Text>
            </Text>
            {!compact ? (
              <>
                <Text color={theme.faint}>
                  {h.races} {h.races === 1 ? 'race' : 'races'} together
                </Text>
                <Text> </Text>
                <Row label="Your best" value={`${Math.round(h.myBestWpm)} wpm`} width={inner} />
                <Row label={`${name}'s best`} value={`${Math.round(h.theirBestWpm)} wpm`} width={inner} />
              </>
            ) : null}
            {h.last ? (
              <>
                {!compact ? <Text> </Text> : null}
                <Text color={theme.dim} wrap="truncate-end">
                  Last duel · {settingsLabel(h.last)}
                </Text>
                <Text wrap="truncate-end">
                  you {ordinal(h.last.myPlace)} · {name} {ordinal(h.last.theirPlace)}
                  <Text color={theme.faint}> · {shortTime(h.last.ts)}</Text>
                </Text>
              </>
            ) : null}
          </>
        )}
      </Box>
    );
  }

  const sprint = bestOf(store, 'sprint');
  const race = bestOf(store, 'race');
  const sudden = bestOf(store, 'sudden');
  const leaders = store.leaderboard().slice(0, 5);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width={width} flexShrink={0}>
      <Title>Your stats</Title>
      <Text wrap="truncate-end">
        <Text bold>{stats.races}</Text>
        <Text color={theme.dim}> {stats.races === 1 ? 'race' : 'races'} · </Text>
        <Text bold>{stats.wins}</Text>
        <Text color={theme.dim}> {stats.wins === 1 ? 'win' : 'wins'}</Text>
        {stats.races ? <Text color={theme.dim}> ({pct(stats.winRate)})</Text> : null}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {stats.solo} solo · {stats.avgAcc === null ? 'no runs yet' : `${pct(stats.avgAcc)} avg accuracy`}
      </Text>
      {compact ? (
        <Text color={theme.dim} wrap="truncate-end">
          best {stats.bestWpm ? `${Math.round(stats.bestWpm)} wpm` : '–'} · /stats for more
        </Text>
      ) : (
        <>
          <Text> </Text>
          <Title>Personal bests</Title>
          <Row label={sprint ? `Sprint ${sprint.param}s` : 'Sprint'} value={sprint ? `${Math.round(sprint.best.wpm)} wpm` : '–'} width={inner} />
          <Row
            label={race ? `Race ${race.param}` : 'Race'}
            value={race ? `${Math.round(race.best.wpm)} wpm · ${duration(race.best.timeMs)}` : '–'}
            width={inner}
          />
          <Row label="Sudden Death" value={sudden ? `${duration(sudden.best.timeMs)} survived` : '–'} width={inner} />
          {leaders.length > 1 ? (
            <>
              <Text> </Text>
              <Title>Leaderboard · best wpm</Title>
              {leaders.map((r, i) => (
                <Box key={r.id} width={inner}>
                  <Box width={3} flexShrink={0}>
                    <Text color={theme.faint}>{i + 1}.</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text bold={r.isMe} color={r.isMe ? theme.accent : undefined} wrap="truncate-end">
                      {r.isMe ? 'You' : r.name}
                    </Text>
                  </Box>
                  <Box flexShrink={0} marginLeft={1}>
                    <Text>{Math.round(r.bestWpm)}</Text>
                  </Box>
                </Box>
              ))}
            </>
          ) : null}
        </>
      )}
    </Box>
  );
}
