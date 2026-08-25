import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import Toast from 'react-native-toast-message';

import { AuthShell, BackToLoginFooter, OtpInput } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/kit';
import { apiErrorMessage } from '@/lib/api';
import { authService } from '@/services/api/auth';

export default function ForgotPasswordOtp() {
  const { email, tempId } = useLocalSearchParams<{ email: string; tempId: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onVerify = async () => {
    if (code.length < 6) {
      Toast.show({ type: 'error', text1: 'Enter the 6-digit code' });
      return;
    }
    setLoading(true);
    try {
      const token = await authService.verifyPasswordReset({
        otp: code,
        tempId: String(tempId),
      });
      router.replace({
        pathname: '/(auth)/reset-password',
        params: { email, token },
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Verification failed', text2: apiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${email}`}
      onBack={() => router.back()}
      showLogo={false}
      footer={<BackToLoginFooter />}
    >
      <OtpInput value={code} onChangeText={setCode} />
      <Button title="Verify code" onPress={onVerify} loading={loading} />
    </AuthShell>
  );
}
