import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { Button, Screen, TextField } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { privateApi, toArray, toastApiError } from '@/lib/api';
import { API } from '@/lib/endpoints';
import { dataService } from '@/services/api';
import type { RoleDto } from '@/types/api';

export default function AddTeamMember() {
  const styles = useThemedStyles(makeStyles);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Roles and departments come from the server — they are not hardcoded.
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => toArray<RoleDto>(await privateApi.get(API.ROLES, { params: { size: 50 } })),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: dataService.listDepartments,
  });

  const onSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !username.trim()) {
      Toast.show({ type: 'error', text1: 'Name, username and email are required' });
      return;
    }
    if (!roleId) {
      Toast.show({ type: 'error', text1: 'Choose a role' });
      return;
    }
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Password must be at least 8 characters' });
      return;
    }
    setLoading(true);
    try {
      await privateApi.post(API.REGISTER, {
        name: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role: roleId,
        department: departmentId ? Number(departmentId) : null,
        password,
        confirm_password: password,
      });
      Toast.show({ type: 'success', text1: 'Member added' });
      router.back();
    } catch (e) {
      toastApiError(e, 'Could not add member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <TextField
        label="Full name"
        icon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Jane Doe"
      />
      <TextField
        label="Username"
        icon="at-outline"
        value={username}
        onChangeText={setUsername}
        placeholder="jane.doe"
        autoCapitalize="none"
      />
      <TextField
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="jane@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        label="Phone (optional)"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        placeholder="+234…"
        keyboardType="phone-pad"
      />
      <TextField
        label="Temporary password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
      />

      <View>
        <Text style={styles.label}>Role</Text>
        <View style={styles.row}>
          {roles.length === 0 && <Text style={styles.muted}>Loading roles…</Text>}
          {roles.map((r) => {
            const active = roleId === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRoleId(r.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.label}>Department (optional)</Text>
        <View style={styles.row}>
          {departments.map((d) => {
            const active = departmentId === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setDepartmentId(active ? null : d.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button title="Add member" onPress={onSubmit} loading={loading} icon="person-add-outline" />
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    label: { color: c.label, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
    muted: { color: c.textMuted, fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
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
