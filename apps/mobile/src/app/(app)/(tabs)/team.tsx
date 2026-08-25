import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoAccess, PermissionGuard } from '@/components/permission-guard';
import {
    Avatar,
    EmptyState,
    Fab,
    PressableCard,
    ScreenHeader,
    SearchBar,
    SkeletonList,
} from '@/components/ui/kit';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS } from '@/types';

export default function TeamList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { canAccessModule } = usePermissions();
  const [search, setSearch] = useState('');
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: dataService.listUsers,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  // The team directory lives under the server's HR_SETTINGS module.
  if (!canAccessModule('HR_SETTINGS')) return <NoAccess />;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Team"
          subtitle={isLoading ? 'Loading members…' : `${users.length} member${users.length === 1 ? '' : 's'}`}
        />

        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name or email" />

        {isLoading && <SkeletonList count={4} avatar />}

        {!isLoading && filtered.length === 0 && (
          <EmptyState
            icon={search ? 'search-outline' : 'people-outline'}
            title={search ? 'No matches' : 'No team members'}
            message={
              search
                ? `Nothing found for “${search.trim()}”. Try a different name or email.`
                : 'Invite people to your workspace to start assigning tasks.'
            }
          />
        )}

        {!isLoading &&
          filtered.map((u) => (
            <PressableCard key={u.id} onPress={() => router.push(`/(app)/team/${u.id}`)}>
              <View style={styles.row}>
                <Avatar name={u.fullName} size={46} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {u.fullName}
                    </Text>
                    <View style={[styles.statusDot, !u.isActive && { backgroundColor: colors.textMuted }]} />
                  </View>
                  <Text style={styles.email} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <View style={styles.tagRow}>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>{u.role}</Text>
                    </View>
                    {!!u.department && (
                      <View style={styles.deptTag}>
                        <Ionicons name="business-outline" size={11} color={colors.textSecondary} />
                        <Text style={styles.deptTagText}>{u.department}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </View>
            </PressableCard>
          ))}
      </ScrollView>

      <PermissionGuard anyOf={[PERMISSIONS.MANAGE_STAFF]}>
        <Fab onPress={() => router.push('/(app)/team/add-team')} icon="person-add" />
      </PermissionGuard>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl * 3,
      gap: spacing.md,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { color: c.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
    statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
    email: { color: c.textSecondary, fontSize: 12.5, marginTop: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
    roleTag: {
      backgroundColor: c.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    roleTagText: { color: c.accentMuted, fontSize: 11, fontWeight: '700' },
    deptTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    deptTagText: { color: c.textSecondary, fontSize: 11, fontWeight: '600' },
  });
