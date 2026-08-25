import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionGuard } from '@/components/permission-guard';
import {
    EmptyState,
    Fab,
    IconTile,
    PressableCard,
    ProgressBar,
    ScreenHeader,
    SkeletonList,
} from '@/components/ui/kit';
import { FEATURES } from '@/constants/feature-flags';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS } from '@/types';

/** Short date like "5 Jan" for compact timeline rows. */
function shortDate(value?: string) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ProjectList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: dataService.listProjects,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: dataService.listTasks,
  });

  /**
   * Completion per project, derived from its tasks. Tasks now carry `project`,
   * so this reflects real data (the API also supports `?project_id=` for
   * server-side scoping if per-project fetching becomes preferable).
   */
  const progress = useMemo(() => {
    const map: Record<string, { done: number; total: number; pct: number }> = {};
    for (const p of projects) {
      const own = tasks.filter((t) => t.projectId === p.id);
      const done = own.filter((t) => t.status === 'completed').length;
      map[p.id] = {
        done,
        total: own.length,
        pct: own.length ? (done / own.length) * 100 : 0,
      };
    }
    return map;
  }, [projects, tasks]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Projects"
          subtitle={isLoading ? 'Loading projects…' : `${projects.length} active project${projects.length === 1 ? '' : 's'}`}
        />

        {isLoading && <SkeletonList count={3} />}

        {!isLoading && projects.length === 0 && (
          <EmptyState
            icon="folder-open-outline"
            title="No projects yet"
            message="Create your first project to start grouping tasks and tracking progress."
          />
        )}

        {!isLoading &&
          projects.map((p) => {
            const prog = progress[p.id] ?? { done: 0, total: 0, pct: 0 };
            return (
              <PressableCard key={p.id} onPress={() => router.push(`/(app)/project/${p.id}/edit`)}>
                <View style={styles.headRow}>
                  <IconTile icon="folder-outline" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {!!p.description && (
                      <Text style={styles.desc} numberOfLines={1}>
                        {p.description}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                </View>

                {/* Progress */}
                <View style={styles.progressBlock}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabel}>
                      {prog.total > 0 ? `${prog.done} of ${prog.total} tasks done` : 'No tasks yet'}
                    </Text>
                    <Text style={styles.progressPct}>{Math.round(prog.pct)}%</Text>
                  </View>
                  <ProgressBar value={prog.pct} />
                </View>

                {/* Timeline + documentation entry point (PRD 11.3) */}
                <View style={styles.timeline}>
                  <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.timelineText}>
                    {shortDate(p.startDate)} → {shortDate(p.endDate)}
                  </Text>

                  {FEATURES.DOCS && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open documentation for ${p.name}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/project/[id]/docs',
                          params: { id: p.id },
                        })
                      }
                      hitSlop={8}
                      style={({ pressed }) => [styles.docsBtn, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="document-text-outline" size={13} color={colors.accentMuted} />
                      <Text style={styles.docsBtnText}>Docs</Text>
                    </Pressable>
                  )}
                </View>
              </PressableCard>
            );
          })}
      </ScrollView>

      <PermissionGuard require={[PERMISSIONS.ASSIGN_TASKS]}>
        <Fab onPress={() => router.push('/(app)/project/new-project')} />
      </PermissionGuard>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl * 3,
      gap: spacing.md,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    title: { color: c.text, fontWeight: '700', fontSize: 15.5 },
    desc: { color: c.textSecondary, fontSize: 12.5, marginTop: 2 },
    progressBlock: { marginTop: spacing.md, gap: 6 },
    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressLabel: { color: c.textSecondary, fontSize: 12 },
    progressPct: { color: c.accentMuted, fontSize: 12, fontWeight: '700' },
    timeline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    timelineText: { color: c.textMuted, fontSize: 12, flex: 1 },
    docsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: c.accentSoft,
    },
    docsBtnText: { color: c.accentMuted, fontSize: 11.5, fontWeight: '700' },
  });
