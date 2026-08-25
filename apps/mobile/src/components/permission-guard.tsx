import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import type { KnownPermission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface PermissionGuardProps {
  /** Require all of these permissions. */
  require?: KnownPermission[];
  /** Require any one of these permissions. */
  anyOf?: KnownPermission[];
  children: ReactNode;
  /** Rendered when access is denied. Defaults to null (hidden). */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 * Used both to hide action buttons and to gate whole screens (PRD RBAC).
 */
export function PermissionGuard({ require, anyOf, children, fallback = null }: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission } = usePermissions();

  const allowed =
    (!require || require.every(hasPermission)) && (!anyOf || hasAnyPermission(anyOf));

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/** Full-screen "no access" state for gating protected screens. */
export function NoAccess({ message = 'You do not have access to this section.' }: { message?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="lock-closed-outline" size={26} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>Access restricted</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      backgroundColor: c.background,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: { color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
    body: { color: c.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  });
