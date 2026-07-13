import {
  calibrationSync,
  measurementSync,
  type CalibrationUpsertBody,
  type MeasurementCreateBody,
  type MeasurementPatchBody,
} from '@/services/entitySync.service';

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
 *   - measurement.delete on a uuid pending create → both dropped.
 *   - measurement.delete on a uuid pending update → drop the update.
 *   - calibration.upsert on the same (planUuid, page) → latest wins (older dropped).
 *   - calibration.delete on a (planUuid, page) with pending upsert → drop the upsert.
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
    };

const QUEUE_KEY = (projectId: string) => `reckon_sync_queue_${projectId}`;
const MAX_BACKOFF_MS = 30_000;

type QueueMap = Record<string, SyncOp[]>;
const queues: QueueMap = {};
type DrainerState = {
  running: boolean;
  backoffMs: number;
  scheduled: number | null;
};
const drainers: Record<string, DrainerState> = {};

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

const dedupOnEnqueue = (queue: SyncOp[], op: SyncOp): SyncOp[] => {
  switch (op.kind) {
    case 'measurement.update': {
      // Fold into a pending create for the same uuid.
      const createIdx = queue.findIndex(
        (q) =>
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
        (q) => q.kind === 'measurement.update' && q.clientUuid === op.clientUuid
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
      // Delete after pending create → drop both, the row never existed on server.
      const createIdx = queue.findIndex(
        (q) =>
          q.kind === 'measurement.create' && q.body.client_uuid === op.clientUuid
      );
      if (createIdx !== -1) {
        queue.splice(createIdx, 1);
        // Drop any pending updates too.
        return queue.filter(
          (q) => !(q.kind === 'measurement.update' && q.clientUuid === op.clientUuid)
        );
      }
      // Drop pending updates that are about to be overwritten.
      const filtered = queue.filter(
        (q) => !(q.kind === 'measurement.update' && q.clientUuid === op.clientUuid)
      );
      filtered.push(op);
      return filtered;
    }
    case 'calibration.upsert': {
      const filtered = queue.filter(
        (q) =>
          !(
            (q.kind === 'calibration.upsert' || q.kind === 'calibration.delete') &&
            q.planUuid === op.planUuid &&
            q.page === op.page
          )
      );
      filtered.push(op);
      return filtered;
    }
    case 'calibration.delete': {
      const filtered = queue.filter(
        (q) =>
          !(
            (q.kind === 'calibration.upsert' || q.kind === 'calibration.delete') &&
            q.planUuid === op.planUuid &&
            q.page === op.page
          )
      );
      filtered.push(op);
      return filtered;
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
  }
};

const isClientError = (error: unknown): boolean => {
  const status =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;
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
    let queue = ensureQueue(projectId);
    while (queue.length > 0) {
      const op = queue[0];
      try {
        await runOp(op);
      } catch (error) {
        if (isClientError(error)) {
          console.warn('[syncQueue] dropping op after 4xx', op, error);
          queue.shift();
          writePersisted(projectId);
          continue;
        }
        // Transient (5xx/network). Keep the op at the head and back off.
        console.warn(
          `[syncQueue] transient failure — backing off ${state.backoffMs}ms`,
          error
        );
        state.running = false;
        scheduleDrain(projectId, state.backoffMs);
        state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
        return;
      }
      queue.shift();
      writePersisted(projectId);
      state.backoffMs = 500; // reset after a success
      queue = ensureQueue(projectId);
    }
  } finally {
    state.running = false;
  }
};

export const syncQueue = {
  enqueue: (op: SyncOp): void => {
    const queue = ensureQueue(op.projectId);
    queues[op.projectId] = dedupOnEnqueue(queue, op);
    writePersisted(op.projectId);
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
};
