import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PermissionGuard } from '@/components/permission-guard';
import { Badge, Button, Card, Screen } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS } from '@/types';

export default function TaskDetails() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => dataService.getTask(String(id)),
  });

  if (isLoading) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }
  if (!task) {
    return (
      <Screen>
        <Text style={styles.muted}>Task not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.badges}>
          <Badge label={task.status.replace('_', ' ')} tone="info" />
          <Badge label={task.priority} tone={task.priority === 'high' ? 'danger' : 'muted'} />
        </View>
        {!!task.description && <Text style={styles.body}>{task.description}</Text>}
        <View style={styles.meta}>
          <Text style={styles.muted}>Assignee: {task.assigneeName ?? 'Unassigned'}</Text>
          <Text style={styles.muted}>Due: {task.dueDate ?? '—'}</Text>
        </View>
      </Card>

      <PermissionGuard require={[PERMISSIONS.UPDATE_TASKS]}>
        <Button title="Update status" variant="secondary" onPress={() => {}} />
      </PermissionGuard>
      <PermissionGuard require={[PERMISSIONS.DELETE_TASKS]}>
        <Button title="Delete task" variant="danger" onPress={() => {}} />
      </PermissionGuard>
    </Screen>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    title: { color: c.text, fontSize: 20, fontWeight: '800' },
    badges: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
    body: { color: c.textSecondary, lineHeight: 20 },
    meta: { marginTop: spacing.md, gap: 4 },
    muted: { color: c.textMuted, fontSize: 13 },
  });
