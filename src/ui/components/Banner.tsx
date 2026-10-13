import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useEffect, useState } from 'react';
import { shineLine, SHINE_SWEEP } from '../effects.js';
import { icons, theme } from '../theme.js';

/** "KEYRACE" in the ANSI Shadow figlet font: 57 columns, 6 rows. */
export const LOGO = [
  '██╗  ██╗███████╗██╗   ██╗██████╗  █████╗  ██████╗███████╗',
  '██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██╔════╝',
  '█████╔╝ █████╗   ╚████╔╝ ██████╔╝███████║██║     █████╗  ',
  '██╔═██╗ ██╔══╝    ╚██╔╝  ██╔══██╗██╔══██║██║     ██╔══╝  ',
  '██║  ██╗███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗',
  '╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝',
];

/** Compact variant for narrow or short terminals: 27 columns, 2 rows. */
export const LOGO_SMALL = ['█▄▀ █▀▀ █▄█ █▀█ ▄▀█ █▀▀ █▀▀', '█ █ ██▄  █  █▀▄ █▀█ █▄▄ ██▄'];

const LOGO_WIDTH = stringWidth(LOGO[0]!);

/** Big logo only where it fits comfortably. */
export function bannerCompact(width: number, rows: number): boolean {
  return width < 80 || rows < 22;
}

/** Rows the banner takes (logo, gap, action line, gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 3;
}

/** Plays one shine across the logo shortly after it appears, then rests (no idle redraws). */
function useShine(delay = 250): number {
  const [t, setT] = useState(-1);
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const start = setTimeout(() => {
      const t0 = Date.now();
      timer = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt >= SHINE_SWEEP) {
          if (timer) clearInterval(timer);
          timer = null;
          setT(SHINE_SWEEP);
        } else setT(dt);
      }, 33);
    }, delay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [delay]);
  return t;
}

/** The dashboard's eye-catcher: the logo, and below it the main action. */
export function Banner({ width, compact, selected }: { width: number; compact: boolean; selected: boolean }) {
  const t = useShine();
  const logo = compact ? LOGO_SMALL : LOGO;
  const logoWidth = compact ? stringWidth(LOGO_SMALL[0]!) : LOGO_WIDTH;
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      {logo.map((line, i) => (
        <Text key={i}>{shineLine(line, i, logoWidth, theme.accent, t)}</Text>
      ))}
      <Text> </Text>
      <Box>
        <Text color={theme.accent}>{selected ? `${icons.pointer} ` : '  '}</Text>
        <Text backgroundColor={selected ? theme.accent : undefined} color={selected ? '#1E1E1E' : theme.accent} bold>
          {` ${icons.racing} Start a race `}
        </Text>
        <Text color={theme.dim}> enter</Text>
        <Text color={theme.faint}>{'    '}</Text>
        <Text>Solo practice</Text>
        <Text color={theme.dim}> s</Text>
      </Box>
      <Text> </Text>
    </Box>
  );
}
