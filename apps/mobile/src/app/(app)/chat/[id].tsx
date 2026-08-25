import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, SkeletonList } from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useConversationSocket } from '@/hooks/use-conversation-socket';
import { useNameLookup } from '@/hooks/use-name-lookup';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { toastApiError } from '@/lib/api';
import { clockTime, dayLabel } from '@/lib/format';
import { chatService } from '@/services/api/chat';
import { useAuthStore } from '@/store/auth';

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const user = useAuthStore((s) => s.session?.user);
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState('');

  const { names } = useNameLookup();

  // Realtime: new messages / read receipts push straight into react-query.
  const socketStatus = useConversationSocket(conversationId, (event) => {
    if (event.type === 'message.new' || event.type === 'message.read') {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId, user?.id, names],
    queryFn: () => chatService.getConversation(conversationId, String(user?.id), names),
    enabled: !!user?.id,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', conversationId, names],
    queryFn: () => chatService.listMessages(conversationId, names),
    // Socket drives updates while connected; poll only as a fallback.
    refetchInterval: socketStatus === 'open' ? false : 8000,
  });

  // Read receipts: opening a thread marks it read server-side.
  useEffect(() => {
    if (!user?.id) return;
    void chatService.markConversationRead(conversationId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [conversationId, user?.id, queryClient]);

  useEffect(() => {
    if (conversation) navigation.setOptions({ title: conversation.title });
  }, [conversation, navigation]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      chatService.sendMessage({ recipientId: String(conversation?.recipientId), content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => toastApiError(e, 'Message failed to send'),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || !conversation?.recipientId) return;
    setDraft('');
    sendMutation.mutate(body);
  };

  let lastDay = '';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        keyboardVerticalOffset={Platform.select({ ios: 90, default: 0 })}
      >
        <ScrollView
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && <SkeletonList count={3} />}

          {!isLoading && messages.length === 0 && (
            <EmptyState
              icon="chatbubble-outline"
              title="No messages yet"
              message="Send a message to start the conversation."
            />
          )}

          {!isLoading &&
            messages.map((m) => {
              const mine = m.senderId === String(user?.id);
              const day = dayLabel(m.createdAt);
              const showDay = day !== lastDay;
              lastDay = day;

              return (
                <View key={m.id}>
                  {showDay && (
                    <View style={styles.dayRow}>
                      <Text style={styles.dayText}>{day}</Text>
                    </View>
                  )}
                  <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.body, mine && styles.bodyMine]}>{m.body}</Text>
                      <View style={styles.metaRow}>
                        <Text style={[styles.meta, mine && styles.metaMine]}>
                          {clockTime(m.createdAt)}
                        </Text>
                        {/* Read receipt, mirroring the server's status field. */}
                        {mine && (
                          <Ionicons
                            name={m.isRead ? 'checkmark-done' : 'checkmark'}
                            size={13}
                            color={m.isRead ? '#ffffff' : 'rgba(255,255,255,0.7)'}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={submit}
            disabled={!draft.trim() || sendMutation.isPending}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || sendMutation.isPending) && { opacity: 0.4 },
              pressed && { backgroundColor: colors.accentMuted },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accentSoft,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    noticeText: { color: c.accentMuted, fontSize: 11.5, fontWeight: '600', flex: 1, lineHeight: 16 },
    messages: { padding: spacing.lg, gap: 3 },
    dayRow: { alignItems: 'center', marginVertical: spacing.md },
    dayText: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '78%',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
    },
    bubbleMine: { backgroundColor: c.accent, borderBottomRightRadius: 4 },
    bubbleTheirs: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomLeftRadius: 4,
    },
    body: { color: c.text, fontSize: 14.5, lineHeight: 20 },
    bodyMine: { color: c.onAccent },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-end',
      marginTop: 3,
    },
    meta: { color: c.textMuted, fontSize: 10 },
    metaMine: { color: 'rgba(255,255,255,0.8)' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingTop: 11,
      paddingBottom: 11,
      color: c.text,
      fontSize: 14.5,
    },
    send: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
