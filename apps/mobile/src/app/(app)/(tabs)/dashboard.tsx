import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

import {
    Avatar,
    Card,
    IconTile,
    ProgressBar,
    Screen,
    SectionTitle,
    SkeletonList,
    StatusPill,
} from '@/components/ui/kit';
import { chartColors, priorityColor } from '@/constants/oih-theme';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { Task } from '@/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function MetricCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  icon: IoniconName;
  color: string;
  bg: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.metric}>
      <IconTile icon={icon} color={color} bg={bg} size={36} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function Dashboard() {
  const { colors, gradients, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const user = useAuthStore((s) => s.session?.user);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: dataService.listTasks,
  });

  const stats = useMemo(() => {
    const byStatus = (s: Task['status']) => tasks.filter((t) => t.status === s).length;
    const done = byStatus('completed');
    const total = tasks.length;
    return {
      total,
      inProgress: byStatus('in_progress'),
      // The server marks lapsed tasks `overdue`, so trust it rather than
      // recomputing from due dates.
      overdue: byStatus('overdue'),
      completionRate: total ? Math.round((done / total) * 100) : 0,
      pending: byStatus('pending'),
      done,
    };
  }, [tasks]);

  const chart = chartColors(isDark);

  const pieData = useMemo(() => {
    const palette = chartColors(isDark);
    return [
      { value: stats.done, color: palette.completed, label: 'Completed' },
      { value: stats.inProgress, color: palette.in_progress, label: 'In Progress' },
      { value: stats.pending, color: palette.idle, label: 'Pending' },
      { value: stats.overdue, color: palette.blocked, label: 'Overdue' },
    ].filter((d) => d.value > 0);
  }, [stats, isDark]);

  const priorities = useMemo(() => {
    const count = (p: Task['priority']) => tasks.filter((t) => t.priority === p).length;
    return [
      { name: 'High', value: count('high'), color: priorityColor('high', isDark) },
      { name: 'Medium', value: count('medium'), color: priorityColor('medium', isDark) },
      { name: 'Low', value: count('low'), color: priorityColor('low', isDark) },
    ];
  }, [tasks, isDark]);
  const maxPriority = Math.max(1, ...priorities.map((p) => p.value));

  const recent = tasks.slice(0, 5);
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <Screen>
      {/* Greeting hero */}
      <LinearGradient
        colors={[...gradients.hero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroGreeting}>
            {greeting()}, {firstName}
          </Text>
          <Text style={styles.heroSub}>
            {stats.overdue > 0
              ? `${stats.overdue} task${stats.overdue === 1 ? '' : 's'} need your attention`
              : 'You are all caught up. Nice work.'}
          </Text>
        </View>
        <View style={styles.heroRingWrap}>
          <Text style={styles.heroRingValue}>{stats.completionRate}%</Text>
          <Text style={styles.heroRingLabel}>done</Text>
        </View>
      </LinearGradient>

      {/* Time range toggle */}
      <View style={styles.segment}>
        {(['7d', '30d', '90d'] as const).map((r) => {
          const active = range === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'Last 90 days'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* Summary cards */}
          <View style={styles.grid}>
            <MetricCard
              label="Total Tasks"
              value={stats.total}
              icon="checkmark-circle-outline"
              color={colors.accent}
              bg={colors.accentSoft}
            />
            <MetricCard
              label="In Progress"
              value={stats.inProgress}
              icon="time-outline"
              color={chart.in_progress}
              bg={isDark ? '#1c2f4a' : '#eff6ff'}
            />
            <MetricCard
              label="Overdue"
              value={stats.overdue}
              icon="alert-circle-outline"
              color={colors.danger}
              bg={isDark ? '#3f1c1c' : '#fef2f2'}
            />
            <MetricCard
              label="Completion"
              value={`${stats.completionRate}%`}
              icon="trending-up-outline"
              color={colors.success}
              bg={isDark ? '#17351f' : '#f0fdf4'}
            />
          </View>

          {/* Status distribution */}
          <Card>
            <SectionTitle>Status Distribution</SectionTitle>
            {pieData.length > 0 ? (
              <View style={styles.pieWrap}>
                <PieChart
                  data={pieData}
                  donut
                  radius={72}
                  innerRadius={46}
                  innerCircleColor={colors.surface}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.pieCenterValue}>{stats.total}</Text>
                      <Text style={styles.pieCenterLabel}>Tasks</Text>
                    </View>
                  )}
                />
                <View style={styles.legend}>
                  {pieData.map((d) => (
                    <View key={d.label} style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: d.color }]} />
                      <Text style={styles.legendLabel}>{d.label}</Text>
                      <Text style={styles.legendValue}>{d.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.empty}>No data yet</Text>
            )}
          </Card>

          {/* Priority breakdown */}
          <Card>
            <SectionTitle>Priority Breakdown</SectionTitle>
            <View style={styles.priorityList}>
              {priorities.map((p) => (
                <View key={p.name}>
                  <View style={styles.priorityLabelRow}>
                    <View style={styles.priorityNameWrap}>
                      <View style={[styles.dot, { backgroundColor: p.color }]} />
                      <Text style={styles.priorityName}>{p.name}</Text>
                    </View>
                    <Text style={styles.priorityValue}>{p.value}</Text>
                  </View>
                  <ProgressBar value={(p.value / maxPriority) * 100} color={p.color} />
                </View>
              ))}
            </View>
          </Card>

          {/* Recent tasks */}
          <Card>
            <View style={styles.cardHeader}>
              <SectionTitle>Recent Tasks</SectionTitle>
              <Pressable onPress={() => router.push('/(app)/(tabs)/task')} hitSlop={8}>
                <Text style={styles.viewAll}>View all</Text>
              </Pressable>
            </View>
            {recent.length === 0 && <Text style={styles.empty}>No recent tasks</Text>}
            {recent.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/(app)/task/${t.id}`)}
                style={({ pressed }) => [
                  styles.taskRow,
                  i < recent.length - 1 && styles.taskRowDivider,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Avatar name={t.assigneeName} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.taskMeta}>
                    {t.dueDate ? `Due ${t.dueDate}` : 'No due date'}
                  </Text>
                </View>
                <StatusPill status={t.status} />
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing, shadow }: StyleFactoryArgs) =>
  StyleSheet.create({
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      borderRadius: radius.xl,
      padding: spacing.xl,
      shadowColor: c.accentMuted,
      shadowOpacity: 0.28,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    heroTextWrap: { flex: 1 },
    heroGreeting: { color: '#ffffff', fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
    heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 4, lineHeight: 18 },
    heroRingWrap: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.4)',
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroRingValue: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
    heroRingLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' },
    segment: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      padding: 4,
      gap: 4,
    },
    segmentItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: radius.sm,
    },
    segmentItemActive: { backgroundColor: c.surface, ...shadow.card },
    segmentText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    segmentTextActive: { color: c.accentMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    metric: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadow.card,
    },
    metricValue: {
      color: c.text,
      fontSize: 26,
      fontWeight: '800',
      marginTop: spacing.md,
      letterSpacing: -0.5,
    },
    metricLabel: { color: c.textSecondary, fontSize: 12.5, marginTop: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    viewAll: { color: c.accentMuted, fontSize: 13, fontWeight: '700' },
    pieWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      marginTop: spacing.md,
    },
    pieCenterValue: { color: c.text, fontSize: 20, fontWeight: '800' },
    pieCenterLabel: { color: c.textMuted, fontSize: 11 },
    legend: { flex: 1, gap: spacing.sm },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendLabel: { color: c.textSecondary, fontSize: 13, flex: 1 },
    legendValue: { color: c.text, fontSize: 13, fontWeight: '700' },
    dot: { width: 9, height: 9, borderRadius: 5 },
    priorityList: { gap: spacing.md, marginTop: spacing.sm },
    priorityLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    priorityNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    priorityName: { color: c.text, fontSize: 13, fontWeight: '600' },
    priorityValue: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    empty: { color: c.textMuted, fontSize: 13, paddingVertical: spacing.md },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    taskRowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    taskTitle: { color: c.text, fontSize: 14, fontWeight: '600' },
    taskMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  });
