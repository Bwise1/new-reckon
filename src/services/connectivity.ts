import { useTakeoffStore } from '@/store/useTakeoffStore';
import { syncQueue } from '@/services/syncQueue';

/**
 * Tracks browser online/offline state and auto-resumes the sync queue
 * drain for the active project when connectivity returns. Without this,
 * a queue left backed off after a long offline period only retries on
 * its own timer (up to a 30s cap) or on next project mount.
 */

const listeners = new Set<() => void>();
const notifyListeners = (): void => {
  listeners.forEach((cb) => cb());
};

const handleOnline = (): void => {
  notifyListeners();
  const projectId = useTakeoffStore.getState().currentProjectId;
  if (projectId) syncQueue.resume(projectId);
};

const handleOffline = (): void => {
  notifyListeners();
};

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

export const connectivity = {
  isOnline: (): boolean => navigator.onLine,
  subscribe: (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
