import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionGuard } from '@/components/permission-guard';
import {
    Avatar,
    EmptyState,
    Fab,
    PressableCard,
    ScreenHeader,
    SkeletonList,
    StatusPill,
} from '@/components/ui/kit';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dataService } from '@/services/api';
import { PERMISSIONS } from '@/types';

/** "Today" / "Yesterday" / "12 May" for report timestamps. */
function whenLabel(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ReportList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: dataService.listReports,
  });

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Reports"
          subtitle={
            isLoading ? 'Loading reports…' : `${reports.length} report${reports.length === 1 ? '' : 's'} submitted`
          }
        />

        {isLoading && <SkeletonList count={3} avatar />}

        {!isLoading && reports.length === 0 && (
          <EmptyState
            icon="document-text-outline"
            title="No reports yet"
            message="Submit a report to keep your team updated on progress and blockers."
          />
        )}

        {!isLoading &&
          reports.map((r) => (
            <PressableCard key={r.id} onPress={() => router.push(`/(app)/report/${r.id}`)}>
              {/* Reports have no title on the server — the note is the body. */}
              <View style={styles.rowTop}>
                <Text style={styles.title} numberOfLines={2}>
                  {r.body?.trim() || 'Untitled report'}
                </Text>
                <StatusPill status={r.status} />
              </View>

              <View style={styles.footer}>
                <Avatar name={r.authorName} size={24} />
                <Text style={styles.author} numberOfLines={1}>
                  {r.authorName ?? 'Unknown author'}
                </Text>
                <Text style={styles.when}>{whenLabel(r.createdAt)}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </View>
            </PressableCard>
          ))}
      </ScrollView>

      <PermissionGuard require={[PERMISSIONS.CREATE_REPORTS]}>
        <Fab onPress={() => router.push('/(app)/report/new-report')} />
      </PermissionGuard>
    </SafeAreaView>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    list: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl * 3,
      gap: spacing.md,
    },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    title: { color: c.text, fontWeight: '700', fontSize: 15, flex: 1, lineHeight: 21 },
    body: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    author: { color: c.textSecondary, fontSize: 12, flex: 1 },
    when: { color: c.textMuted, fontSize: 12 },
  });
