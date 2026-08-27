import {
  boqSync,
  calibrationSync,
  measurementSync,
  type BoqBillUpsertBody,
  type BoqElementUpsertBody,
  type BoqHistoryUpsertBody,
  type BoqItemUpsertBody,
  type CalibrationUpsertBody,
  type MeasurementCreateBody,
  type MeasurementPatchBody,
} from '@/services/entitySync.service';
import { ApiError } from '@/lib/api-client';

/**
 * Small persisted queue of pending sync operations. See docs/sync-rebuild.md.
 *
 * Ops are drained sequentially per project. On network failure the current
 * op is retried with exponential backoff; other pending ops wait. On a 4xx
 * response the op is dropped with a warning — replaying wouldn't help.
 *
 * Dedup rules (applied at enqueue time):
 *   - measurement.update on a client_uuid pending create → merged into the create.
 *   - two measurement.update on the same uuid → merged (patch overlay).
 *   - measurement.delete on a uuid pending create → drop the create, but the
 *     delete still runs (a timed-out create may have landed; 404 is dropped).
 *   - measurement.delete on a uuid pending update → drop the update.
 *   - calibration.upsert on the same (planUuid, page) → latest wins (older dropped).
 *   - calibration.delete on a (planUuid, page) with pending upsert → drop the upsert.
 *
 * IN-FLIGHT EXCEPTION: an op currently being sent is NOT "pending" — it will
 * reach the server no matter what dedup decides. Cancelling a delete against
 * an in-flight create let the create land and the row resurrect on the next
 * hydration. Dedup therefore never merges into, removes, or cancels against
 * the in-flight op; new ops queue behind it and replay on top server-side.
 */

export type SyncOp =
  | {
      kind: 'measurement.create';
      projectId: string;
      body: MeasurementCreateBody;
    }
  | {
      kind: 'measurement.update';
      projectId: string;
      clientUuid: string;
      patch: MeasurementPatchBody;
    }
  | {
      kind: 'measurement.delete';
      projectId: string;
      clientUuid: string;
    }
  | {
      kind: 'calibration.upsert';
      projectId: string;
      planUuid: string;
      page: number;
      body: CalibrationUpsertBody;
    }
  | {
      kind: 'calibration.delete';
      projectId: string;
      planUuid: string;
      page: number;
    }
  | {
      kind: 'boq.bill.upsert';
      projectId: string;
      clientUuid: string;
      body: BoqBillUpsertBody;
    }
  | {
      kind: 'boq.bill.delete';
      projectId: string;
      clientUuid: string;
    }
  | {
      kind: 'boq.element.upsert';
      projectId: string;
      clientUuid: string;
      body: BoqElementUpsertBody;
    }
  | {
      kind: 'boq.element.delete';
      projectId: string;
      clientUuid: string;
    }
  | {
      kind: 'boq.item.upsert';
      projectId: string;
      clientUuid: string;
      body: BoqItemUpsertBody;
    }
  | {
      kind: 'boq.item.delete';
      projectId: string;
      clientUuid: string;
    }
  | {
      kind: 'boq.history.upsert';
      projectId: string;
      clientUuid: string;
      body: BoqHistoryUpsertBody;
    }
  | {
      kind: 'boq.history.delete';
      projectId: string;
      clientUuid: string;
    };

const QUEUE_KEY = (projectId: string) => `reckon_sync_queue_${projectId}`;
const MAX_BACKOFF_MS = 30_000;
/** Starting delay for auth/throttle failures, which need a token refresh. */
const AUTH_RETRY_BACKOFF_MS = 5_000;

type QueueMap = Record<string, SyncOp[]>;
const queues: QueueMap = {};
type DrainerState = {
  running: boolean;
  backoffMs: number;
  scheduled: number | null;
};
const drainers: Record<string, DrainerState> = {};
// The op currently being sent, per project. It stays in the queue while in
// flight (so size() and the hydration guard still count it), but dedup must
// treat it as already-on-the-server. See the IN-FLIGHT EXCEPTION above.
const inFlightOps: Record<string, SyncOp | null> = {};

// Notified whenever any project's queue length changes, so UI (e.g. a
// pending-sync-count badge) can react without polling.
const listeners = new Set<() => void>();
const notifyListeners = (): void => {
  listeners.forEach((cb) => cb());
};

const readPersisted = (projectId: string): SyncOp[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncOp[]) : [];
  } catch {
    return [];
  }
};

const writePersisted = (projectId: string): void => {
  try {
    const queue = queues[projectId] ?? [];
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_KEY(projectId));
      return;
    }
    localStorage.setItem(QUEUE_KEY(projectId), JSON.stringify(queue));
  } catch (error) {
    console.warn('[syncQueue] failed to persist', error);
  }
};

const ensureQueue = (projectId: string): SyncOp[] => {
  if (!queues[projectId]) {
    queues[projectId] = readPersisted(projectId);
  }
  return queues[projectId];
};

const dedupOnEnqueue = (
  queue: SyncOp[],
  op: SyncOp,
  inFlight: SyncOp | null
): SyncOp[] => {
  // An in-flight op is already on the wire — never merge into it, replace it,
  // or cancel against it. The drain removes it by identity when it completes.
  const pending = (q: SyncOp) => q !== inFlight;
  switch (op.kind) {
    case 'measurement.update': {
      // Fold into a pending create for the same uuid.
      const createIdx = queue.findIndex(
        (q) =>
          pending(q) &&
          q.kind === 'measurement.create' && q.body.client_uuid === op.clientUuid
      );
      if (createIdx !== -1) {
        const existing = queue[createIdx];
        if (existing.kind === 'measurement.create') {
          queue[createIdx] = {
            ...existing,
            body: { ...existing.body, ...op.patch },
          };
          return queue;
        }
      }
      // Merge with a prior update for the same uuid (last wins per field).
      const updateIdx = queue.findIndex(
        (q) =>
          pending(q) &&
          q.kind === 'measurement.update' && q.clientUuid === op.clientUuid
      );
      if (updateIdx !== -1) {
        const existing = queue[updateIdx];
        if (existing.kind === 'measurement.update') {
          queue[updateIdx] = {
            ...existing,
            patch: { ...existing.patch, ...op.patch },
          };
          return queue;
        }
      }
      queue.push(op);
      return queue;
    }
    case 'measurement.delete': {
      // Delete after pending create → drop both, the row never existed on
      // server. Only for creates that are NOT in flight — an in-flight create
      // WILL land, so the delete must queue behind it and remove the row.
      const createIdx = queue.findIndex(
        (q) =>
          pending(q) &&
          q.kind === 'measurement.create' && q.body.client_uuid === op.clientUuid
      );
      if (createIdx !== -1) queue.splice(createIdx, 1);
      // Drop pending updates that are about to be overwritten, then queue the
      // delete EVEN when a pending create was cancelled: a create that failed
      // "transiently" (timeout) may still have landed server-side, and the
      // delete is the only thing standing between that row and resurrection.
      // If the row truly never existed the server 404s and the op is dropped.
      const filtered = queue.filter(
        (q) =>
          !pending(q) ||
          !(q.kind === 'measurement.update' && q.clientUuid === op.clientUuid)
      );
      filtered.push(op);
      return filtered;
    }
    case 'calibration.upsert':
    case 'calibration.delete': {
      const filtered = queue.filter(
        (q) =>
          !pending(q) ||
          !(
            (q.kind === 'calibration.upsert' || q.kind === 'calibration.delete') &&
            q.planUuid === op.planUuid &&
            q.page === op.page
          )
      );
      filtered.push(op);
      return filtered;
    }
    // BOQ upserts collapse to the latest state per client_uuid. Two upserts
    // on the same uuid replay-safe if we only keep the newest; older is
    // wasted network. Delete after a not-yet-flushed upsert cancels both.
    case 'boq.bill.upsert':
    case 'boq.element.upsert':
    case 'boq.item.upsert':
    case 'boq.history.upsert': {
      const kind = op.kind;
      const filtered = queue.filter(
        (q) => !pending(q) || !(q.kind === kind && q.clientUuid === op.clientUuid)
      );
      filtered.push(op);
      return filtered;
    }
    case 'boq.bill.delete':
    case 'boq.element.delete':
    case 'boq.item.delete':
    case 'boq.history.delete': {
      const upsertKind =
        op.kind === 'boq.bill.delete'
          ? 'boq.bill.upsert'
          : op.kind === 'boq.element.delete'
            ? 'boq.element.upsert'
            : op.kind === 'boq.item.delete'
              ? 'boq.item.upsert'
              : 'boq.history.upsert';
      // Cancel a pending upsert, but still send the delete — an ambiguous
      // network failure could mean the upsert landed (see measurement.delete
      // above); a 404 on the delete is dropped harmlessly.
      const upsertIdx = queue.findIndex(
        (q) =>
          pending(q) && q.kind === upsertKind && q.clientUuid === op.clientUuid
      );
      if (upsertIdx !== -1) queue.splice(upsertIdx, 1);
      queue.push(op);
      return queue;
    }
    case 'measurement.create':
    default:
      queue.push(op);
      return queue;
  }
};

const runOp = async (op: SyncOp): Promise<void> => {
  switch (op.kind) {
    case 'measurement.create':
      await measurementSync.create(op.projectId, op.body);
      return;
    case 'measurement.update':
      await measurementSync.update(op.projectId, op.clientUuid, op.patch);
      return;
    case 'measurement.delete':
      await measurementSync.delete(op.projectId, op.clientUuid);
      return;
    case 'calibration.upsert':
      await calibrationSync.upsert(op.projectId, op.planUuid, op.page, op.body);
      return;
    case 'calibration.delete':
      await calibrationSync.delete(op.projectId, op.planUuid, op.page);
      return;
    case 'boq.bill.upsert':
      await boqSync.upsertBill(op.projectId, op.clientUuid, op.body);
      return;
    case 'boq.bill.delete':
      await boqSync.deleteBill(op.projectId, op.clientUuid);
      return;
    case 'boq.element.upsert':
      await boqSync.upsertElement(op.projectId, op.clientUuid, op.body);
      return;
    case 'boq.element.delete':
      await boqSync.deleteElement(op.projectId, op.clientUuid);
      return;
    case 'boq.item.upsert':
      await boqSync.upsertItem(op.projectId, op.clientUuid, op.body);
      return;
    case 'boq.item.delete':
      await boqSync.deleteItem(op.projectId, op.clientUuid);
      return;
    case 'boq.history.upsert':
      await boqSync.upsertHistory(op.projectId, op.clientUuid, op.body);
      return;
    case 'boq.history.delete':
      await boqSync.deleteHistory(op.projectId, op.clientUuid);
      return;
  }
};

const statusOf = (error: unknown): number | undefined =>
  error instanceof ApiError
    ? error.status
    : typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;

/**
 * 401/403 (expired or not-yet-refreshed token) and 429 (throttled) look like
 * client errors but are transient from the user's point of view. Dropping the
 * op on those destroyed queued offline edits the moment a token expired, so
 * they are retried with backoff instead.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([401, 403, 408, 429]);

const isRetryableStatus = (status: number | undefined): boolean =>
  typeof status === 'number' && RETRYABLE_CLIENT_STATUSES.has(status);

const isClientError = (error: unknown): boolean => {
  const status = statusOf(error);
  if (isRetryableStatus(status)) return false;
  return typeof status === 'number' && status >= 400 && status < 500;
};

const drainerFor = (projectId: string): DrainerState => {
  if (!drainers[projectId]) {
    drainers[projectId] = { running: false, backoffMs: 500, scheduled: null };
  }
  return drainers[projectId];
};

const scheduleDrain = (projectId: string, delayMs = 0): void => {
  const state = drainerFor(projectId);
  if (state.running) return;
  if (state.scheduled !== null) return;
  state.scheduled = window.setTimeout(() => {
    state.scheduled = null;
    void drainInternal(projectId);
  }, delayMs);
};

const drainInternal = async (projectId: string): Promise<void> => {
  const state = drainerFor(projectId);
  if (state.running) return;
  state.running = true;
  try {
    // Dedup may REPLACE queues[projectId] with a new array while an op is in
    // flight (its filter paths build fresh arrays), so the drained op must be
    // removed from the LIVE queue by identity — a shift() on the array
    // captured before the await could mutate a dead array and leave the
    // completed op queued, replaying it forever.
    const removeCompleted = (op: SyncOp) => {
      const live = ensureQueue(projectId);
      const idx = live.indexOf(op);
      if (idx !== -1) live.splice(idx, 1);
      writePersisted(projectId);
      notifyListeners();
    };
    let queue = ensureQueue(projectId);
    while (queue.length > 0) {
      const op = queue[0];
      inFlightOps[projectId] = op;
      try {
        await runOp(op);
      } catch (error) {
        if (isClientError(error)) {
          console.warn('[syncQueue] dropping op after 4xx', op, error);
          removeCompleted(op);
          continue;
        }
        // Transient (5xx/network/auth/throttle). Keep the op at the head and
        // back off. Auth failures start from a longer delay: they only clear
        // once the token is refreshed or the user signs back in, so retrying
        // every 500ms just burns requests.
        const status = statusOf(error);
        if (isRetryableStatus(status)) {
          state.backoffMs = Math.max(state.backoffMs, AUTH_RETRY_BACKOFF_MS);
        }
        console.warn(
          `[syncQueue] transient failure — backing off ${state.backoffMs}ms`,
          error
        );
        state.running = false;
        scheduleDrain(projectId, state.backoffMs);
        state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
        return;
      } finally {
        inFlightOps[projectId] = null;
      }
      removeCompleted(op);
      state.backoffMs = 500; // reset after a success
      queue = ensureQueue(projectId);
    }
  } finally {
    state.running = false;
    inFlightOps[projectId] = null;
  }
};

export const syncQueue = {
  enqueue: (op: SyncOp): void => {
    const queue = ensureQueue(op.projectId);
    queues[op.projectId] = dedupOnEnqueue(
      queue,
      op,
      inFlightOps[op.projectId] ?? null
    );
    writePersisted(op.projectId);
    notifyListeners();
    scheduleDrain(op.projectId, 0);
  },

  /** Force a drain attempt now — useful on unmount or before nav. */
  flush: async (projectId: string): Promise<void> => {
    const state = drainerFor(projectId);
    if (state.scheduled !== null) {
      clearTimeout(state.scheduled);
      state.scheduled = null;
    }
    await drainInternal(projectId);
  },

  /** Number of pending ops (for debugging). */
  size: (projectId: string): number => ensureQueue(projectId).length,

  /** Restart drain for a project that had queued ops from a previous session. */
  resume: (projectId: string): void => {
    const q = ensureQueue(projectId);
    if (q.length > 0) scheduleDrain(projectId, 0);
  },

  /** Subscribe to queue-length changes across all projects (for UI status). */
  subscribe: (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
