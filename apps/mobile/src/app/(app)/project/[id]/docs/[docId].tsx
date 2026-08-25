import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { Avatar, Card, EmptyState, SectionTitle, SkeletonList } from '@/components/ui/kit';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dayLabel, shortAgo } from '@/lib/format';
import { docsService } from '@/services/docs';
import { useAuthStore } from '@/store/auth';

export default function DocViewer() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const id = String(docId);
  const user = useAuthStore((s) => s.session?.user);
  const { hasPermission } = usePermissions();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const canComment = hasPermission('DOCUMENTATION:comment');
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['doc', id],
    queryFn: () => docsService.getDoc(id),
  });
  const { data: comments = [] } = useQuery({
    queryKey: ['doc-comments', id],
    queryFn: () => docsService.listComments(id),
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      docsService.addComment(id, { id: String(user?.id), name: String(user?.fullName) }, body),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['doc-comments', id] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Could not post comment' }),
  });

  const openExternal = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not open link' });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.list}>
          <SkeletonList count={3} />
        </View>
      </SafeAreaView>
    );
  }

  if (!doc) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <EmptyState
          icon="document-outline"
          title="Document not found"
          message="It may have been removed or you no longer have access."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header: kind, version, author */}
        <Card>
          <View style={styles.headRow}>
            <View style={styles.kindBadge}>
              <Text style={styles.kindBadgeText}>{doc.kind}</Text>
            </View>
            <View style={styles.versionTag}>
              <Text style={styles.versionText}>Version {doc.version}</Text>
            </View>
          </View>
          <Text style={styles.updated}>
            Updated {shortAgo(doc.updatedAt)} ago by {doc.updatedByName}
          </Text>

          <Pressable
            onPress={() => setShowHistory((v) => !v)}
            style={({ pressed }) => [styles.historyToggle, pressed && { opacity: 0.6 }]}
          >
            <Ionicons
              name={showHistory ? 'chevron-up' : 'time-outline'}
              size={14}
              color={colors.accentMuted}
            />
            <Text style={styles.historyToggleText}>
              {showHistory ? 'Hide version history' : `Version history (${doc.history.length})`}
            </Text>
          </Pressable>

          {showHistory && (
            <View style={styles.history}>
              {doc.history.map((v) => (
                <View key={v.version} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyVersion}>
                      v{v.version} · {v.updatedByName}
                    </Text>
                    {!!v.note && <Text style={styles.historyNote}>{v.note}</Text>}
                    <Text style={styles.historyDate}>{dayLabel(v.updatedAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Content, by intake method */}
        {doc.source === 'link' && !!doc.url && (
          <Card>
            <SectionTitle>External document</SectionTitle>
            <Text style={styles.url} numberOfLines={2}>
              {doc.url}
            </Text>
            <Pressable
              onPress={() => openExternal(doc.url!)}
              style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="open-outline" size={16} color={colors.onAccent} />
              <Text style={styles.openBtnText}>Open in browser</Text>
            </Pressable>
          </Card>
        )}

        {doc.source === 'file' && (
          <Card>
            <SectionTitle>Hosted file</SectionTitle>
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <Ionicons name="document-text" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {doc.fileName ?? 'document.pdf'}
                </Text>
                <Text style={styles.fileMeta}>{doc.fileSizeKb ?? 0} KB</Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.textSecondary} />
            </View>
          </Card>
        )}

        {doc.source === 'inapp' && (
          <Card>
            <SectionTitle>Document</SectionTitle>
            <Text style={styles.content}>{doc.content}</Text>
          </Card>
        )}

        {/* Comments — staff can comment but not edit (PRD criteria #3) */}
        <Card>
          <SectionTitle>Comments ({comments.length})</SectionTitle>

          {comments.length === 0 && (
            <Text style={styles.noComments}>No comments yet. Start the discussion.</Text>
          )}

          {comments.map((cm) => (
            <View key={cm.id} style={styles.comment}>
              <Avatar name={cm.authorName} size={30} />
              <View style={{ flex: 1 }}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentAuthor}>{cm.authorName}</Text>
                  <Text style={styles.commentTime}>{shortAgo(cm.createdAt)}</Text>
                </View>
                <Text style={styles.commentBody}>{cm.body}</Text>
              </View>
            </View>
          ))}

          {canComment ? (
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                onPress={() => draft.trim() && commentMutation.mutate(draft.trim())}
                disabled={!draft.trim() || commentMutation.isPending}
                style={({ pressed }) => [
                  styles.send,
                  (!draft.trim() || commentMutation.isPending) && { opacity: 0.4 },
                  pressed && { backgroundColor: colors.accentMuted },
                ]}
              >
                <Ionicons name="send" size={16} color={colors.onAccent} />
              </Pressable>
            </View>
          ) : (
            <Text style={styles.noComments}>You do not have permission to comment.</Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    kindBadge: {
      backgroundColor: c.accent,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    kindBadgeText: { color: c.onAccent, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5 },
    versionTag: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    versionText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    updated: { color: c.textMuted, fontSize: 12.5, marginTop: 2 },
    historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
    historyToggleText: { color: c.accentMuted, fontSize: 12.5, fontWeight: '700' },
    history: {
      marginTop: spacing.sm,
      gap: spacing.md,
      borderLeftWidth: 2,
      borderLeftColor: c.divider,
      paddingLeft: spacing.md,
    },
    historyRow: { flexDirection: 'row', gap: spacing.sm },
    historyDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.accent,
      marginTop: 5,
      marginLeft: -spacing.md - 4,
    },
    historyVersion: { color: c.text, fontSize: 13, fontWeight: '700' },
    historyNote: { color: c.textSecondary, fontSize: 12.5, marginTop: 1 },
    historyDate: { color: c.textMuted, fontSize: 11.5, marginTop: 1 },
    url: { color: c.info, fontSize: 13, marginTop: 2 },
    openBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: c.accent,
      marginTop: spacing.md,
    },
    openBtnText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
    fileIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileName: { color: c.text, fontSize: 14, fontWeight: '600' },
    fileMeta: { color: c.textMuted, fontSize: 12, marginTop: 1 },
    content: { color: c.text, fontSize: 14, lineHeight: 22, marginTop: spacing.sm },
    noComments: { color: c.textMuted, fontSize: 12.5, marginTop: spacing.sm },
    comment: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    commentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    commentAuthor: { color: c.text, fontSize: 13, fontWeight: '700', flex: 1 },
    commentTime: { color: c.textMuted, fontSize: 11 },
    commentBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 110,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      paddingBottom: 10,
      color: c.text,
      fontSize: 14,
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
