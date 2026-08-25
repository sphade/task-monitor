import { useQuery } from '@tanstack/react-query';

import type { NameLookup } from '@/services/api/chat';
import { staffService } from '@/services/api/work';

/**
 * Maps user id → display name.
 *
 * Chat messages carry only numeric `sender` / `recipient` ids, so names have to
 * come from the staff directory. Cached by React Query, so the directory is
 * fetched once and shared by the conversation list and every thread.
 */
export function useNameLookup(): { names: NameLookup; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['name-lookup'],
    queryFn: async () => {
      const { items } = await staffService.list({ size: 200 });
      const map: NameLookup = {};
      for (const u of items) map[u.id] = u.fullName;
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  return { names: data ?? {}, isLoading };
}
