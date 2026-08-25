import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    Avatar,
    EmptyState,
    PressableCard,
    SearchBar,
    SkeletonList,
} from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { toastApiError } from '@/lib/api';
import { dataService } from '@/services/api';
import { chatService } from '@/services/api/chat';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';



export default function StaffDirectory() {
  const viewer = useAuthStore((s) => s.session?.user);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('ALL');
  const [dept, setDept] = useState<string>('ALL');
  const [opening, setOpening] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: dataService.listUsers,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: dataService.listDepartments,
  });

  // Directory lists active colleagues; filtering happens without a reload.
  const q = search.trim().toLowerCase();
  const visible = users.filter((u) => {
    if (u.id === viewer?.id) return false;
    if (role !== 'ALL' && u.role !== role) return false;
    if (dept !== 'ALL' && u.department !== dept) return false;
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  /**
   * Opens an existing thread, or jumps to the composer for a new one.
   *
   * The API has no "create conversation" call — a thread comes into existence
   * when the first message is POSTed with a `recipient`. So if no thread exists
   * yet we open the composer keyed by recipient, and the server creates (and
   * de-duplicates) the conversation on send.
   */
  const startConversation = async (other: User) => {
    if (!viewer) return;
    setOpening(other.id);
    try {
      const existing = await chatService.listConversations(viewer.id);
      const match = existing.find((c) => c.recipientId === other.id);
      if (match) {
        router.replace({ pathname: '/(app)/chat/[id]', params: { id: match.id } });
      } else {
        router.replace({
          pathname: '/(app)/chat/new',
          params: { recipientId: other.id, name: other.fullName },
        });
      }
    } catch (e) {
      toastApiError(e, 'Could not open conversation');
    } finally {
      setOpening(null);
    }
  };

  const deptFilters = ['ALL', ...departments.map((d) => d.name)];
  // Roles are server-defined, so derive the filter list from the directory.
  const roleFilters = ['ALL', ...Array.from(new Set(users.map((u) => u.role).filter(Boolean)))];

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name or email" />

        {/* Role filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {roleFilters.map((key) => {
            const active = role === key;
            return (
              <Pressable
                key={key}
                onPress={() => setRole(key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {key === 'ALL' ? 'All roles' : key}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Department filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {deptFilters.map((d) => {
            const active = dept === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDept(d)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name="business-outline"
                  size={12}
                  color={active ? colors.onAccent : colors.textMuted}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {d === 'ALL' ? 'All departments' : d}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading && <SkeletonList count={4} avatar />}

        {!isLoading && visible.length === 0 && (
          <EmptyState
            icon="search-outline"
            title="No colleagues found"
            message="Try a different name, role or department."
          />
        )}

        {!isLoading &&
          visible.map((u) => (
            <PressableCard key={u.id} onPress={() => startConversation(u)}>
              <View style={styles.row}>
                <Avatar name={u.fullName} size={46} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {u.fullName}
                    </Text>
                    {/* Deactivated colleagues stay visible, marked Inactive (criteria #5). */}
                    {!u.isActive && (
                      <View style={styles.inactiveTag}>
                        <Text style={styles.inactiveText}>Inactive</Text>
                      </View>
                    )}
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
                        <Text style={styles.deptTagText}>{u.department}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons
                  name={opening === u.id ? 'hourglass-outline' : 'chatbubble-ellipses-outline'}
                  size={20}
                  color={colors.accent}
                />
              </View>
            </PressableCard>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
    chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { color: c.textSecondary, fontWeight: '600', fontSize: 12.5 },
    chipTextActive: { color: c.onAccent },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { color: c.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
    inactiveTag: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    inactiveText: { color: c.textMuted, fontSize: 10, fontWeight: '700' },
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
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    deptTagText: { color: c.textSecondary, fontSize: 11, fontWeight: '600' },
  });
