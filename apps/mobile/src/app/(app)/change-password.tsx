import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { PasswordField, PasswordStrength } from '@/components/ui/auth-shell';
import { Button, Card, Screen } from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';

const RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Upper and lowercase letters', test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: 'At least one number', test: (p: string) => /\d/.test(p) },
];

export default function ChangePassword() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  const onSubmit = async () => {
    if (!current) {
      Toast.show({ type: 'error', text1: 'Enter your current password' });
      return;
    }
    if (next.length < 8) {
      Toast.show({ type: 'error', text1: 'New password must be at least 8 characters' });
      return;
    }
    if (next !== confirm) {
      Toast.show({ type: 'error', text1: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    // TODO: privateApi.put('/auth/change-password/', { current, next })
    setTimeout(() => {
      setLoading(false);
      Toast.show({ type: 'success', text1: 'Password updated' });
      router.back();
    }, 400);
  };

  return (
    <Screen>
      <Card>
        <PasswordField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          placeholder="Enter current password"
        />
      </Card>

      <Card>
        <PasswordField
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
        />
        <PasswordStrength password={next} />

        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Re-enter new password"
          error={mismatch ? 'Passwords do not match' : undefined}
        />

        {/* Live requirement checklist */}
        <View style={styles.rules}>
          {RULES.map((r) => {
            const ok = r.test(next);
            return (
              <View key={r.label} style={styles.ruleRow}>
                <Ionicons
                  name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                  size={14}
                  color={ok ? colors.success : colors.textMuted}
                />
                <Text style={[styles.ruleText, ok && { color: colors.text }]}>{r.label}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Button title="Update password" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    rules: { gap: 7, marginTop: spacing.sm },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    ruleText: { color: c.textSecondary, fontSize: 12.5 },
  });
