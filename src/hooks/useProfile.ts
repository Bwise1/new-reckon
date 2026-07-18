import { useQuery } from '@tanstack/react-query';
import { userService } from '@/services/user.service';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => userService.getProfile(),
    staleTime: 5 * 60 * 1000,
  });
}
