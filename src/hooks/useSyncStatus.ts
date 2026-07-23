import { useSyncExternalStore } from 'react';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { syncQueue } from '@/services/syncQueue';
import { connectivity } from '@/services/connectivity';

export function useSyncStatus() {
  const currentProjectId = useTakeoffStore((state) => state.currentProjectId);

  const isOnline = useSyncExternalStore(
    connectivity.subscribe,
    connectivity.isOnline,
    () => true
  );

  const pendingCount = useSyncExternalStore(
    syncQueue.subscribe,
    () => (currentProjectId ? syncQueue.size(currentProjectId) : 0),
    () => 0
  );

  return { isOnline, pendingCount };
}
