import { Box, Text, useInput } from 'ink';
import { useState, type ReactNode } from 'react';
import type { PickOption, PickOpts } from '../../commands/registry.js';
import { DEFAULT_PARAM, MODE_BLURB, MODE_LABEL, MODES, PARAMS, type Mode, type RaceSettings } from '../../game/types.js';
import { emptyEditor, type EditorState } from '../editor.js';
import { useWheel } from '../mouse.js';
import { icons, theme } from '../theme.js';
import { InputBox } from './InputBox.js';

export type DialogSpec =
  | { kind: 'confirm'; title: string; resolve(ok: boolean): void }
  /** `null` = cancelled, otherwise the (possibly empty) input */
  | { kind: 'prompt'; title: string; hint?: string; initial?: string; resolve(value: string | null): void }
  /** `null` = cancelled, otherwise the chosen ids */
  | { kind: 'pick'; title: string; options: PickOption[]; multi: boolean; opts?: PickOpts; resolve(ids: string[] | null): void }
  /** mode and length of a race; `null` = cancelled */
  | { kind: 'mode'; title: string; initial?: RaceSettings; resolve(s: RaceSettings | null): void };

const PICK_VISIBLE = 8;

export function dialogHeight(d: DialogSpec): number {
  if (d.kind === 'confirm') return 4;
  // border (2) + title + [hint] + input (3) + help line
  if (d.kind === 'prompt') return 7 + (d.hint ? 1 : 0);
  // border (2) + title + modes + help line
  if (d.kind === 'mode') return 4 + MODES.length;
  // border (2) + title + options + help line
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}

/** Prompt at the bottom – replaces the input meanwhile (like confirmations in Claude Code). */
export function Dialog({ spec, width }: { spec: DialogSpec; width: number }) {
  if (spec.kind === 'confirm') return <ConfirmDialog spec={spec} width={width} />;
  if (spec.kind === 'prompt') return <PromptDialog spec={spec} width={width} />;
  if (spec.kind === 'mode') return <ModeDialog spec={spec} width={width} />;
  return <PickDialog spec={spec} width={width} />;
}

function Frame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <Box borderStyle="round" borderColor={theme.accent} paddingX={1} width={width} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  );
}

function ConfirmDialog({ spec, width }: { spec: Extract<DialogSpec, { kind: 'confirm' }>; width: number }) {
  useInput((input, key) => {
    if (key.return || input === 'y') spec.resolve(true);
    else if (key.escape || input === 'n') spec.resolve(false);
  });
  return (
    <Frame width={width}>
      <Text bold wrap="truncate-end">
        {spec.title}
      </Text>
      <Text color={theme.dim}>
        <Text color={theme.accent}>enter</Text>/<Text color={theme.accent}>y</Text> yes · <Text color={theme.accent}>esc</Text>/
        <Text color={theme.accent}>n</Text> cancel
      </Text>
    </Frame>
  );
}

function PromptDialog({ spec, width }: { spec: Extract<DialogSpec, { kind: 'prompt' }>; width: number }) {
  const [state, setState] = useState<EditorState>(() =>
    spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor,
  );
  return (
    <Frame width={width}>
      <Text bold wrap="truncate-end">
        {spec.title}
      </Text>
      {spec.hint ? (
        <Text color={theme.dim} wrap="truncate-end">
          {spec.hint}
        </Text>
      ) : null}
      <InputBox
        state={state}
        onChange={setState}
        onSubmit={(v) => spec.resolve(v.trim())}
        onKey={(_i, key) => {
          if (key.escape) {
            spec.resolve(null);
            return true;
          }
          return false;
        }}
        isActive
        singleLine
        width={width - 4}
      />
      <Text color={theme.dim} wrap="truncate-end">
        enter confirm · esc cancel
      </Text>
    </Frame>
  );
}

/** List selection: ↑↓ move, space toggles (multi), enter confirms, esc cancels. */
function PickDialog({ spec, width }: { spec: Extract<DialogSpec, { kind: 'pick' }>; width: number }) {
  const [cursor, setCursor] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(spec.opts?.preselect ?? []));
  const n = spec.options.length;
  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(n - 1, c + dir))));

  useInput((input, key) => {
    if (key.escape) return spec.resolve(null);
    if (key.upArrow || input === 'k') return setCursor((c) => (c - 1 + n) % n);
    if (key.downArrow || input === 'j') return setCursor((c) => (c + 1) % n);
    const current = spec.options[cursor];
    if (input === ' ' && spec.multi && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (key.return) {
      if (!spec.multi) return spec.resolve(current ? [current.id] : []);
      if (chosen.size) return spec.resolve(spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id));
      // nothing ticked → take the highlighted one, like most pickers do (unless empty is a valid answer)
      spec.resolve(spec.opts?.emptyOk || !current ? [] : [current.id]);
    }
  });

  const start = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start, start + PICK_VISIBLE);
  return (
    <Frame width={width}>
      <Text bold wrap="truncate-end">
        {spec.title}
        {spec.multi && chosen.size ? <Text color={theme.dim}> · {chosen.size} selected</Text> : null}
      </Text>
      {visible.map((o, i) => {
        const active = start + i === cursor;
        const box = spec.multi ? (chosen.has(o.id) ? '[x] ' : '[ ] ') : '';
        return (
          <Text key={o.id} wrap="truncate-end">
            <Text color={theme.accent}>{active ? `${icons.pointer} ` : '  '}</Text>
            <Text color={chosen.has(o.id) ? theme.success : theme.dim}>{box}</Text>
            <Text bold={active} color={active ? theme.accent : undefined}>
              {o.label}
            </Text>
            {o.hint ? <Text color={theme.faint}> · {o.hint}</Text> : null}
          </Text>
        );
      })}
      <Text color={theme.dim} wrap="truncate-end">
        {spec.multi
          ? `↑↓ move · space select · enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ''} · esc cancel`
          : '↑↓ move · enter choose · esc cancel'}
      </Text>
    </Frame>
  );
}

/** Mode list with the length of each: ↑↓ picks the mode, ←→ its length, enter confirms. */
function ModeDialog({ spec, width }: { spec: Extract<DialogSpec, { kind: 'mode' }>; width: number }) {
  const [cursor, setCursor] = useState(() => Math.max(0, MODES.indexOf(spec.initial?.mode ?? 'sprint')));
  const [params, setParams] = useState<Record<Mode, number>>(() => ({
    ...DEFAULT_PARAM,
    ...(spec.initial ? { [spec.initial.mode]: spec.initial.param } : {}),
  }));
  const n = MODES.length;
  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(n - 1, c + dir))));

  useInput((input, key) => {
    if (key.escape) return spec.resolve(null);
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
    if (key.return) spec.resolve({ mode, param: params[mode] });
  });

  const lengthLabel = (mode: Mode, param: number) => (mode === 'sprint' ? `${param}s` : mode === 'race' ? `${param} words` : '');
  return (
    <Frame width={width}>
      <Text bold wrap="truncate-end">
        {spec.title}
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
    </Frame>
  );
}
