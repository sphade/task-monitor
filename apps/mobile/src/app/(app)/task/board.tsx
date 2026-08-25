import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { Avatar, PriorityTag } from '@/components/ui/kit';
import { statusStyle } from '@/constants/oih-theme';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { toastApiError } from '@/lib/api';
import { dataService, taskService } from '@/services/api';
import { PERMISSIONS, type Task, type TaskStatus } from '@/types';

/** Columns mirror the server's task lifecycle exactly. */
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'overdue', label: 'Overdue' },
];

/** Column width tuned so the next column peeks in, hinting horizontal scroll. */
const COLUMN_WIDTH = Math.min(300, Dimensions.get('window').width * 0.78);

export default function TaskBoard() {
  const { hasPermission } = usePermissions();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const canEdit = hasPermission(PERMISSIONS.UPDATE_TASKS);

  // The API scopes tasks to the caller's role already.
  const { data: scoped = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: dataService.listTasks,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      taskService.updateStatus(id, status),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      Toast.show({ type: 'success', text1: message });
    },
    onError: (e) => toastApiError(e, 'Could not move task'),
  });

  /**
   * Status moves use an action sheet rather than drag-and-drop: on a phone-sized
   * board, dragging across columns that are off-screen is unreliable.
   */
  const moveTask = (task: Task) => {
    if (!canEdit) return;
    const targets = COLUMNS.filter((col) => col.status !== task.status);
    Alert.alert('Move task', task.title, [
      { text: 'Cancel', style: 'cancel' },
      ...targets.map((col) => ({
        text: col.label,
        onPress: () => statusMutation.mutate({ id: task.id, status: col.status }),
      })),
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.board}
        snapToInterval={COLUMN_WIDTH + 12}
        decelerationRate="fast"
      >
        {COLUMNS.map((col) => {
          const items = scoped.filter((t) => t.status === col.status);
          const pill = statusStyle(col.status, isDark);

          return (
            <View key={col.status} style={styles.column}>
              {/* Column header */}
              <View style={styles.columnHead}>
                <View style={[styles.columnDot, { backgroundColor: pill.fg }]} />
                <Text style={styles.columnTitle}>{col.label}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{items.length}</Text>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.columnBody}
              >
                {isLoading && <View style={styles.cardSkeleton} />}

                {!isLoading && items.length === 0 && (
                  <View style={styles.emptyColumn}>
                    <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                    <Text style={styles.emptyColumnText}>Nothing here</Text>
                  </View>
                )}

                {items.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => router.push(`/(app)/task/${t.id}`)}
                    onLongPress={() => moveTask(t)}
                    delayLongPress={300}
                    style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
                  >
                    <Text style={styles.cardTitle} numberOfLines={3}>
                      {t.title}
                    </Text>

                    <View style={styles.cardMeta}>
                      <PriorityTag priority={t.priority} />
                      {!!t.dueDate && (
                        <View style={styles.dueWrap}>
                          <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.dueText}>{t.dueDate}</Text>
                        </View>
                      )}
                    </View>

                    {!!t.assigneeName && (
                      <View style={styles.cardFooter}>
                        <Avatar name={t.assigneeName} size={22} />
                        <Text style={styles.assignee} numberOfLines={1}>
                          {t.assigneeName}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {canEdit && (
        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          <Text style={styles.hintText}>Long-press a card to move it between columns</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing, shadow }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    board: { padding: spacing.md, gap: 12 },
    column: {
      width: COLUMN_WIDTH,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    columnHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    columnDot: { width: 8, height: 8, borderRadius: 4 },
    columnTitle: { color: c.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
    countPill: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
    },
    countText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    columnBody: { padding: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.sm,
      ...shadow.card,
    },
    cardTitle: { color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
    dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    dueText: { color: c.textMuted, fontSize: 11.5 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    assignee: { color: c.textSecondary, fontSize: 11.5, flex: 1 },
    cardSkeleton: {
      height: 90,
      borderRadius: radius.md,
      backgroundColor: c.skeleton,
    },
    emptyColumn: { alignItems: 'center', gap: 5, paddingVertical: spacing.xl },
    emptyColumnText: { color: c.textMuted, fontSize: 12 },
    hint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: spacing.sm,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    hintText: { color: c.textMuted, fontSize: 11.5 },
  });
