import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Tabs, router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/ui/kit';
import { FEATURES } from '@/constants/feature-flags';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { useAuthStore } from '@/store/auth';
import type { ModuleKey } from '@/types';

const logo = require('../../../../assets/images/logo.png');

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Brand lockup shown on the left of every tab header. */
function HeaderBrand() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.brand}>
      <Image source={logo} style={styles.brandLogo} contentFit="contain" />
      <View>
        <Text style={styles.brandName}>Orange Invent</Text>
        <Text style={styles.brandTagline}>Task Management</Text>
      </View>
    </View>
  );
}

/** Avatar button that opens the account screen. */
function HeaderAccountButton() {
  const styles = useThemedStyles(makeStyles);
  const user = useAuthStore((s) => s.session?.user);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open account"
      onPress={() => router.push('/(app)/account')}
      hitSlop={12}
      style={({ pressed }) => [styles.accountBtn, pressed && { opacity: 0.6 }]}
    >
      <Avatar name={user?.fullName} size={34} />
    </Pressable>
  );
}

/** Tab icon that switches to the filled variant when active. */
function tabIcon(outline: IoniconName, filled: IoniconName) {
  const TabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} color={color as string} size={23} />
  );
  TabIcon.displayName = `TabIcon(${outline})`;
  return TabIcon;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { canAccessModule } = usePermissions();
  const show = (m: ModuleKey) => canAccessModule(m);

  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerTitle: '',
        headerLeft: () => <HeaderBrand />,
        headerRight: () => <HeaderAccountButton />,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          href: show('DASHBOARD') ? undefined : null,
          tabBarIcon: tabIcon('grid-outline', 'grid'),
        }}
      />
      <Tabs.Screen
        name="task"
        options={{
          title: 'Tasks',
          href: show('TASKS') ? undefined : null,
          tabBarIcon: tabIcon('checkbox-outline', 'checkbox'),
        }}
      />
      {/* Projects live under the TASKS module on the server. */}
      <Tabs.Screen
        name="project"
        options={{
          title: 'Projects',
          href: show('TASKS') ? undefined : null,
          tabBarIcon: tabIcon('folder-outline', 'folder'),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Reports',
          href: show('REPORTS') ? undefined : null,
          tabBarIcon: tabIcon('document-text-outline', 'document-text'),
        }}
      />
      {/* PRD 11.2 — behind a feature flag for staged rollout. The API has no
          CHAT module, so gate on the flag plus an authenticated session. */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: FEATURES.CHAT ? undefined : null,
          tabBarIcon: tabIcon('chatbubble-outline', 'chatbubble'),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
          href: show('HR_SETTINGS') ? undefined : null,
          tabBarIcon: tabIcon('people-outline', 'people'),
        }}
      />
    </Tabs>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    header: { backgroundColor: c.surface },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: spacing.lg },
    brandLogo: { width: 34, height: 34, borderRadius: 17 },
    brandName: { color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    brandTagline: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    accountBtn: { marginRight: spacing.lg },
    tabBar: {
      backgroundColor: c.surface,
      borderTopColor: c.border,
      borderTopWidth: 1,
      height: Platform.select({ ios: 88, default: 68 }),
      paddingTop: 8,
      paddingBottom: Platform.select({ ios: 28, default: 10 }),
    },
    tabItem: { paddingVertical: 2 },
    tabLabel: { fontSize: 11, fontWeight: '600' },
  });
