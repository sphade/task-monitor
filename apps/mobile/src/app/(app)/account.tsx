import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, Screen } from '@/components/ui/kit';
import { useTheme, type ThemeMode } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { useAuthStore } from '@/store/auth';

type IoniconName = keyof typeof Ionicons.glyphMap;

const APPEARANCE: { key: ThemeMode; label: string; icon: IoniconName }[] = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tint = danger ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && onPress && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerBg }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {!!onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function Account() {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const user = session?.user;

  const { colors, gradients, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const confirmLogout = () => {
    Alert.alert('Sign out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <Screen>
      {/* Profile hero */}
      <LinearGradient
        colors={[...gradients.hero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroAvatar}>
          <Avatar name={user?.fullName} size={72} />
        </View>
        <Text style={styles.heroName}>{user?.fullName ?? 'Unknown user'}</Text>
        <Text style={styles.heroEmail}>{user?.email}</Text>
        <View style={styles.heroRole}>
          <Ionicons name="shield-checkmark" size={12} color="#ffffff" />
          <Text style={styles.heroRoleText}>{user?.role ?? '—'}</Text>
        </View>
      </LinearGradient>

      {/* Appearance — light is the product default; dark follows the PRD palette. */}
      <Card style={styles.group}>
        <Text style={styles.groupTitle}>Appearance</Text>
        <View style={styles.themeRow}>
          {APPEARANCE.map((opt) => {
            const active = mode === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${opt.label} theme`}
                onPress={() => setMode(opt.key)}
                style={[styles.themeCard, active && styles.themeCardActive]}
              >
                <View style={[styles.themeIcon, active && { backgroundColor: colors.accent }]}>
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? colors.onAccent : colors.textSecondary}
                  />
                </View>
                <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>{opt.label}</Text>
                {active && (
                  <View style={styles.themeCheck}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Details */}
      <Card style={styles.group}>
        <Text style={styles.groupTitle}>Details</Text>
        <Row icon="business-outline" label="Department" value={user?.department ?? '—'} />
        <Row icon="ellipse" label="Status" value={user?.isActive ? 'Active' : 'Inactive'} last />
      </Card>

      {/* Security */}
      <Card style={styles.group}>
        <Text style={styles.groupTitle}>Security</Text>
        <Row
          icon="key-outline"
          label="Change password"
          onPress={() => router.push('/(app)/change-password')}
          last
        />
      </Card>

      {/* Danger zone */}
      <Card style={styles.group}>
        <Row icon="log-out-outline" label="Sign out" onPress={confirmLogout} danger last />
      </Card>

      <Text style={styles.version}>Orange Invent · Task Management</Text>
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing, isDark }: StyleFactoryArgs) =>
  StyleSheet.create({
    hero: {
      alignItems: 'center',
      borderRadius: radius.xl,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      shadowColor: c.accentMuted,
      shadowOpacity: isDark ? 0.35 : 0.28,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    heroAvatar: {
      padding: 4,
      borderRadius: 44,
      backgroundColor: 'rgba(255,255,255,0.28)',
      marginBottom: spacing.md,
    },
    heroName: { color: '#ffffff', fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
    heroEmail: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
    heroRole: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: spacing.md,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    heroRoleText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
    group: { padding: 0, gap: 0, overflow: 'hidden' },
    groupTitle: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    themeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    themeCard: {
      flex: 1,
      alignItems: 'center',
      gap: 7,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
    },
    themeCardActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
    themeIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    themeLabel: { color: c.textSecondary, fontSize: 12.5, fontWeight: '600' },
    themeLabelActive: { color: c.accentMuted, fontWeight: '700' },
    themeCheck: { position: 'absolute', top: 6, right: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 13,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    rowPressed: { backgroundColor: c.surfaceAlt },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: { color: c.text, fontSize: 14, fontWeight: '600', flex: 1 },
    rowValue: { color: c.textSecondary, fontSize: 13, maxWidth: 140 },
    version: { color: c.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: spacing.xs },
  });
