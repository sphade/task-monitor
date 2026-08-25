import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputProps,
    type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { priorityColor, statusStyle } from '@/constants/oih-theme';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';

type IoniconName = keyof typeof Ionicons.glyphMap;

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewProps['style'];
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

/**
 * Card that responds to touch with a subtle scale-down — the affordance that
 * makes list rows feel tactile rather than static.
 */
export function PressableCard({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewProps['style'];
}) {
  const styles = useThemedStyles(makeStyles);
  // useState initializer (not useRef) keeps the value stable without reading a
  // ref during render, which the React Compiler disallows.
  const [scale] = useState(() => new Animated.Value(1));

  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => animate(0.975)}
      onPressOut={() => animate(1)}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** Page title + optional subtitle, used at the top of list screens. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = disabled || loading;
  const contentColor =
    variant === 'primary' || variant === 'danger'
      ? colors.onAccent
      : variant === 'ghost'
        ? colors.accentMuted
        : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && variant === 'primary' && { backgroundColor: colors.accentMuted },
        pressed && variant !== 'primary' && { opacity: 0.7 },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <View style={styles.buttonContent}>
          {!!icon && <Ionicons name={icon} size={17} color={contentColor} />}
          <Text style={[styles.buttonText, { color: contentColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: IoniconName;
}

export function TextField({ label, error, icon, style, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.fieldWrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        {!!icon && <Ionicons name={icon} size={17} color={colors.textMuted} style={styles.inputIcon} />}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            !!icon && { paddingLeft: 38 },
            !!error && { borderColor: colors.danger, backgroundColor: colors.dangerBg },
            style,
          ]}
          {...rest}
        />
      </View>
      {!!error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={12} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

/** Rounded search input with a leading magnifier and clear button. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search…',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.searchRow}>
      <Ionicons name="search" size={17} color={colors.textMuted} style={styles.inputIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={styles.searchInput}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} style={styles.searchClear}>
          <Ionicons name="close-circle" size={17} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

export function Badge({
  label,
  tone = 'info',
}: {
  label: string;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toneColor = {
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    muted: colors.textMuted,
  }[tone];
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

/** Soft filled status pill (matches the web's rounded-full status badges). */
export function StatusPill({ status }: { status: string }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = statusStyle(status, isDark);
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

/** Priority shown as a colored dot + label, mirroring the web's colour coding. */
export function PriorityTag({ priority }: { priority: string }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = priorityColor(priority, isDark);
  return (
    <View style={styles.priorityTag}>
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text style={[styles.priorityText, { color }]}>{priority}</Text>
    </View>
  );
}

/** Circular initials avatar with the brand's soft-orange fill. */
export function Avatar({
  name,
  size = 36,
  solid = false,
}: {
  name?: string;
  size?: number;
  solid?: boolean;
}) {
  const { colors } = useTheme();
  const initials = (name ?? '')
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: solid ? colors.accent : colors.accentSoft,
      }}
    >
      <Text
        style={{
          fontWeight: '700',
          fontSize: size * 0.38,
          color: solid ? colors.onAccent : colors.accentMuted,
        }}
      >
        {initials || '?'}
      </Text>
    </View>
  );
}

/** Rounded square icon tile used to front metric cards and list rows. */
export function IconTile({
  icon,
  color,
  bg,
  size = 38,
}: {
  icon: IoniconName;
  color?: string;
  bg?: string;
  size?: number;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? colors.accentSoft,
      }}
    >
      <Ionicons name={icon} size={size * 0.5} color={color ?? colors.accent} />
    </View>
  );
}

/** Thin progress track, used for sprint/priority style bars. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.trackFill,
          { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color ?? colors.accent },
        ]}
      />
    </View>
  );
}

export function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

/** Floating action button, shared by every list screen. */
export function Fab({
  onPress,
  icon = 'add',
  label,
}: {
  onPress: () => void;
  icon?: IoniconName;
  label?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Create new'}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { backgroundColor: colors.accentMuted }]}
    >
      <Ionicons name={icon} size={26} color={colors.onAccent} />
    </Pressable>
  );
}

/** Friendly empty state with icon, message and optional action. */
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IoniconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={styles.emptyMessage}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <View style={styles.emptyAction}>
          <Button title={actionLabel} onPress={onAction} variant="secondary" icon="add" />
        </View>
      )}
    </View>
  );
}

/** Shimmering placeholder block. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <Animated.View
      style={{ width, height, borderRadius: radius, backgroundColor: colors.skeleton, opacity }}
    />
  );
}

/** Card-shaped skeleton row for list loading states. */
export function SkeletonCard({ lines = 2, avatar = false }: { lines?: number; avatar?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Card>
      <View style={styles.skeletonRow}>
        {avatar && <Skeleton width={36} height={36} radius={18} />}
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="65%" height={13} />
          {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
            <Skeleton key={i} width={i % 2 === 0 ? '85%' : '45%'} height={11} />
          ))}
        </View>
      </View>
    </Card>
  );
}

/** Repeated skeleton cards for a whole loading list. */
export function SkeletonList({ count = 4, avatar = false }: { count?: number; avatar?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} avatar={avatar} />
      ))}
    </View>
  );
}

/** Horizontal segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ c, radius, spacing, shadow }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: spacing.lg, gap: spacing.lg },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.sm,
      ...shadow.card,
    },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    headerTitle: { color: c.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    headerSubtitle: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
    button: {
      height: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    buttonPrimary: { backgroundColor: c.accent },
    buttonSecondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    buttonGhost: { backgroundColor: 'transparent' },
    buttonDanger: { backgroundColor: c.danger },
    buttonText: { fontWeight: '700', fontSize: 15 },
    fieldWrap: { gap: 6 },
    label: { color: c.label, fontSize: 13, fontWeight: '600' },
    inputRow: { justifyContent: 'center' },
    inputIcon: { position: 'absolute', left: 12, zIndex: 1 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 46,
      color: c.text,
      fontSize: 14,
    },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    errorText: { color: c.danger, fontSize: 12 },
    searchRow: { justifyContent: 'center' },
    searchInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.pill,
      paddingLeft: 38,
      paddingRight: 38,
      height: 44,
      color: c.text,
      fontSize: 14,
    },
    searchClear: { position: 'absolute', right: 12, zIndex: 1 },
    badge: {
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    pill: {
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
      alignSelf: 'flex-start',
    },
    pillText: { fontSize: 11, fontWeight: '700' },
    priorityTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    priorityDot: { width: 7, height: 7, borderRadius: 4 },
    priorityText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    track: { height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
    trackFill: { height: 8, borderRadius: 4 },
    divider: { height: 1, backgroundColor: c.divider },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accentMuted,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    empty: { alignItems: 'center', paddingVertical: spacing.xxl * 1.5, paddingHorizontal: spacing.xl },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
    emptyMessage: {
      color: c.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 19,
    },
    emptyAction: { marginTop: spacing.lg, alignSelf: 'stretch' },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    segment: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      padding: 4,
      gap: 4,
    },
    segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
    segmentItemActive: { backgroundColor: c.surface, ...shadow.card },
    segmentText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    segmentTextActive: { color: c.accentMuted },
  });
