import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { Button, Screen, TextField } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import type { TaskPriority } from '@/types';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

export default function NewTask() {
  const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Title is required' });
      return;
    }
    setLoading(true);
    // TODO: privateApi.post('/tasks', { title, description, priority })
    setTimeout(() => {
      setLoading(false);
      Toast.show({ type: 'success', text1: 'Task created' });
      router.back();
    }, 400);
  };

  return (
    <Screen>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing?" />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details"
        multiline
        numberOfLines={4}
        style={styles.textarea}
      />
      <View>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => (
            <Pressable key={p} onPress={() => setPriority(p)} style={[styles.priorityChip, priority === p && styles.priorityActive]}>
              <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Button title="Create task" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    textarea: { height: 100, textAlignVertical: 'top', paddingTop: spacing.sm },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
    priorityRow: { flexDirection: 'row', gap: spacing.sm },
    priorityChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    priorityActive: { backgroundColor: c.accent, borderColor: c.accent },
    priorityText: { color: c.textSecondary, fontWeight: '700', textTransform: 'capitalize' },
    priorityTextActive: { color: c.onAccent },
  });
