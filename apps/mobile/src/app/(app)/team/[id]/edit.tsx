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
import { PERMISSIONS, type User } from '@/types';

export default function EditTeamMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: dataService.listUsers,
  });
  const member = users.find((u) => u.id === id);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={2} />
      </Screen>
    );
  }

  if (!member) {
    return (
      <Screen>
        <EmptyState
          icon="person-outline"
          title="Member not found"
          message="They may have been removed or you no longer have access."
        />
      </Screen>
    );
  }

  // Keyed so the form re-initialises if a different member is opened.
  return <EditTeamMemberForm key={member.id} member={member} />;
}

/** Form initialised directly from the loaded record — no effect syncing needed. */
function EditTeamMemberForm({ member }: { member: User }) {
  const styles = useThemedStyles(makeStyles);
  const [fullName, setFullName] = useState(member.fullName);
  const [department, setDepartment] = useState(member.department ?? '');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Full name is required' });
      return;
    }
    setLoading(true);
    // TODO: privateApi.put(`/console/staff/${member.id}/`, { fullName, department })
    setTimeout(() => {
      setLoading(false);
      Toast.show({ type: 'success', text1: 'Member updated' });
      router.back();
    }, 400);
  };

  const confirmDeactivate = () => {
    Alert.alert('Deactivate member', 'They will lose access until reactivated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: () => {
          // TODO: privateApi.delete(`/console/staff/${member.id}/`)
          Toast.show({ type: 'success', text1: 'Member deactivated' });
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Card>
        <SectionTitle>Member details</SectionTitle>
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          icon="person-outline"
        />
        <TextField
          label="Department"
          value={department}
          onChangeText={setDepartment}
          placeholder="Department"
          icon="business-outline"
        />
      </Card>

      <PermissionGuard anyOf={[PERMISSIONS.MANAGE_STAFF]}>
        <Button title="Save changes" onPress={onSubmit} loading={loading} icon="checkmark" />
      </PermissionGuard>

      <PermissionGuard anyOf={[PERMISSIONS.MANAGE_STAFF]}>
        <Card style={styles.dangerCard}>
          <SectionTitle>Danger zone</SectionTitle>
          <Text style={styles.dangerText}>
            Deactivating revokes this member&apos;s access. Their tasks and reports are kept.
          </Text>
          <Button
            title="Deactivate member"
            variant="danger"
            onPress={confirmDeactivate}
            icon="person-remove-outline"
          />
        </Card>
      </PermissionGuard>
    </Screen>
  );
}

const makeStyles = ({ c }: StyleFactoryArgs) =>
  StyleSheet.create({
    dangerCard: { borderColor: c.dangerBorder, backgroundColor: c.dangerBg },
    dangerText: { color: c.textSecondary, fontSize: 12.5, lineHeight: 18 },
  });
