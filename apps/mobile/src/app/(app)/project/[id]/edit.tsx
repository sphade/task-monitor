import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import Toast from 'react-native-toast-message';

import { PermissionGuard } from '@/components/permission-guard';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  SectionTitle,
  SkeletonList,
  TextField,
} from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS, type Project } from '@/types';

export default function EditProject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: dataService.listProjects,
  });
  const project = projects.find((p) => p.id === id);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={2} />
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Project not found"
          message="It may have been deleted or you no longer have access to it."
        />
      </Screen>
    );
  }

  // Keyed so the form re-initialises if a different project is opened.
  return <EditProjectForm key={project.id} project={project} />;
}

/** Form initialised directly from the loaded record — no effect syncing needed. */
function EditProjectForm({ project }: { project: Project }) {
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Project name is required' });
      return;
    }
    setLoading(true);
    // TODO: privateApi.put(`/tasks/projects/${project.id}/`, { name, description })
    setTimeout(() => {
      setLoading(false);
      Toast.show({ type: 'success', text1: 'Project updated' });
      router.back();
    }, 400);
  };

  const confirmDelete = () => {
    Alert.alert('Delete project', 'This will permanently remove the project and unlink its tasks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // TODO: privateApi.delete(`/tasks/projects/${project.id}/`)
          Toast.show({ type: 'success', text1: 'Project deleted' });
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Card>
        <SectionTitle>Project details</SectionTitle>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Project name"
          icon="folder-outline"
        />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What is this project about?"
          multiline
          numberOfLines={4}
          style={styles.textarea}
        />
      </Card>

      <PermissionGuard require={[PERMISSIONS.ASSIGN_TASKS]}>
        <Button title="Save changes" onPress={onSubmit} loading={loading} icon="checkmark" />
      </PermissionGuard>

      <PermissionGuard require={[PERMISSIONS.DELETE_TASKS]}>
        <Card style={styles.dangerCard}>
          <SectionTitle>Danger zone</SectionTitle>
          <Text style={styles.dangerText}>
            Deleting a project cannot be undone. Its tasks will remain but lose their project link.
          </Text>
          <Button title="Delete project" variant="danger" onPress={confirmDelete} icon="trash-outline" />
        </Card>
      </PermissionGuard>
    </Screen>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    textarea: { height: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
    dangerCard: { borderColor: c.dangerBorder, backgroundColor: c.dangerBg },
    dangerText: { color: c.textSecondary, fontSize: 12.5, lineHeight: 18 },
  });
