import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { Button, Screen, SectionTitle, TextField } from '@/components/ui/kit';
import { statusStyle } from '@/constants/oih-theme';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { toastApiError } from '@/lib/api';
import { dataService, reportService } from '@/services/api';
import type { ReportStatus } from '@/types';

/** Server-defined report statuses (note the hyphen in `in-progress`). */
const STATUSES: ReportStatus[] = ['pending', 'in-progress', 'done'];

export default function NewReport() {
  const styles = useThemedStyles(makeStyles);
  const { isDark } = useTheme();
  const queryClient = useQueryClient();

  const [note, setNote] = useState('');
  const [status, setStatus] = useState<ReportStatus>('pending');
  const [taskId, setTaskId] = useState<string | null>(null);

  // A report must reference a parent task, so offer the caller's tasks.
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks'], queryFn: dataService.listTasks });

  const createMutation = useMutation({
    mutationFn: () =>
      reportService.create({ parentTaskId: Number(taskId), note: note.trim(), status }),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Toast.show({ type: 'success', text1: message });
      router.back();
    },
    onError: (e) => toastApiError(e, 'Could not submit report'),
  });

  const onSubmit = () => {
    if (!taskId) {
      Toast.show({ type: 'error', text1: 'Choose the task this report is for' });
      return;
    }
    if (!note.trim()) {
      Toast.show({ type: 'error', text1: 'Write your report before submitting' });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Screen>
      <View>
        <SectionTitle>Which task is this about?</SectionTitle>
        <View style={styles.row}>
          {tasks.length === 0 && <Text style={styles.muted}>No tasks available.</Text>}
          {tasks.map((t) => {
            const active = taskId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTaskId(t.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {t.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="Report"
        value={note}
        onChangeText={setNote}
        placeholder="Progress, blockers, next steps…"
        multiline
        numberOfLines={6}
        style={styles.textarea}
      />

      <View>
        <Text style={styles.label}>Status</Text>
        <View style={styles.row}>
          {STATUSES.map((s) => {
            const active = status === s;
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {statusStyle(s, isDark).label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button title="Submit report" onPress={onSubmit} loading={createMutation.isPending} />
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    textarea: { height: 140, textAlignVertical: 'top', paddingTop: spacing.sm },
    label: { color: c.label, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
    muted: { color: c.textMuted, fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    chip: {
      maxWidth: '100%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { color: c.textSecondary, fontWeight: '600' },
    chipTextActive: { color: c.onAccent },
  });
