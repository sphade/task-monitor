import { router } from 'expo-router';
import { useState } from 'react';
import Toast from 'react-native-toast-message';

import { AuthShell, BackToLoginFooter } from '@/components/ui/auth-shell';
import { Button, TextField } from '@/components/ui/kit';
import { apiErrorMessage } from '@/lib/api';
import { authService } from '@/services/api/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email) {
      Toast.show({ type: 'error', text1: 'Enter your email' });
      return;
    }
    setLoading(true);
    try {
      const { message, tempId } = await authService.forgotPassword(email.trim());
      router.push({
        pathname: '/(auth)/forgot-password-otp',
        params: { email: email.trim(), tempId },
      });
      Toast.show({ type: 'success', text1: message });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Could not send code', text2: apiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email tied to your account and we'll send you a verification code."
      onBack={() => router.back()}
      footer={<BackToLoginFooter />}
    >
      <TextField
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Button title="Send code" onPress={onSubmit} loading={loading} icon="paper-plane-outline" />
    </AuthShell>
  );
}
