/**
 * Orange Invent House brand theme — light + dark palettes.
 *
 * Light mirrors the shipped web platform (shadcn theme, orange #f97316 primary).
 * Dark follows the PRD's specified palette (background #221910, accent #ec7f13).
 * Both expose identical keys so components can switch without branching.
 */

export const LIGHT_COLORS = {
  /** App canvas — subtle gray so white cards lift off it (gray-50). */
  background: '#f9fafb',
  /** Cards, headers, sheets. */
  surface: '#ffffff',
  /** Inputs, muted fills, secondary buttons (gray-100). */
  surfaceAlt: '#f3f4f6',
  /** Hairlines and borders (gray-200). */
  border: '#e5e7eb',
  /** Lighter internal divider (gray-100). */
  divider: '#f3f4f6',
  /** Brand orange (orange-500). */
  accent: '#f97316',
  /** Pressed/hover + accent-on-surface text (orange-600). */
  accentMuted: '#ea580c',
  /** Soft orange wash for active states and icon tiles (orange-50). */
  accentSoft: '#fff7ed',
  /** Primary text (gray-900). */
  text: '#111827',
  /** Secondary text (gray-500). */
  textSecondary: '#6b7280',
  /** Muted / placeholder text (gray-400). */
  textMuted: '#9ca3af',
  /** Field label text (gray-700). */
  label: '#374151',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
  info: '#3b82f6',
  /** Danger-zone card fill + border. */
  dangerBg: '#fffbfb',
  dangerBorder: '#fecaca',
  /** Text/icons on top of the accent. */
  onAccent: '#ffffff',
  /** Skeleton shimmer base. */
  skeleton: '#f3f4f6',
} as const;

export type ThemeColors = { -readonly [K in keyof typeof LIGHT_COLORS]: string };

export const DARK_COLORS: ThemeColors = {
  background: '#221910',
  surface: '#2d2216',
  surfaceAlt: '#3a2c1c',
  border: '#4a3925',
  divider: '#3a2c1c',
  accent: '#ec7f13',
  accentMuted: '#f9a03f',
  accentSoft: '#3a2a17',
  text: '#f5efe6',
  textSecondary: '#c7b8a3',
  textMuted: '#8a7a63',
  label: '#d9cbb8',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#60a5fa',
  dangerBg: '#2a1614',
  dangerBorder: '#5c2626',
  onAccent: '#1a1209',
  skeleton: '#3a2c1c',
};

/** Background gradient stops for auth screens, per mode. */
export const GRADIENTS = {
  light: {
    canvas: ['#fff7ed', '#ffffff', '#fff7ed'] as const,
    accentBar: ['#fb923c', '#ea580c'] as const,
    hero: ['#f97316', '#ea580c'] as const,
  },
  dark: {
    canvas: ['#2a1e12', '#221910', '#2a1e12'] as const,
    accentBar: ['#ec7f13', '#a85a0d'] as const,
    hero: ['#c96a0f', '#8f4a09'] as const,
  },
} as const;

/** Structural tokens — identical across modes. */
export const OIH_TOKENS = {
  radius: { sm: 8, md: 10, lg: 14, xl: 20, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
} as const;

/**
 * Back-compat static export (light palette). Prefer `useTheme()` for anything
 * that must react to the active mode.
 */
export const OIH = {
  colors: LIGHT_COLORS,
  ...OIH_TOKENS,
  shadow: {
    card: {
      shadowColor: '#111827',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  },
} as const;

/** Card shadow tuned per mode — dark UIs need depth from borders, not shadows. */
export function cardShadow(isDark: boolean) {
  return isDark
    ? {
        shadowColor: '#000000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }
    : {
        shadowColor: '#111827',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      };
}

type Pill = { bg: string; fg: string; label: string };

/** Status → soft pill colors, mirroring the web's rounded-full badges. */
const STATUS_LIGHT: Record<string, Pill> = {
  pending: { bg: '#f3f4f6', fg: '#4b5563', label: 'Pending' },
  in_progress: { bg: '#dbeafe', fg: '#1d4ed8', label: 'In Progress' },
  /** Reports use a hyphen where tasks use an underscore. */
  'in-progress': { bg: '#dbeafe', fg: '#1d4ed8', label: 'In Progress' },
  completed: { bg: '#dcfce7', fg: '#15803d', label: 'Completed' },
  done: { bg: '#dcfce7', fg: '#15803d', label: 'Done' },
  overdue: { bg: '#fee2e2', fg: '#b91c1c', label: 'Overdue' },
};

const STATUS_DARK: Record<string, Pill> = {
  pending: { bg: '#3a2c1c', fg: '#c7b8a3', label: 'Pending' },
  in_progress: { bg: '#1c2f4a', fg: '#7cb2f8', label: 'In Progress' },
  'in-progress': { bg: '#1c2f4a', fg: '#7cb2f8', label: 'In Progress' },
  completed: { bg: '#17351f', fg: '#6ee79b', label: 'Completed' },
  done: { bg: '#17351f', fg: '#6ee79b', label: 'Done' },
  overdue: { bg: '#3f1c1c', fg: '#fca5a5', label: 'Overdue' },
};

export function statusStyle(status: string, isDark: boolean): Pill {
  const table = isDark ? STATUS_DARK : STATUS_LIGHT;
  return (
    table[status] ?? {
      bg: isDark ? DARK_COLORS.surfaceAlt : LIGHT_COLORS.surfaceAlt,
      fg: isDark ? DARK_COLORS.textSecondary : LIGHT_COLORS.textSecondary,
      label: status.replace(/_/g, ' '),
    }
  );
}

/** Back-compat static status table (light). */
export const STATUS_STYLE = STATUS_LIGHT;

/** Priority → accent color, matching the web. */
export const PRIORITY_COLOR = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#16a34a',
} as const;

const PRIORITY_DARK = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#60a5fa',
  low: '#4ade80',
} as const;

export function priorityColor(priority: string, isDark: boolean): string {
  const table = isDark ? PRIORITY_DARK : PRIORITY_COLOR;
  return table[priority as keyof typeof table] ?? (isDark ? DARK_COLORS.textSecondary : LIGHT_COLORS.textSecondary);
}

/** Chart palette per mode. */
export const CHART_COLORS = {
  completed: '#f97316',
  in_progress: '#3b82f6',
  review: '#eab308',
  blocked: '#ef4444',
  created: '#3b82f6',
} as const;

export function chartColors(isDark: boolean) {
  return isDark
    ? { completed: '#ec7f13', in_progress: '#60a5fa', review: '#fbbf24', blocked: '#f87171', created: '#60a5fa', idle: '#4a3925' }
    : { completed: '#f97316', in_progress: '#3b82f6', review: '#eab308', blocked: '#ef4444', created: '#3b82f6', idle: '#d1d5db' };
}
