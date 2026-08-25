import { useTheme } from '@/context/theme';
import { useAuthStore } from '@/store/auth';
import { Redirect, Stack } from 'expo-router';

/** Protected stack. Tabs live in (tabs); detail/create screens push over them. */
export default function AppLayout() {
  const { colors } = useTheme();
  const session = useAuthStore((s) => s.session);
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontSize: 16, fontWeight: '700', color: colors.text },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Account', presentation: 'modal' }} />
      <Stack.Screen name="change-password" options={{ title: 'Change Password' }} />

      <Stack.Screen name="task/new-task" options={{ title: 'New Task' }} />
      <Stack.Screen name="task/[id]" options={{ title: 'Task Details' }} />

      <Stack.Screen name="project/new-project" options={{ title: 'New Project' }} />
      <Stack.Screen name="project/[id]/edit" options={{ title: 'Edit Project' }} />

      <Stack.Screen name="report/new-report" options={{ title: 'New Report' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Report' }} />

      {/* Chat — PRD 11.2 (list lives in the tab group) */}
      <Stack.Screen name="chat/directory" options={{ title: 'Staff Directory' }} />
      <Stack.Screen name="chat/new" options={{ title: 'New Message' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Conversation' }} />

      {/* Project documentation — PRD 11.3 */}
      <Stack.Screen name="project/[id]/docs/index" options={{ title: 'Documentation' }} />
      <Stack.Screen name="project/[id]/docs/[docId]" options={{ title: 'Document' }} />
      <Stack.Screen name="project/[id]/docs/edit" options={{ title: 'Edit Document' }} />

      {/* Task board — Kanban */}
      <Stack.Screen name="task/board" options={{ title: 'Board' }} />

      <Stack.Screen name="team/add-team" options={{ title: 'Add Member' }} />
      <Stack.Screen name="team/[id]/index" options={{ title: 'Member' }} />
      <Stack.Screen name="team/[id]/edit" options={{ title: 'Edit Member' }} />
    </Stack>
  );
}
