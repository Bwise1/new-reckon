import { create } from 'zustand';
import { commentSync } from '@/services/comments.service';
import { syncQueue } from '@/services/syncQueue';
import {
  commentTargetKey,
  type CommentAnchorKind,
  type CommentAuthor,
  type CommentEntry,
  type CommentMember,
  type CommentThread,
} from '@/types/comments';

/**
 * Comment threads for the open project, keyed by their target
 * (`boq_item:<uuid>` / `boq_element:<uuid>`). Writes are optimistic and go
 * through the same sync queue as measurements, so they work offline and
 * replay in order. Hydrated from GET /comments alongside the BOQ tree.
 */
interface CommentsState {
  projectId: string | null;
  threads: Record<string, CommentThread>;
  /** People who can see the project — the mention picker's list. */
  members: CommentMember[];
  load: (projectId: string) => Promise<void>;
  /** Refetch threads only (members untouched) — after a remote comment op. */
  reloadThreads: () => Promise<void>;
  clear: () => void;
  /** Silent remote updates (no sync-queue write). */
  applyRemoteStatus: (threadClientUuid: string, status: 'open' | 'resolved') => void;
  applyRemoteDelete: (commentClientUuid: string) => void;
  threadFor: (kind: CommentAnchorKind, anchorClientUuid: string) => CommentThread | undefined;
  addComment: (
    kind: CommentAnchorKind,
    anchorClientUuid: string,
    body: string,
    author: CommentAuthor,
    mentions?: number[]
  ) => void;
  setResolved: (kind: CommentAnchorKind, anchorClientUuid: string, resolved: boolean) => void;
  deleteComment: (kind: CommentAnchorKind, anchorClientUuid: string, commentClientUuid: string) => void;
}

const uuid = () => crypto.randomUUID();

export const useCommentsStore = create<CommentsState>((set, get) => ({
  projectId: null,
  threads: {},
  members: [],

  load: async (projectId) => {
    set({ projectId });
    commentSync
      .members(projectId)
      .then((r) => set({ members: r.data.members }))
      .catch((error) => console.warn('[comments] members failed', error));
    await get().reloadThreads();
  },

  reloadThreads: async () => {
    const { projectId } = get();
    if (!projectId) return;
    try {
      const res = await commentSync.list(projectId);
      if (get().projectId !== projectId) return;
      const threads: Record<string, CommentThread> = {};
      for (const t of res.data.threads) {
        if (t.anchorKind !== 'boq_element' && t.anchorKind !== 'boq_item') continue;
        threads[commentTargetKey(t.anchorKind, t.anchorClientUuid)] = t;
      }
      // Keep any optimistic threads created while the fetch was in flight.
      set((s) => ({ threads: { ...threads, ...pendingOnly(s.threads) } }));
    } catch (error) {
      console.warn('[comments] load failed', error);
    }
  },

  clear: () => set({ projectId: null, threads: {}, members: [] }),

  applyRemoteStatus: (threadClientUuid, status) =>
    set((s) => {
      const entry = Object.entries(s.threads).find(([, t]) => t.clientUuid === threadClientUuid);
      if (!entry) return s;
      const [key, thread] = entry;
      if (thread.status === status) return s;
      return { threads: { ...s.threads, [key]: { ...thread, status } } };
    }),

  applyRemoteDelete: (commentClientUuid) =>
    set((s) => {
      const entry = Object.entries(s.threads).find(([, t]) =>
        t.comments.some((c) => c.clientUuid === commentClientUuid)
      );
      if (!entry) return s;
      const [key, thread] = entry;
      const comments = thread.comments.filter((c) => c.clientUuid !== commentClientUuid);
      const next = { ...s.threads };
      if (comments.length === 0) delete next[key];
      else next[key] = { ...thread, comments };
      return { threads: next };
    }),

  threadFor: (kind, anchorClientUuid) => get().threads[commentTargetKey(kind, anchorClientUuid)],

  addComment: (kind, anchorClientUuid, body, author, mentions = []) => {
    const { projectId } = get();
    if (!projectId) return;
    const key = commentTargetKey(kind, anchorClientUuid);
    const existing = get().threads[key];
    const threadClientUuid = existing?.clientUuid ?? uuid();
    const entry: CommentEntry = {
      clientUuid: uuid(),
      body,
      mentions,
      author,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    const thread: CommentThread = existing
      ? { ...existing, status: 'open', comments: [...existing.comments, entry] }
      : { clientUuid: threadClientUuid, anchorKind: kind, anchorClientUuid, status: 'open', comments: [entry] };
    set((s) => ({ threads: { ...s.threads, [key]: thread } }));

    syncQueue.enqueue({
      kind: 'comment.create',
      projectId,
      clientUuid: entry.clientUuid,
      body: {
        thread: { client_uuid: threadClientUuid, anchor_kind: kind, anchor_client_uuid: anchorClientUuid },
        comment: { client_uuid: entry.clientUuid, body, mentions },
      },
    });
    // Mark it landed on the next successful drain cycle.
    const unsubscribe = syncQueue.subscribe?.(() => {
      if (syncQueue.size(projectId) === 0) {
        set((s) => {
          const t = s.threads[key];
          if (!t) return {};
          return {
            threads: {
              ...s.threads,
              [key]: { ...t, comments: t.comments.map((c) => (c.pending ? { ...c, pending: false } : c)) },
            },
          };
        });
        unsubscribe?.();
      }
    });
  },

  setResolved: (kind, anchorClientUuid, resolved) => {
    const { projectId } = get();
    const key = commentTargetKey(kind, anchorClientUuid);
    const thread = get().threads[key];
    if (!projectId || !thread) return;
    set((s) => ({ threads: { ...s.threads, [key]: { ...thread, status: resolved ? 'resolved' : 'open' } } }));
    syncQueue.enqueue({
      kind: 'comment.thread.status',
      projectId,
      clientUuid: thread.clientUuid,
      status: resolved ? 'resolved' : 'open',
    });
  },

  deleteComment: (kind, anchorClientUuid, commentClientUuid) => {
    const { projectId } = get();
    const key = commentTargetKey(kind, anchorClientUuid);
    const thread = get().threads[key];
    if (!projectId || !thread) return;
    const comments = thread.comments.filter((c) => c.clientUuid !== commentClientUuid);
    set((s) => {
      const next = { ...s.threads };
      if (comments.length === 0) delete next[key];
      else next[key] = { ...thread, comments };
      return { threads: next };
    });
    syncQueue.enqueue({ kind: 'comment.delete', projectId, clientUuid: commentClientUuid });
  },
}));

const pendingOnly = (threads: Record<string, CommentThread>) =>
  Object.fromEntries(
    Object.entries(threads).filter(([, t]) => t.comments.some((c) => c.pending))
  );
