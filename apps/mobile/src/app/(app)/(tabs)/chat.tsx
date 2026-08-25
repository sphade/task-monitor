import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoAccess } from '@/components/permission-guard';
import {
    Avatar,
    EmptyState,
    Fab,
    PressableCard,
    ScreenHeader,
    SkeletonList,
} from '@/components/ui/kit';
import { FEATURES } from '@/constants/feature-flags';
import { useTheme } from '@/context/theme';
import { useNameLookup } from '@/hooks/use-name-lookup';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { shortAgo } from '@/lib/format';
import { chatService } from '@/services/api/chat';
import { useAuthStore } from '@/store/auth';

export default function ChatList() {
  const user = useAuthStore((s) => s.session?.user);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { names } = useNameLookup();

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['conversations', user?.id, names],
    queryFn: () => chatService.listConversations(String(user?.id), names),
    enabled: !!user?.id,
    // Near-real-time until the backend offers a socket transport.
    refetchInterval: 15000,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // The API has no CHAT module, so access is governed by the feature flag.
  if (!FEATURES.CHAT) {
    return <NoAccess message="Messages are not enabled for this environment." />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Messages"
          subtitle={
            isLoading
              ? 'Loading conversations…'
              : totalUnread > 0
                ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
                : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
          }
        />

        {isLoading && <SkeletonList count={4} avatar />}

        {isError && !isLoading && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load conversations"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        )}

        {!isLoading && !isError && conversations.length === 0 && (
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            message="Open the staff directory to message a colleague. The thread is created when you send your first message."
            actionLabel="Browse directory"
            onAction={() => router.push('/(app)/chat/directory')}
          />
        )}

        {!isLoading &&
          conversations.map((conv) => {
            const unread = conv.unreadCount > 0;
            return (
              <PressableCard
                key={conv.id}
                onPress={() =>
                  router.push({ pathname: '/(app)/chat/[id]', params: { id: conv.id } })
                }
                style={unread ? styles.unreadCard : undefined}
              >
                <View style={styles.row}>
                  {conv.kind === 'forum' ? (
                    <View style={styles.groupAvatar}>
                      <Ionicons name="people" size={22} color={colors.onAccent} />
                    </View>
                  ) : (
                    <Avatar name={conv.title} size={46} />
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
                        {conv.title}
                      </Text>
                      <Text style={styles.time}>{shortAgo(conv.lastMessageAt)}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text
                        style={[styles.preview, unread && styles.previewUnread]}
                        numberOfLines={1}
                      >
                        {conv.lastMessage ?? 'No messages yet'}
                      </Text>
                      {unread && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{conv.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                </View>
              </PressableCard>
            );
          })}
      </ScrollView>

      <Fab
        onPress={() => router.push('/(app)/chat/directory')}
        icon="person-add-outline"
        label="Start a conversation"
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl * 3, gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    groupAvatar: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { color: c.text, fontSize: 15, fontWeight: '600', flex: 1 },
    titleUnread: { fontWeight: '800' },
    time: { color: c.textMuted, fontSize: 11.5 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
    preview: { color: c.textSecondary, fontSize: 13, flex: 1 },
    previewUnread: { color: c.text, fontWeight: '600' },
    unreadCard: { borderColor: c.accent },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: c.onAccent, fontSize: 11, fontWeight: '800' },
  });
