import { apiClient } from '@/lib/api-client';
import type { CommentAnchorKind, CommentThread } from '@/types/comments';

export interface AddCommentBody {
  thread: { client_uuid: string; anchor_kind: CommentAnchorKind; anchor_client_uuid: string };
  comment: { client_uuid: string; body: string };
}

export const commentSync = {
  list: (projectId: string) =>
    apiClient.get<{ data: { threads: CommentThread[] } }>(`/projects/${projectId}/comments`),
  add: (projectId: string, body: AddCommentBody) =>
    apiClient.post<{ data: { threadClientUuid: string } }>(`/projects/${projectId}/comments`, body),
  setStatus: (projectId: string, threadClientUuid: string, status: 'open' | 'resolved') =>
    apiClient.patch<{ data?: unknown }>(`/projects/${projectId}/comments/threads/${threadClientUuid}`, { status }),
  remove: (projectId: string, commentClientUuid: string) =>
    apiClient.delete<{ data?: unknown }>(`/projects/${projectId}/comments/${commentClientUuid}`),
};
