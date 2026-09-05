import { useCallback, useEffect, useMemo, useRef } from 'react';
import { LOCK_TTL_MS } from '@/realtime/config';
import { acquireLock, releaseLock } from '@/realtime/actions';
import { lockKey, type LockAck, type LockEntityType, type Presence } from '@/realtime/types';
import { useRealtimeStore } from '@/store/useRealtimeStore';

/**
 * Holds at most ONE edit lock of a given entity type for this component:
 * acquiring another releases the previous one. While held, the lock is
 * refreshed by re-acquiring every LOCK_TTL_MS / 2, and (optionally) dropped
 * after `idleReleaseMs` without a `touch()`. `onLost` fires when the server
 * hands the lock to someone else (a refresh is refused, or a lock.state
 * arrives naming another holder).
 */
export interface EntityLockOptions {
  idleReleaseMs?: number;
  onLost?: (entityId: string, holder: Presence | null) => void;
}

export interface EntityLock {
  acquire: (entityId: string) => Promise<LockAck>;
  /** Pointer/keyboard activity on the held entity — re-arms the idle timer. */
  touch: () => void;
  /** Release the held lock (only if it is `entityId`, when given). */
  release: (entityId?: string) => void;
  isHeld: (entityId: string) => boolean;
}

interface Held {
  id: string;
  refreshTimer: number;
  idleTimer: number | null;
}

export const useEntityLock = (entityType: LockEntityType, options: EntityLockOptions = {}): EntityLock => {
  const heldRef = useRef<Held | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const clearTimers = (held: Held) => {
    window.clearInterval(held.refreshTimer);
    if (held.idleTimer !== null) window.clearTimeout(held.idleTimer);
  };

  const release = useCallback(
    (entityId?: string) => {
      const held = heldRef.current;
      if (!held || (entityId !== undefined && held.id !== entityId)) return;
      clearTimers(held);
      heldRef.current = null;
      releaseLock(entityType, held.id);
    },
    [entityType]
  );

  const armIdle = useCallback(
    (held: Held) => {
      const ms = optionsRef.current.idleReleaseMs;
      if (held.idleTimer !== null) window.clearTimeout(held.idleTimer);
      held.idleTimer =
        ms && ms > 0
          ? window.setTimeout(() => {
              if (heldRef.current !== held) return;
              release(held.id);
              optionsRef.current.onLost?.(held.id, null);
            }, ms)
          : null;
    },
    [release]
  );

  const touch = useCallback(() => {
    const held = heldRef.current;
    if (held) armIdle(held);
  }, [armIdle]);

  const acquire = useCallback(
    async (entityId: string): Promise<LockAck> => {
      if (heldRef.current?.id === entityId) {
        touch();
        return { ok: true, holder: useRealtimeStore.getState().self };
      }
      release();
      const ack = await acquireLock(entityType, entityId);
      if (!ack.ok) return ack;
      // We moved on to something else while the ack was in flight.
      if (heldRef.current && heldRef.current.id !== entityId) {
        releaseLock(entityType, entityId);
        return { ok: false, holder: null };
      }
      const held: Held = {
        id: entityId,
        idleTimer: null,
        refreshTimer: window.setInterval(() => {
          void acquireLock(entityType, entityId).then((refresh) => {
            if (refresh.ok || heldRef.current !== held) return;
            clearTimers(held);
            heldRef.current = null;
            optionsRef.current.onLost?.(entityId, refresh.holder);
          });
        }, LOCK_TTL_MS / 2),
      };
      heldRef.current = held;
      armIdle(held);
      return ack;
    },
    [entityType, release, touch, armIdle]
  );

  const isHeld = useCallback((entityId: string) => heldRef.current?.id === entityId, []);

  // Server-side takeover (our TTL lapsed and someone grabbed it).
  useEffect(
    () =>
      useRealtimeStore.subscribe((state) => {
        const held = heldRef.current;
        if (!held) return;
        const holder = state.locks[lockKey(entityType, held.id)];
        const self = state.self;
        if (holder && self && holder.userId !== self.userId) {
          clearTimers(held);
          heldRef.current = null;
          optionsRef.current.onLost?.(held.id, holder);
        }
      }),
    [entityType]
  );

  useEffect(() => () => release(), [release]);

  return useMemo(() => ({ acquire, touch, release, isHeld }), [acquire, touch, release, isHeld]);
};
