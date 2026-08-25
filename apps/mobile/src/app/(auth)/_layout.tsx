import { useAuthStore } from '@/store/auth';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const session = useAuthStore((s) => s.session);
  if (session) return <Redirect href="/(app)/(tabs)/dashboard" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
