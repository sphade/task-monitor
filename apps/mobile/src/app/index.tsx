import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth';

/** Entry redirect: authenticated users go to the app, others to login. */
export default function Index() {
  const session = useAuthStore((s) => s.session);
  return <Redirect href={session ? '/(app)/(tabs)/dashboard' : '/(auth)/login'} />;
}
