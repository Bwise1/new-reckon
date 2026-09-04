import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { membersService } from '@/services/members.service';
import type { AssignableRole } from '@/types/members';

export function useProjectMembers(projectId: string | null) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => membersService.list(projectId as string).then((r) => r.data),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}

/** Every write invalidates the member list and the projects list (avatars). */
export function useMemberMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project-members', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };
  return {
    invite: useMutation({
      mutationFn: ({ email, role }: { email: string; role: AssignableRole }) =>
        membersService.invite(projectId, email, role).then((r) => r.data),
      onSuccess: refresh,
    }),
    resend: useMutation({
      mutationFn: (inviteId: string) => membersService.resendInvite(projectId, inviteId),
    }),
    cancel: useMutation({
      mutationFn: (inviteId: string) => membersService.cancelInvite(projectId, inviteId),
      onSuccess: refresh,
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: number; role: AssignableRole }) =>
        membersService.setRole(projectId, userId, role),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: number) => membersService.remove(projectId, userId),
      onSuccess: refresh,
    }),
  };
}
