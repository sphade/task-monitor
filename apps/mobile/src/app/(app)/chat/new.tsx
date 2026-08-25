import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { toastApiError } from '@/lib/api';
import { chatService } from '@/services/api/chat';
import { useAuthStore } from '@/store/auth';

/**
 * First-message composer.
 *
 * The API creates the conversation as a side effect of the first POST to
 * /v1/chat/messages/ with a `recipient`, so a brand-new thread has no id until
 * something is actually sent. This screen holds that state.
 */
export default function NewConversation() {
  const { recipientId, name } = useLocalSearchParams<{ recipientId: string; name?: string }>();
  const user = useAuthStore((s) => s.session?.user);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState('');

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      chatService.sendMessage({ recipientId: String(recipientId), content }),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Hand off to the real thread now that the server has assigned an id.
      router.replace({ pathname: '/(app)/chat/[id]', params: { id: message.conversationId } });
    },
    onError: (e) => toastApiError(e, 'Message failed to send'),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(body);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        keyboardVerticalOffset={Platform.select({ ios: 90, default: 0 })}
      >
        <View style={styles.intro}>
          <Avatar name={name ?? 'Colleague'} size={64} />
          <Text style={styles.name}>{name ?? 'New conversation'}</Text>
          <Text style={styles.hint}>
            Send a message to start the conversation. The thread is created when your first message
            is delivered.
          </Text>
        </View>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write your first message…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            autoFocus
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
    intro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 6 },
    name: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: spacing.md },
    hint: {
      color: c.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
      marginTop: 2,
    },
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
