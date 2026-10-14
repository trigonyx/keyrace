import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { DialogFrame, type DialogSpec } from 'termcore/ui/components/Dialog';
import { useWheel } from 'termcore/ui/mouse';
import { icons, theme } from 'termcore/ui/theme';
import { DEFAULT_PARAM, MODE_BLURB, MODE_LABEL, MODES, PARAMS, type Mode, type RaceSettings } from '../../game/types.js';

/** keyrace's own dialog: mode and length of a race (`null` = cancelled). */
export function modeDialog(title: string, initial: RaceSettings | undefined, resolve: (s: RaceSettings | null) => void): DialogSpec {
  return {
    kind: 'custom',
    // border (2) + title + modes + help line
    height: 4 + MODES.length,
    render: (width) => <ModeDialog title={title} initial={initial} resolve={resolve} width={width} />,
  };
}

/** Mode list with the length of each: ↑↓ picks the mode, ←→ its length, enter confirms. */
function ModeDialog({ title, initial, resolve, width }: { title: string; initial?: RaceSettings; resolve(s: RaceSettings | null): void; width: number }) {
  const [cursor, setCursor] = useState(() => Math.max(0, MODES.indexOf(initial?.mode ?? 'sprint')));
  const [params, setParams] = useState<Record<Mode, number>>(() => ({
    ...DEFAULT_PARAM,
    ...(initial ? { [initial.mode]: initial.param } : {}),
  }));
  const n = MODES.length;
  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(n - 1, c + dir))));

  useInput((input, key) => {
    if (key.escape) return resolve(null);
    if (key.upArrow || input === 'k') return setCursor((c) => (c - 1 + n) % n);
    if (key.downArrow || input === 'j') return setCursor((c) => (c + 1) % n);
    const mode = MODES[cursor]!;
    const list = PARAMS[mode];
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
      const d = key.leftArrow || input === 'h' ? -1 : 1;
      const i = list.indexOf(params[mode]);
      setParams((p) => ({ ...p, [mode]: list[Math.max(0, Math.min(list.length - 1, i + d))]! }));
      return;
    }
    if (key.return) resolve({ mode, param: params[mode] });
  });

  const lengthLabel = (mode: Mode, param: number) => (mode === 'sprint' ? `${param}s` : mode === 'race' ? `${param} words` : '');
  return (
    <DialogFrame width={width}>
      <Text bold wrap="truncate-end">
        {title}
      </Text>
      {MODES.map((mode, i) => {
        const active = i === cursor;
        const list = PARAMS[mode];
        const value = params[mode];
        const idx = list.indexOf(value);
        const len = lengthLabel(mode, value);
        return (
          <Box key={mode}>
            <Box width={2} flexShrink={0}>
              <Text color={theme.accent}>{active ? icons.pointer : ' '}</Text>
            </Box>
            <Box width={14} flexShrink={0}>
              <Text bold={active} color={active ? theme.accent : undefined}>
                {MODE_LABEL[mode]}
              </Text>
            </Box>
            <Box width={14} flexShrink={0}>
              {len ? (
                <Text>
                  <Text color={active && idx > 0 ? theme.accent : theme.faint}>‹ </Text>
                  <Text bold={active}>{len}</Text>
                  <Text color={active && idx < list.length - 1 ? theme.accent : theme.faint}> ›</Text>
                </Text>
              ) : null}
            </Box>
            <Text color={theme.dim} wrap="truncate-end">
              {MODE_BLURB[mode]}
            </Text>
          </Box>
        );
      })}
      <Text color={theme.dim} wrap="truncate-end">
        ↑↓ mode · ←→ length · enter next · esc cancel
      </Text>
    </DialogFrame>
  );
}
