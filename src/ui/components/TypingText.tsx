import chalk from 'chalk';
import { Box, Text } from 'ink';
import type { TypingEngine } from '../../game/engine.js';
import { theme } from '../theme.js';

export const TEXT_LINES = 4;

interface Placed {
  index: number;
  width: number;
}

/**
 * Breaks the words into lines of `width` columns. Finished and current words take as much
 * room as was typed (extra characters push the line), upcoming words their own length.
 */
export function layoutWords(engine: Pick<TypingEngine, 'words' | 'index' | 'typed' | 'done'>, width: number): Placed[][] {
  const lines: Placed[][] = [[]];
  let used = 0;
  // only a few lines past the current word are ever shown
  let lineOfCurrent = -1;
  for (let i = 0; i < engine.words.length; i++) {
    const word = engine.words[i]!;
    const typed = i < engine.index ? (engine.done[i]?.typed ?? '') : i === engine.index ? engine.typed : '';
    const w = Math.max(word.length, typed.length);
    if (used > 0 && used + w > width) {
      lines.push([]);
      used = 0;
      if (lineOfCurrent >= 0 && lines.length > lineOfCurrent + TEXT_LINES) break;
    }
    lines[lines.length - 1]!.push({ index: i, width: w });
    used += w + 1;
    if (i === engine.index) lineOfCurrent = lines.length - 1;
  }
  return lines;
}

/** Which lines to show: the previous one, the current one and the next ones. */
export function visibleLines(lines: Placed[][], current: number): { start: number; end: number } {
  const lineOfCurrent = Math.max(0, lines.findIndex((l) => l.some((p) => p.index === current)));
  const start = Math.max(0, Math.min(lineOfCurrent - 1, lines.length - TEXT_LINES));
  return { start, end: start + TEXT_LINES };
}

const col = {
  done: chalk.hex(theme.faint),
  wrong: chalk.hex(theme.error),
  extra: chalk.hex('#A8505A'),
  typed: chalk.hex(theme.typed).bold,
  todo: chalk.hex(theme.text),
};

function renderWord(engine: Pick<TypingEngine, 'words' | 'index' | 'typed' | 'done'>, i: number, showCursor: boolean): string {
  const word = engine.words[i]!;
  if (i > engine.index) return col.todo(word);
  if (i < engine.index) {
    const d = engine.done[i];
    if (!d || d.correct) return col.done(word);
    // wrong word: what was typed against the word, red and underlined
    let out = '';
    for (let j = 0; j < Math.max(word.length, d.typed.length); j++) {
      if (j < word.length) out += j < d.typed.length && d.typed[j] === word[j] ? col.done(word[j]!) : col.wrong(word[j]!);
      else out += col.extra(d.typed[j]!);
    }
    return chalk.underline(out);
  }
  const typed = engine.typed;
  let out = '';
  for (let j = 0; j < Math.max(word.length, typed.length); j++) {
    const atCursor = showCursor && j === typed.length;
    let ch: string;
    if (j < word.length) {
      ch = j < typed.length ? (typed[j] === word[j] ? col.typed(word[j]!) : col.wrong(word[j]!)) : col.todo(word[j]!);
    } else ch = col.extra(typed[j]!);
    out += atCursor ? chalk.inverse(ch) : ch;
  }
  return out;
}

/**
 * The text to type, monkeytype style: typed words dimmed, wrong ones red and underlined,
 * the current word colored character by character with a block cursor, then what's next.
 * Scrolls line by line.
 */
export function TypingText({ engine, width, active }: { engine: TypingEngine; width: number; active: boolean }) {
  const lines = layoutWords(engine, width);
  const { start, end } = visibleLines(lines, engine.index);
  const cursorAtEnd = active && engine.typed.length >= (engine.words[engine.index]?.length ?? 0);
  const out: string[] = [];
  for (let l = start; l < end; l++) {
    const line = lines[l];
    if (!line) {
      out.push('');
      continue;
    }
    out.push(
      line
        .map((p) => {
          const text = renderWord(engine, p.index, active);
          // the cursor sits on the space after the word once it's fully typed
          const space = p.index === engine.index && cursorAtEnd ? chalk.inverse(' ') : ' ';
          return text + space;
        })
        .join('')
        .replace(/ $/, ''),
    );
  }
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {out.map((l, i) => (
        <Text key={i} wrap="truncate-end">
          {l || ' '}
        </Text>
      ))}
    </Box>
  );
}
