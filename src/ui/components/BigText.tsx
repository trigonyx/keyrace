import { Box, Text } from 'ink';

/** Countdown glyphs in the logo's font (ANSI Shadow), 6 rows high. */
const GLYPHS: Record<string, string[]> = {
  '3': ['██████╗ ', '╚════██╗', ' █████╔╝', ' ╚═══██╗', '██████╔╝', '╚═════╝ '],
  '2': ['██████╗ ', '╚════██╗', ' █████╔╝', '██╔═══╝ ', '███████╗', '╚══════╝'],
  '1': [' ██╗', '███║', '╚██║', ' ██║', ' ██║', ' ╚═╝'],
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
};

export const BIG_HEIGHT = 6;

export function bigLines(text: string): string[] {
  const rows: string[] = Array.from({ length: BIG_HEIGHT }, () => '');
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    g.forEach((line, i) => (rows[i] += line + ' '));
  }
  return rows.map((r) => r.trimEnd());
}

export function BigText({ text, color, width }: { text: string; color: string; width: number }) {
  return (
    <Box flexDirection="column" alignItems="center" width={width} flexShrink={0}>
      {bigLines(text).map((l, i) => (
        <Text key={i} color={color}>
          {l}
        </Text>
      ))}
    </Box>
  );
}
