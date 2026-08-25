import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PermissionGuard } from '@/components/permission-guard';
import { Badge, Button, Card, Screen } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS } from '@/types';

export default function TeamMember() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: dataService.listUsers });
  const user = users.find((u) => u.id === id);

  if (!user) {
    return (
      <Screen>
        <Text style={styles.muted}>Member not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.fullName.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.fullName}</Text>
            <Text style={styles.muted}>{user.email}</Text>
          </View>
          <Badge label={user.isActive ? 'active' : 'inactive'} tone={user.isActive ? 'success' : 'muted'} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.muted}>Role: {user.role}</Text>
          <Text style={styles.muted}>Department: {user.department ?? '—'}</Text>
        </View>
      </Card>

      <PermissionGuard anyOf={[PERMISSIONS.MANAGE_STAFF]}>
        <Button title="Edit member" variant="secondary" onPress={() => router.push(`/(app)/team/${user.id}/edit`)} />
      </PermissionGuard>
    </Screen>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: c.text, fontWeight: '800', fontSize: 20 },
    name: { color: c.text, fontWeight: '800', fontSize: 18 },
    meta: { marginTop: spacing.md, gap: 4 },
    muted: { color: c.textMuted, fontSize: 13 },
  });
