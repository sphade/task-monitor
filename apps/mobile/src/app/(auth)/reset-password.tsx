import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import {
    AuthShell,
    BackToLoginFooter,
    PasswordField,
    PasswordStrength,
} from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { apiErrorMessage } from '@/lib/api';
import { authService } from '@/services/api/auth';

export default function ResetPassword() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const onSubmit = async () => {
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Password must be at least 8 characters' });
      return;
    }
    if (password !== confirm) {
      Toast.show({ type: 'error', text1: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword({
        token: String(token),
        password,
        confirmPassword: confirm,
      });
      Toast.show({ type: 'success', text1: 'Password reset', text2: 'You can now sign in.' });
      router.replace('/(auth)/login');
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Reset failed', text2: apiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create a new password"
      subtitle="Choose a strong password you haven't used before."
      onBack={() => router.back()}
      footer={<BackToLoginFooter />}
    >
      <PasswordField
        label="New password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
      />
      <PasswordStrength password={password} />

      <PasswordField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter your password"
        error={mismatch ? 'Passwords do not match' : undefined}
      />

      {!mismatch && confirm.length > 0 && (
        <View style={styles.matchRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.matchText}>Passwords match</Text>
        </View>
      )}

      <Button title="Reset password" onPress={onSubmit} loading={loading} />
    </AuthShell>
  );
}

const makeStyles = ({ c }: StyleFactoryArgs) =>
  StyleSheet.create({
    matchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -4 },
    matchText: { color: c.success, fontSize: 12, fontWeight: '600' },
  });
