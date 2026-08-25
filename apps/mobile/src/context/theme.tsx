import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import {
    DARK_COLORS,
    GRADIENTS,
    LIGHT_COLORS,
    OIH_TOKENS,
    cardShadow,
    type ThemeColors,
} from '@/constants/oih-theme';

const STORAGE_KEY = 'oih.themeMode';

/** User preference. `system` follows the OS setting. */
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeValue {
  /** The stored preference. */
  mode: ThemeMode;
  /** The palette actually in effect once `system` is resolved. */
  scheme: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  gradients: typeof GRADIENTS.light | typeof GRADIENTS.dark;
  radius: typeof OIH_TOKENS.radius;
  spacing: typeof OIH_TOKENS.spacing;
  shadow: { card: ReturnType<typeof cardShadow> };
  setMode: (mode: ThemeMode) => void;
  /** Flips between light and dark, resolving `system` first. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Light is the product default; `system` is opt-in.
  const [mode, setModeState] = useState<ThemeMode>('light');

  // Restore the saved preference on start.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setModeState(saved);
        }
      })
      .catch(() => {
        // Preference is non-critical; fall back to the default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const toggle = useCallback(() => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setMode]);

  const value = useMemo<ThemeValue>(() => {
    const isDark = scheme === 'dark';
    return {
      mode,
      scheme,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      gradients: isDark ? GRADIENTS.dark : GRADIENTS.light,
      radius: OIH_TOKENS.radius,
      spacing: OIH_TOKENS.spacing,
      shadow: { card: cardShadow(isDark) },
      setMode,
      toggle,
    };
  }, [mode, scheme, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
