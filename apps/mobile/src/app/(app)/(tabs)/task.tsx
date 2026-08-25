import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionGuard } from '@/components/permission-guard';
import {
    Avatar,
    EmptyState,
    Fab,
    PressableCard,
    PriorityTag,
    ScreenHeader,
    SkeletonList,
    StatusPill,
} from '@/components/ui/kit';
import { FEATURES } from '@/constants/feature-flags';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { taskService } from '@/services/api/work';
import { PERMISSIONS, type Task } from '@/types';

type FilterKey = 'all' | 'high' | 'due_soon' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High priority' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'completed', label: 'Completed' },
];

/** Applies a filter chip to a task list. Pure, so it lives outside the component. */
function matchesFilter(list: Task[], key: FilterKey): Task[] {
  if (key === 'high') return list.filter((t) => t.priority === 'high');
  if (key === 'completed') return list.filter((t) => t.status === 'completed');
  if (key === 'due_soon') return list.filter((t) => t.dueDate && t.status !== 'completed');
  return list;
}

/** Human-friendly relative due date, e.g. "Due today" / "3 days overdue". */
function dueLabel(dueDate?: string): { text: string; overdue: boolean } {
  if (!dueDate) return { text: 'No due date', overdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  if (days === 1) return { text: 'Due tomorrow', overdue: false };
  if (days <= 7) return { text: `Due in ${days}d`, overdue: false };
  return { text: `Due ${dueDate}`, overdue: false };
}

export default function TaskList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [filter, setFilter] = useState<FilterKey>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => taskService.list({ size: 100 }),
  });

  // The API already scopes tasks to the caller's role, so no client filtering.
  const scoped = data?.items ?? [];
  const visible = matchesFilter(scoped, filter);
  const openCount = scoped.filter((t) => t.status !== 'completed').length;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <ScreenHeader
          title="Tasks"
          subtitle={
            isLoading
              ? 'Loading your tasks…'
              : `${openCount} open · ${scoped.length} total`
          }
          right={
            FEATURES.KANBAN ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open board view"
                onPress={() => router.push('/(app)/task/board')}
                style={({ pressed }) => [styles.boardBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="grid-outline" size={15} color={colors.accentMuted} />
                <Text style={styles.boardBtnText}>Board</Text>
              </Pressable>
            ) : undefined
          }
        />

        {/* Filter chips — sticky so they stay reachable while scrolling. */}
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = matchesFilter(scoped, f.key).length;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && !active && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  <View style={[styles.chipCount, active && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading && <SkeletonList count={4} />}

        {!isLoading && visible.length === 0 && (
          <EmptyState
            icon="checkmark-done-outline"
            title="No tasks here"
            message={
              filter === 'all'
                ? 'Tasks assigned to you will show up in this list.'
                : 'Try a different filter to see more tasks.'
            }
          />
        )}

        {!isLoading &&
          visible.map((t) => {
            const due = dueLabel(t.dueDate);
            return (
              <PressableCard key={t.id} onPress={() => router.push(`/(app)/task/${t.id}`)}>
                <View style={styles.rowTop}>
                  <Text style={styles.title} numberOfLines={2}>
                    {t.title}
                  </Text>
                  <StatusPill status={t.status} />
                </View>

                <View style={styles.metaRow}>
                  <PriorityTag priority={t.priority} />
                  <View style={styles.metaDot} />
                  <View style={styles.dueWrap}>
                    <Ionicons
                      name={due.overdue ? 'alert-circle-outline' : 'calendar-outline'}
                      size={13}
                      color={due.overdue ? colors.danger : colors.textMuted}
                    />
                    <Text style={[styles.metaText, due.overdue && { color: colors.danger, fontWeight: '600' }]}>
                      {due.text}
                    </Text>
                  </View>
                </View>

                {!!t.assigneeName && (
                  <View style={styles.assigneeRow}>
                    <Avatar name={t.assigneeName} size={24} />
                    <Text style={styles.assignee}>{t.assigneeName}</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                  </View>
                )}
              </PressableCard>
            );
          })}
      </ScrollView>

      <PermissionGuard require={[PERMISSIONS.ASSIGN_TASKS]}>
        <Fab onPress={() => router.push('/(app)/task/new-task')} />
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
    filterBar: {
      backgroundColor: c.background,
      marginHorizontal: -spacing.lg,
      paddingVertical: spacing.sm,
    },
    filterContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingVertical: 7,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { color: c.textSecondary, fontWeight: '600', fontSize: 13 },
    chipTextActive: { color: c.onAccent },
    chipCount: {
      minWidth: 20,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
    },
    chipCountActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
    chipCountText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    chipCountTextActive: { color: c.onAccent },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    title: { color: c.text, fontWeight: '700', fontSize: 15, flex: 1, lineHeight: 21 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.textMuted },
    dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: c.textMuted, fontSize: 12 },
    assigneeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    assignee: { color: c.textSecondary, fontSize: 12, flex: 1 },
    boardBtn: {
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
    boardBtnText: { color: c.accentMuted, fontSize: 12.5, fontWeight: '700' },
  });
