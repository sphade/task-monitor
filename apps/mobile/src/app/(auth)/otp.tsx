import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { AuthShell, OtpInput } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { apiErrorMessage } from '@/lib/api';
import { authService } from '@/services/api/auth';
import { useAuthStore } from '@/store/auth';
import type { ModuleKey } from '@/types';

const RESEND_SECONDS = 30;

/** Lands the user on the first module their role can actually reach. */
function landingRoute(allowed: ModuleKey[]): string {
  if (allowed.includes('DASHBOARD')) return '/(app)/(tabs)/dashboard';
  if (allowed.includes('TASKS')) return '/(app)/(tabs)/task';
  if (allowed.includes('REPORTS')) return '/(app)/(tabs)/report';
  if (allowed.includes('HR_SETTINGS')) return '/(app)/(tabs)/team';
  return '/(app)/(tabs)/dashboard';
}

export default function Otp() {
  const { email, tempId } = useLocalSearchParams<{ email: string; tempId: string }>();
  const setSession = useAuthStore((s) => s.setSession);
  const styles = useThemedStyles(makeStyles);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const onVerify = async () => {
    if (code.length < 6) {
      Toast.show({ type: 'error', text1: 'Enter the 6-digit code' });
      return;
    }
    setLoading(true);
    try {
      const session = await authService.verifyLogin({ otp: code, tempId: String(tempId) });
      await setSession(session);
      router.replace(landingRoute(session.allowedModules) as never);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Verification failed', text2: apiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      const message = await authService.resendOtp(String(email));
      setSeconds(RESEND_SECONDS);
      Toast.show({ type: 'success', text1: message });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Could not resend', text2: apiErrorMessage(e) });
    }
  };

  return (
    <AuthShell
      title="Verify it's you"
      subtitle={`Enter the 6-digit code we sent to ${email}`}
      onBack={() => router.back()}
      showLogo={false}
    >
      <OtpInput value={code} onChangeText={setCode} />

      <Button title="Verify & continue" onPress={onVerify} loading={loading} />

      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text style={styles.resendMuted}>Resend code in 0:{String(seconds).padStart(2, '0')}</Text>
        ) : (
          <Pressable onPress={onResend} hitSlop={8}>
            <Text style={styles.resendLink}>Resend code</Text>
          </Pressable>
        )}
      </View>
    </AuthShell>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    resendRow: { alignItems: 'center', marginTop: spacing.xs },
    resendMuted: { color: c.textMuted, fontSize: 13 },
    resendLink: { color: c.accentMuted, fontSize: 13, fontWeight: '700' },
  });
