import { useQuery } from '@tanstack/react-query';
import { planService } from '@/services/plan.service';

export function useStorage() {
  return useQuery({
    queryKey: ['storage'],
    queryFn: () => planService.getStorageSummary(),
    staleTime: 60 * 1000,
  });
}
