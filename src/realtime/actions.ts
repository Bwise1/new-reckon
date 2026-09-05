import { CURSOR_HZ, DRAFT_HZ, REALTIME_ENABLED } from '@/realtime/config';
import { realtimeSocket } from '@/realtime/socket';
import { throttleTrailing } from '@/realtime/throttle';
import type { LockAck, LockEntityType } from '@/realtime/types';
import { useRealtimeStore } from '@/store/useRealtimeStore';
import { projectCan } from '@/store/useProjectAccessStore';
import type { Point } from '@/types/takeoff';

/**
 * Outbound collaboration messages. Module-level so the canvas, the BOQ
 * sidebar and the lifecycle hook all talk to the same throttles without
 * prop-drilling; every sender no-ops unless a project is currently joined.
 */

const joinedProjectId = (): number | null => useRealtimeStore.getState().projectId;

const canSend = (): boolean =>
  REALTIME_ENABLED && joinedProjectId() !== null && realtimeSocket.connected;

const emitCursor = throttleTrailing((planId: string | null, page: number, x: number, y: number) => {
  const projectId = joinedProjectId();
  if (projectId === null || !realtimeSocket.connected) return;
  // Volatile: a cursor sample that cannot go out right now is worthless by
  // the time the socket recovers — drop it rather than queue it.
  realtimeSocket.get().volatile.emit('cursor', { projectId, planId, page, x, y });
}, 1000 / CURSOR_HZ);

const emitDraft = throttleTrailing((planId: string | null, page: number, tool: string | null, points: Point[]) => {
  const projectId = joinedProjectId();
  if (projectId === null || !realtimeSocket.connected) return;
  realtimeSocket.get().volatile.emit('draft', { projectId, planId, page, tool, points });
}, 1000 / DRAFT_HZ);

/** Plan-pixel cursor position on `page` (the stored-measurement space). */
export const sendCursor = (planId: string | null, page: number, x: number, y: number): void => {
  if (!canSend()) return;
  emitCursor(planId, page, x, y);
};

/**
 * The in-progress run (`currentPoints`). Send `points: []` when a run ends or
 * is cancelled so the other side clears it. Read-only roles never draft.
 */
export const sendDraft = (planId: string | null, page: number, tool: string | null, points: Point[]): void => {
  if (!canSend() || !projectCan().edit) return;
  emitDraft(planId, page, tool, points);
};

const LOCK_ACK_TIMEOUT_MS = 5000;

/**
 * Ask for an edit lock. Resolves `{ ok: true }` when we hold it (also when
 * re-acquiring to refresh the TTL). Offline or disabled: optimistic `ok`, so
 * a flaky socket never blocks the user's own editing — the server is the
 * arbiter once we are back.
 */
export const acquireLock = (entityType: LockEntityType, entityId: string): Promise<LockAck> => {
  const projectId = joinedProjectId();
  if (!REALTIME_ENABLED || projectId === null || !realtimeSocket.connected) {
    return Promise.resolve({ ok: true, holder: null });
  }
  return new Promise<LockAck>((resolve) => {
    realtimeSocket
      .get()
      .timeout(LOCK_ACK_TIMEOUT_MS)
      .emit('lock.acquire', { projectId, entityType, entityId }, (error, ack) => {
        if (error) {
          resolve({ ok: true, holder: null });
          return;
        }
        // Mirror the ack locally so our own lock outlines/UI update even if
        // the server only broadcasts lock.state to OTHER members.
        const self = useRealtimeStore.getState().self;
        useRealtimeStore.getState().setLock({
          entityType,
          entityId,
          holder: ack.ok ? self : ack.holder,
        });
        resolve(ack);
      });
  });
};

export const releaseLock = (entityType: LockEntityType, entityId: string): void => {
  const projectId = joinedProjectId();
  if (!REALTIME_ENABLED || projectId === null) return;
  realtimeSocket.emit('lock.release', { projectId, entityType, entityId });
  const current = useRealtimeStore.getState().locks[`${entityType}:${entityId}`];
  const self = useRealtimeStore.getState().self;
  if (current && self && current.userId === self.userId) {
    useRealtimeStore.getState().setLock({ entityType, entityId, holder: null });
  }
};

export const cancelPendingSends = (): void => {
  emitCursor.cancel();
  emitDraft.cancel();
};
