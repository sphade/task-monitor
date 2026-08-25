import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Toast, { type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';

import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';

type IoniconName = keyof typeof Ionicons.glyphMap;
type Tone = 'success' | 'error' | 'info';

const ICONS: Record<Tone, IoniconName> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

function ToastCard({ tone, text1, text2 }: { tone: Tone } & ToastConfigParams<unknown>) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const color = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.info;
  // Soft tint behind the icon, derived from the tone.
  const tint = isDark
    ? { success: '#17351f', error: '#3f1c1c', info: '#1c2f4a' }[tone]
    : { success: '#f0fdf4', error: '#fef2f2', info: '#eff6ff' }[tone];

  return (
    <View style={styles.card} accessibilityRole="alert">
      {/* Colored leading edge keeps the status readable at a glance. */}
      <View style={[styles.edge, { backgroundColor: color }]} />
      <View style={[styles.iconWrap, { backgroundColor: tint }]}>
        <Ionicons name={ICONS[tone]} size={19} color={color} />
      </View>
      <View style={styles.textWrap}>
        {!!text1 && (
          <Text style={styles.title} numberOfLines={1}>
            {text1}
          </Text>
        )}
        {!!text2 && (
          <Text style={styles.message} numberOfLines={2}>
            {text2}
          </Text>
        )}
      </View>
    </View>
  );
}

const toastConfig: ToastConfig = {
  success: (params) => <ToastCard tone="success" {...params} />,
  error: (params) => <ToastCard tone="error" {...params} />,
  info: (params) => <ToastCard tone="info" {...params} />,
};

/**
 * Toast root. Lives inside ThemeProvider so the cards pick up the active
 * palette (the config renders themed components).
 */
export function ToastHost() {
  return <Toast config={toastConfig} topOffset={56} />;
}

const makeStyles = ({ c, spacing, radius, shadow }: StyleFactoryArgs) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      width: '92%',
      minHeight: 60,
      paddingRight: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    edge: { width: 5, alignSelf: 'stretch' },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.sm,
    },
    textWrap: { flex: 1, gap: 1 },
    title: { color: c.text, fontSize: 14, fontWeight: '700' },
    message: { color: c.textSecondary, fontSize: 12.5, lineHeight: 17 },
  });
