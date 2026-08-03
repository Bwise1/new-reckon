import { useQuery } from '@tanstack/react-query';
import { boqService } from '@/services/boq.service';

/**
 * BOQ header/description suggestions. Cached long-term because they rarely
 * change and dozens of Header/Description fields mount per page — without
 * a shared cache, each mount fires its own request to the same endpoint.
 */
export function useSuggestions(type: 'header' | 'description') {
  const { data } = useQuery({
    queryKey: ['boq-suggestions', type],
    queryFn: async () => {
      const response = await boqService.getSuggestions(type);
      return (response.data?.suggestions || [])
        .map((s) => s.value)
        .filter((v): v is string => Boolean(v));
    },
    staleTime: 1000 * 60 * 60, // 1 hour — suggestions change rarely
    gcTime: 1000 * 60 * 60 * 4, // keep in cache 4h even after last unmount
  });
  return data ?? [];
}
