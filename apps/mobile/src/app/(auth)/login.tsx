import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { AuthShell, PasswordField, TermsFooter } from '@/components/ui/auth-shell';
import { Button, TextField } from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { apiErrorMessage } from '@/lib/api';
import { authService } from '@/services/api';

export default function Login() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: 'Email and password are required' });
      return;
    }
    setLoading(true);
    try {
      // Step one returns an `otp_key`, echoed back as `temp_id` on verify.
      const { tempId, message } = await authService.login({
        login: email.trim(),
        password,
        rememberMe: remember,
      });
      if (message) Toast.show({ type: 'success', text1: message });
      router.push({ pathname: '/(auth)/otp', params: { email: email.trim(), tempId } });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Login failed', text2: apiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Task and Reporting account"
      footer={<TermsFooter />}
    >
      <TextField
        label="Email or Username"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
      />

      <PasswordField label="Password" value={password} onChangeText={setPassword} />

      <View style={styles.optionsRow}>
        <Pressable style={styles.remember} onPress={() => setRemember((v) => !v)} hitSlop={6}>
          <View style={[styles.checkbox, remember && styles.checkboxOn]}>
            {remember && <Ionicons name="checkmark" size={13} color={colors.onAccent} />}
          </View>
          <Text style={styles.rememberText}>Remember me</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      </View>

      <Button title="Sign In" onPress={onSubmit} loading={loading} />
    </AuthShell>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    remember: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
    rememberText: { color: c.textSecondary, fontSize: 13.5 },
    link: { color: c.accentMuted, fontSize: 12.5, fontWeight: '600' },
    demoBox: {
      marginTop: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.accentSoft,
      gap: 2,
    },
    demoTitle: {
      color: c.accentMuted,
      fontWeight: '700',
      fontSize: 11.5,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    demoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    demoLabel: { color: c.label, fontSize: 12.5, fontWeight: '600' },
    demoEmail: { color: c.textSecondary, fontSize: 12.5 },
  });
