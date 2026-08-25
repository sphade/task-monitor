import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, EmptyState, Screen, SkeletonList, StatusPill } from '@/components/ui/kit';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';
import { dayLabel } from '@/lib/format';
import { dataService } from '@/services/api';

export default function ReportDetails() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn: () => dataService.getReport(String(id)),
  });

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={2} />
      </Screen>
    );
  }

  if (!report) {
    return (
      <Screen>
        <EmptyState
          icon="document-outline"
          title="Report not found"
          message="It may have been deleted or you no longer have access."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <View style={styles.headRow}>
          <StatusPill status={report.status} />
          <Text style={styles.date}>{dayLabel(report.createdAt)}</Text>
        </View>

        {/* Reports carry no title on the server — the note is the content. */}
        <Text style={styles.body}>{report.body?.trim() || 'No content.'}</Text>

        <View style={styles.footer}>
          <Avatar name={report.authorName} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{report.authorName ?? 'Unknown'}</Text>
            {!!report.authorRole && <Text style={styles.role}>{report.authorRole}</Text>}
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const makeStyles = ({ c, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    date: { color: c.textMuted, fontSize: 12.5 },
    body: { color: c.text, fontSize: 14.5, lineHeight: 22, marginTop: spacing.md },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    author: { color: c.text, fontSize: 13.5, fontWeight: '700' },
    role: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  });
