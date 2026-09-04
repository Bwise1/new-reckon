import { apiClient } from '@/lib/api-client';
import type {
  AssignableRole,
  InvitePreview,
  ProjectCapabilities,
  ProjectInvite,
  ProjectPerson,
  ProjectRole,
} from '@/types/members';

export const membersService = {
  list: (projectId: string) =>
    apiClient.get<{
      data: { members: ProjectPerson[]; invites: ProjectInvite[]; me: { role: ProjectRole; can: ProjectCapabilities } };
    }>(`/projects/${projectId}/members`),
  invite: (projectId: string, email: string, role: AssignableRole) =>
    apiClient.post<{ data: { added: boolean; inviteId?: string } }>(`/projects/${projectId}/members/invites`, { email, role }),
  resendInvite: (projectId: string, inviteId: string) =>
    apiClient.post<{ data?: unknown }>(`/projects/${projectId}/members/invites/${inviteId}/resend`, {}),
  cancelInvite: (projectId: string, inviteId: string) =>
    apiClient.delete<{ data?: unknown }>(`/projects/${projectId}/members/invites/${inviteId}`),
  setRole: (projectId: string, userId: number, role: AssignableRole) =>
    apiClient.patch<{ data?: unknown }>(`/projects/${projectId}/members/${userId}`, { role }),
  remove: (projectId: string, userId: number) =>
    apiClient.delete<{ data?: unknown }>(`/projects/${projectId}/members/${userId}`),
  invitePreview: (token: string) =>
    apiClient.get<{ data: { invite: InvitePreview } }>(`/invites/${token}`),
  acceptInvite: (token: string) =>
    apiClient.post<{ data: { projectId: number } }>(`/invites/${token}/accept`, {}),
};
