import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { NoAccess } from '@/components/permission-guard';
import { Button, Card, Screen, SectionTitle, TextField } from '@/components/ui/kit';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { docsService } from '@/services/docs';
import { useAuthStore } from '@/store/auth';
import { DOC_TEMPLATES, type DocKind, type DocSource } from '@/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

const SOURCES: { key: DocSource; label: string; hint: string; icon: IoniconName }[] = [
  { key: 'link', label: 'Link', hint: 'Point to a document hosted elsewhere', icon: 'link-outline' },
  { key: 'file', label: 'Upload', hint: 'Host the file on the platform', icon: 'cloud-upload-outline' },
  { key: 'inapp', label: 'Write', hint: 'Author the document in app', icon: 'create-outline' },
];

export default function EditProjectDoc() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const projectId = String(id);
  const kind: DocKind = kindParam === 'SDD' ? 'SDD' : 'PRD';

  const user = useAuthStore((s) => s.session?.user);
  const { hasPermission } = usePermissions();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [source, setSource] = useState<DocSource>('link');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ name: string; sizeKb: number } | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      docsService.saveDoc({
        projectId,
        kind,
        source,
        url: source === 'link' ? url.trim() : undefined,
        fileName: source === 'file' ? file?.name : undefined,
        fileSizeKb: source === 'file' ? file?.sizeKb : undefined,
        content: source === 'inapp' ? content : undefined,
        updatedByName: String(user?.fullName),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectId] });
      Toast.show({ type: 'success', text1: `${kind} saved`, text2: 'A new version was recorded.' });
      router.back();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Could not save document' }),
  });

  // PRD 11.3: the API enforces that only authorised roles can edit.
  if (!hasPermission('DOCUMENTATION:edit')) {
    return <NoAccess message="You do not have permission to edit documentation." />;
  }

  /**
   * File picking is stubbed until the storage backend exists. The PRD requires
   * real in-platform hosting for v1, so this is where expo-document-picker plus
   * the upload call will slot in.
   */
  const pickFile = () => {
    setFile({ name: `${kind.toLowerCase()}-${projectId}.pdf`, sizeKb: 248 });
    Toast.show({
      type: 'info',
      text1: 'File selected (demo)',
      text2: 'Real upload lands with the storage backend.',
    });
  };

  const useTemplate = () => {
    setSource('link');
    setUrl(DOC_TEMPLATES[kind]);
  };

  const canSave =
    (source === 'link' && url.trim().length > 0) ||
    (source === 'file' && !!file) ||
    (source === 'inapp' && content.trim().length > 0);

  return (
    <Screen>
      <Card>
        <View style={styles.kindRow}>
          <View style={styles.kindBadge}>
            <Text style={styles.kindBadgeText}>{kind}</Text>
          </View>
          <Text style={styles.kindTitle}>
            {kind === 'PRD' ? 'Product Requirements Document' : 'Software Design Document'}
          </Text>
        </View>

        <Pressable
          onPress={useTemplate}
          style={({ pressed }) => [styles.templateBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.accentMuted} />
          <Text style={styles.templateText}>Use the default {kind} template</Text>
        </Pressable>
      </Card>

      {/* Intake method */}
      <Card>
        <SectionTitle>How is it provided?</SectionTitle>
        <View style={styles.sourceRow}>
          {SOURCES.map((s) => {
            const active = source === s.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSource(s.key)}
                style={[styles.sourceCard, active && styles.sourceCardActive]}
              >
                <Ionicons
                  name={s.icon}
                  size={19}
                  color={active ? colors.accent : colors.textSecondary}
                />
                <Text style={[styles.sourceLabel, active && styles.sourceLabelActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.sourceHint}>{SOURCES.find((s) => s.key === source)?.hint}</Text>
      </Card>

      {/* Intake-specific input */}
      {source === 'link' && (
        <Card>
          <TextField
            label="Document URL"
            icon="link-outline"
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
          />
        </Card>
      )}

      {source === 'file' && (
        <Card>
          <SectionTitle>Upload file</SectionTitle>
          {file ? (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <Ionicons name="document-text" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={styles.fileMeta}>{file.sizeKb} KB</Text>
              </View>
              <Pressable onPress={() => setFile(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={pickFile}
              style={({ pressed }) => [styles.dropZone, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="cloud-upload-outline" size={26} color={colors.accent} />
              <Text style={styles.dropTitle}>Choose a file</Text>
              <Text style={styles.dropHint}>PDF, DOCX or Markdown</Text>
            </Pressable>
          )}
        </Card>
      )}

      {source === 'inapp' && (
        <Card>
          <TextField
            label="Document body"
            value={content}
            onChangeText={setContent}
            placeholder={`Write the ${kind} here…`}
            multiline
            numberOfLines={12}
            style={styles.textarea}
          />
        </Card>
      )}

      {/* Version note */}
      <Card>
        <TextField
          label="What changed? (optional)"
          icon="git-commit-outline"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Added RBAC section"
        />
        <Text style={styles.versionNote}>
          Saving records a new version with your name and the current time.
        </Text>
      </Card>

      <Button
        title={`Save ${kind}`}
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
        disabled={!canSave}
        icon="checkmark"
      />
    </Screen>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    kindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    kindBadge: {
      backgroundColor: c.accent,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    kindBadgeText: { color: c.onAccent, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5 },
    kindTitle: { color: c.text, fontSize: 14.5, fontWeight: '700', flex: 1 },
    templateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accentSoft,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    templateText: { color: c.accentMuted, fontSize: 12.5, fontWeight: '700' },
    sourceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    sourceCard: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
    },
    sourceCardActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
    sourceLabel: { color: c.textSecondary, fontSize: 12.5, fontWeight: '600' },
    sourceLabelActive: { color: c.accentMuted, fontWeight: '700' },
    sourceHint: { color: c.textMuted, fontSize: 12, marginTop: spacing.sm },
    dropZone: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: spacing.xl,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      marginTop: spacing.sm,
    },
    dropTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
    dropHint: { color: c.textMuted, fontSize: 12 },
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
    textarea: { height: 220, paddingTop: spacing.md, textAlignVertical: 'top' },
    versionNote: { color: c.textMuted, fontSize: 11.5, lineHeight: 17 },
  });
