import { Box, Text } from 'ink';
import type { Animations } from 'termcore/store/files';
import { Logo } from 'termcore/ui/components/Logo';
import { icons, theme } from 'termcore/ui/theme';

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

/** Big logo only where it fits comfortably. */
export function bannerCompact(width: number, rows: number): boolean {
  return width < 80 || rows < 22;
}

/** Rows the banner takes (logo, gap, action line, gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 3;
}

export type BannerChoice = 'race' | 'solo';

/** The dashboard's eye-catcher: the logo, and below it the two actions (←→ switches). */
export function Banner({
  width,
  compact,
  selected,
  animate = true,
  mode = 'brief',
}: {
  width: number;
  compact: boolean;
  selected: BannerChoice | null;
  animate?: boolean;
  /** animations from settings.json: the glint plays always, twice, or never */
  mode?: Animations;
}) {
  const race = selected === 'race';
  const solo = selected === 'solo';
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      <Logo lines={compact ? LOGO_SMALL : LOGO} animate={animate} mode={mode} />
      <Text> </Text>
      <Box>
        <Text color={theme.accent}>{race ? `${icons.pointer} ` : '  '}</Text>
        <Text backgroundColor={race ? theme.accent : undefined} color={race ? theme.onAccent : theme.accent} bold>
          {` ${icons.racing} Start a race `}
        </Text>
        {/* "enter" sits next to whichever action it triggers; the line keeps its width */}
        <Text color={theme.dim}>{solo ? '      ' : ' enter'}</Text>
        <Text color={theme.faint}>{'   '}</Text>
        <Text color={theme.accent}>{solo ? `${icons.pointer} ` : '  '}</Text>
        <Text backgroundColor={solo ? theme.accent : undefined} color={solo ? theme.onAccent : undefined} bold={solo}>
          {' Solo practice '}
        </Text>
        <Text color={theme.dim}>{solo ? ' enter' : ' s    '}</Text>
      </Box>
      <Text> </Text>
    </Box>
  );
}
