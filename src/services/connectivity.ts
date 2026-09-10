import { useTakeoffStore } from '@/store/useTakeoffStore';
import { syncQueue } from '@/services/syncQueue';

/**
 * Tracks browser online/offline state and auto-resumes the sync queue
 * drain for the active project when connectivity returns. Without this,
 * a queue left backed off after a long offline period only retries on
 * its own timer (up to a 30s cap) or on next project mount.
 *
 * The `online` event alone is not enough to rely on. Chrome routinely fails
 * to fire it after a sleep/wake, a VPN change or a network switch:
 * `navigator.onLine` flips back to true silently, nothing notifies us, and
 * the status badge stays on "Offline" until the page is reloaded. That is
 * not cosmetic — Export and Preview are gated on it, so a stuck flag blocks
 * exporting on a perfectly good connection. So the value is re-read whenever
 * the tab becomes visible or the window regains focus, which is exactly when
 * a machine comes back, and listeners are notified only when it actually
 * changed.
 */

const listeners = new Set<() => void>();
const notifyListeners = (): void => {
  listeners.forEach((cb) => cb());
};

/** Last value we told React about; the comparison point for a re-check. */
let lastKnown = typeof navigator === 'undefined' ? true : navigator.onLine;

const resumeQueue = (): void => {
  const projectId = useTakeoffStore.getState().currentProjectId;
  if (projectId) syncQueue.resume(projectId);
};

/**
 * Re-read the browser's flag and, if it moved, tell React and drain the
 * queue. Safe to call as often as we like: without a change it does nothing,
 * so it never causes a render.
 */
const recheck = (): void => {
  const online = navigator.onLine;
  if (online === lastKnown) return;
  lastKnown = online;
  notifyListeners();
  if (online) resumeQueue();
};

const handleOnline = (): void => {
  lastKnown = true;
  notifyListeners();
  resumeQueue();
};

const handleOffline = (): void => {
  lastKnown = false;
  notifyListeners();
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  // The recovery paths for a missed `online` event.
  window.addEventListener('focus', recheck);
  window.addEventListener('pageshow', recheck);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheck();
  });
}

export const connectivity = {
  isOnline: (): boolean => navigator.onLine,
  subscribe: (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Exposed for a manual re-check (e.g. a click on the status badge). */
  recheck,
};
