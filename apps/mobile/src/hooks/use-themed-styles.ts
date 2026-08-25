import { useMemo } from 'react';

import type { ThemeColors } from '@/constants/oih-theme';
import { OIH_TOKENS } from '@/constants/oih-theme';
import { useTheme } from '@/context/theme';

export interface StyleFactoryArgs {
  c: ThemeColors;
  isDark: boolean;
  radius: typeof OIH_TOKENS.radius;
  spacing: typeof OIH_TOKENS.spacing;
  shadow: { card: object };
}

/**
 * Builds a StyleSheet from the active palette and memoises it per theme change.
 *
 * Usage:
 *   const makeStyles = ({ c, spacing }) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (args: StyleFactoryArgs) => T): T {
  const { colors, isDark, radius, spacing, shadow } = useTheme();
  return useMemo(
    () => factory({ c: colors, isDark, radius, spacing, shadow }),
    [factory, colors, isDark, radius, spacing, shadow],
  );
}
