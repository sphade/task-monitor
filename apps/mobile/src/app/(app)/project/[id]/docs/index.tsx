import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoAccess } from '@/components/permission-guard';
import { Card, IconTile, ScreenHeader, SkeletonList } from '@/components/ui/kit';
import { FEATURES } from '@/constants/feature-flags';
import { usePermissions } from '@/context/permissions';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { shortAgo } from '@/lib/format';
import { dataService } from '@/services/api';
import { docsService } from '@/services/docs';
import type { DocKind, ProjectDoc } from '@/types';

const SLOTS: { kind: DocKind; title: string; blurb: string; icon: 'clipboard-outline' | 'construct-outline' }[] = [
  {
    kind: 'PRD',
    title: 'Product Requirements',
    blurb: 'What we are building and why.',
    icon: 'clipboard-outline',
  },
  {
    kind: 'SDD',
    title: 'Software Design',
    blurb: 'How the system is designed.',
    icon: 'construct-outline',
  },
];

const SOURCE_LABEL = {
  link: 'External link',
  file: 'Hosted file',
  inapp: 'Authored in app',
} as const;

const SOURCE_ICON = {
  link: 'link-outline',
  file: 'document-attach-outline',
  inapp: 'create-outline',
} as const;

export default function ProjectDocs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = String(id);
  const { canAccessModule, hasPermission } = usePermissions();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const canEdit = hasPermission('DOCUMENTATION:edit');

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['project-docs', projectId],
    queryFn: () => docsService.listForProject(projectId),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: dataService.listProjects,
  });
  const project = projects.find((p) => p.id === projectId);

  // PRD 11.3: unassigned staff cannot access project documentation. The API has
  // no DOCUMENTATION module, so gate on the flag plus TASKS access (projects
  // live under TASKS server-side).
  if (!FEATURES.DOCS || !canAccessModule('TASKS')) {
    return <NoAccess message="You do not have access to project documentation." />;
  }

  const byKind = (kind: DocKind): ProjectDoc | undefined => docs.find((d) => d.kind === kind);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Documentation"
          subtitle={project ? project.name : 'Project documentation'}
        />

        {isLoading && <SkeletonList count={2} />}

        {!isLoading &&
          SLOTS.map((slot) => {
            const doc = byKind(slot.kind);
            const filled = !!doc;

            return (
              <Card key={slot.kind}>
                <View style={styles.slotHead}>
                  <IconTile icon={slot.icon} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.kindRow}>
                      <Text style={styles.slotKind}>{slot.kind}</Text>
                      {filled && (
                        <View style={styles.versionTag}>
                          <Text style={styles.versionText}>v{doc.version}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.slotTitle}>{slot.title}</Text>
                  </View>
                </View>

                {filled ? (
                  <>
                    <View style={styles.sourceRow}>
                      <Ionicons
                        name={SOURCE_ICON[doc.source]}
                        size={13}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.sourceText}>{SOURCE_LABEL[doc.source]}</Text>
                    </View>

                    {/* Version indicator: last update + author (PRD criteria #4). */}
                    <Text style={styles.updated}>
                      Updated {shortAgo(doc.updatedAt)} ago by {doc.updatedByName}
                    </Text>

                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => router.push(`/(app)/project/${projectId}/docs/${doc.id}`)}
                        style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.8 }]}
                      >
                        <Ionicons name="eye-outline" size={15} color={colors.onAccent} />
                        <Text style={styles.primaryActionText}>Open</Text>
                      </Pressable>

                      {canEdit && (
                        <Pressable
                          onPress={() =>
                            router.push(`/(app)/project/${projectId}/docs/edit?kind=${slot.kind}`)
                          }
                          style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.6 }]}
                        >
                          <Ionicons name="pencil-outline" size={15} color={colors.text} />
                          <Text style={styles.secondaryActionText}>Replace</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.slotBlurb}>{slot.blurb}</Text>
                    <View style={styles.emptySlot}>
                      <Ionicons name="folder-open-outline" size={16} color={colors.textMuted} />
                      <Text style={styles.emptySlotText}>No {slot.kind} attached yet</Text>
                    </View>
                    {canEdit ? (
                      <Pressable
                        onPress={() =>
                          router.push(`/(app)/project/${projectId}/docs/edit?kind=${slot.kind}`)
                        }
                        style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.8 }]}
                      >
                        <Ionicons name="add" size={16} color={colors.onAccent} />
                        <Text style={styles.primaryActionText}>Attach {slot.kind}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.readOnlyNote}>
                        Only project managers and admins can attach documentation.
                      </Text>
                    )}
                  </>
                )}
              </Card>
            );
          })}

        {!isLoading && (
          <Text style={styles.footnote}>
            Staff can view and comment on documentation but cannot edit it.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
    slotHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    slotKind: { color: c.accentMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    versionTag: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    versionText: { color: c.textSecondary, fontSize: 10.5, fontWeight: '700' },
    slotTitle: { color: c.text, fontSize: 15.5, fontWeight: '700', marginTop: 1 },
    slotBlurb: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
    sourceText: { color: c.textSecondary, fontSize: 12.5, fontWeight: '600' },
    updated: { color: c.textMuted, fontSize: 12 },
    emptySlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    emptySlotText: { color: c.textMuted, fontSize: 12.5 },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    primaryAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: c.accent,
      marginTop: spacing.sm,
    },
    primaryActionText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    secondaryAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      marginTop: spacing.sm,
    },
    secondaryActionText: { color: c.text, fontSize: 14, fontWeight: '700' },
    readOnlyNote: { color: c.textMuted, fontSize: 12, marginTop: spacing.sm, lineHeight: 17 },
    footnote: {
      color: c.textMuted,
      fontSize: 11.5,
      textAlign: 'center',
      lineHeight: 17,
      marginTop: spacing.xs,
    },
  });
