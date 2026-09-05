import { useEffect, useRef } from 'react';
import { REALTIME_ENABLED, RESYNC_DEBOUNCE_MS } from '@/realtime/config';
import { realtimeSocket } from '@/realtime/socket';
import {
  acquireLock,
  cancelPendingSends,
  releaseLock,
  sendCursor,
  sendDraft,
} from '@/realtime/actions';
import type { ServerToClientEvents } from '@/realtime/types';
import { useRealtimeStore } from '@/store/useRealtimeStore';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { hydrateProjectFromServer } from '@/hooks/useProjectData';
import { getProjectMeta } from '@/utils/projectMeta';

/**
 * Lifecycle of the live-collaboration session for the open project: joins
 * the project room on mount, leaves on unmount, funnels every inbound event
 * into useRealtimeStore / useTakeoffStore, and refetches the project after a
 * reconnect (debounced) because ops broadcast during the outage were missed.
 *
 * Gate: `VITE_REALTIME=off` makes this a no-op.
 */
export const useProjectRealtime = (projectId: string | undefined) => {
  const numericId = projectId ? Number(projectId) : NaN;
  const enabled =
    REALTIME_ENABLED && Number.isFinite(numericId) && Boolean(localStorage.getItem('token'));
  const connected = useRealtimeStore((s) => s.connected);
  const resyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const pid = numericId;
    const store = useRealtimeStore.getState();
    let hasJoinedOnce = false;
    let disposed = false;

    const join = () => {
      realtimeSocket.emit('project.join', { projectId: pid }, (ack) => {
        if (disposed) return;
        if (!ack.ok) {
          console.warn('[realtime] join refused', ack.error);
          return;
        }
        store.setJoined(pid, ack.self, ack.members, ack.locks, ack.rev);
        if (hasJoinedOnce) scheduleResync();
        hasJoinedOnce = true;
      });
    };

    const scheduleResync = () => {
      if (resyncTimerRef.current !== null) window.clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = window.setTimeout(() => {
        resyncTimerRef.current = null;
        if (disposed) return;
        const isStale = () => disposed || useTakeoffStore.getState().currentProjectId !== projectId;
        const clientUuid = getProjectMeta(projectId)?.clientUuid ?? null;
        void hydrateProjectFromServer(projectId, clientUuid, isStale).catch((error) =>
          console.warn('[realtime] resync after reconnect failed', error)
        );
      }, RESYNC_DEBOUNCE_MS);
    };

    const onConnect = () => {
      store.setConnected(true);
      join();
    };
    const onDisconnect = () => {
      store.setConnected(false);
      cancelPendingSends();
    };
    const onPresence: ServerToClientEvents['presence.state'] = (members) => store.setMembers(members);
    const onCursor: ServerToClientEvents['cursor'] = (e) => {
      if (e.userId === useRealtimeStore.getState().self?.userId) return;
      store.setCursor(e.userId, e.page, e.x, e.y);
    };
    const onDraft: ServerToClientEvents['draft'] = (e) => {
      if (e.userId === useRealtimeStore.getState().self?.userId) return;
      store.setDraft(e.userId, { page: e.page, tool: e.tool, points: e.points ?? [] });
    };
    const onLock: ServerToClientEvents['lock.state'] = (state) => store.setLock(state);
    const onOp: ServerToClientEvents['op'] = (op) => {
      if (typeof op.rev === 'number') store.setRev(op.rev);
      useTakeoffStore.getState().applyRemoteOp(op);
    };

    const socket = realtimeSocket.get();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence.state', onPresence);
    socket.on('cursor', onCursor);
    socket.on('draft', onDraft);
    socket.on('lock.state', onLock);
    socket.on('op', onOp);

    if (socket.connected) onConnect();
    else realtimeSocket.connect();

    return () => {
      disposed = true;
      if (resyncTimerRef.current !== null) {
        window.clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
      cancelPendingSends();
      if (socket.connected) realtimeSocket.emit('project.leave', { projectId: pid });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence.state', onPresence);
      socket.off('cursor', onCursor);
      socket.off('draft', onDraft);
      socket.off('lock.state', onLock);
      socket.off('op', onOp);
      store.reset();
      // Nothing else uses the socket outside a takeoff page — close it so a
      // backgrounded dashboard tab holds no idle connection.
      realtimeSocket.disconnect();
    };
  }, [enabled, projectId, numericId]);

  return { connected, sendCursor, sendDraft, acquireLock, releaseLock };
};
