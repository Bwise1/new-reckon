import { create } from 'zustand';
import { CURSOR_ANIMATE_WINDOW_MS } from '@/realtime/config';
import { lockKey, type LockState, type Presence } from '@/realtime/types';
import type { Point } from '@/types/takeoff';

/**
 * Everything the collaboration UI reads: who is here, where their cursors
 * are, what they are mid-drawing, and which entities are locked. Fed by
 * useProjectRealtime; nothing here touches the takeoff store.
 */

export interface RemoteCursor {
  page: number;
  /** Rendered position (lerped towards the target each frame). */
  x: number;
  y: number;
  /** Latest position received from the server. */
  tx: number;
  ty: number;
  /** ms timestamp of the last update — drives the animation window. */
  at: number;
}

export interface RemoteDraft {
  page: number;
  tool: string | null;
  points: Point[];
}

interface RealtimeState {
  connected: boolean;
  /** Bill id of the joined project (null while not joined). */
  projectId: number | null;
  self: Presence | null;
  members: Presence[];
  cursors: Record<number, RemoteCursor>;
  drafts: Record<number, RemoteDraft>;
  /** `${entityType}:${entityId}` → holder (null = explicitly released). */
  locks: Record<string, Presence | null>;
  rev: number;

  setConnected: (connected: boolean) => void;
  setJoined: (projectId: number, self: Presence, members: Presence[], locks: LockState[], rev: number) => void;
  setMembers: (members: Presence[]) => void;
  setCursor: (userId: number, page: number, x: number, y: number) => void;
  setDraft: (userId: number, draft: RemoteDraft) => void;
  setLock: (state: LockState) => void;
  setRev: (rev: number) => void;
  reset: () => void;
}

const LERP = 0.35;
const EPSILON = 0.05;

let rafId: number | null = null;

/**
 * Cursor interpolation: the server sends ~30 Hz samples, the screen paints at
 * 60+. Each frame every recently-updated cursor moves a fraction of the way
 * to its latest target, which reads as smooth motion instead of a stutter.
 * The loop stops itself once no cursor has moved in the animation window.
 */
const stepCursors = () => {
  rafId = null;
  const state = useRealtimeStore.getState();
  const now = Date.now();
  let changed = false;
  let anyActive = false;
  const next: Record<number, RemoteCursor> = {};
  for (const [id, c] of Object.entries(state.cursors)) {
    const userId = Number(id);
    const active = now - c.at < CURSOR_ANIMATE_WINDOW_MS;
    if (active) anyActive = true;
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
      next[userId] = c.x === c.tx && c.y === c.ty ? c : { ...c, x: c.tx, y: c.ty };
      if (next[userId] !== c) changed = true;
      continue;
    }
    next[userId] = { ...c, x: c.x + dx * LERP, y: c.y + dy * LERP };
    changed = true;
  }
  if (changed) useRealtimeStore.setState({ cursors: next });
  if (anyActive) rafId = window.requestAnimationFrame(stepCursors);
};

const ensureAnimating = () => {
  if (rafId === null) rafId = window.requestAnimationFrame(stepCursors);
};

const initial = {
  connected: false,
  projectId: null,
  self: null,
  members: [],
  cursors: {},
  drafts: {},
  locks: {},
  rev: 0,
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  ...initial,

  setConnected: (connected) => set({ connected }),

  setJoined: (projectId, self, members, locks, rev) =>
    set({
      projectId,
      self,
      members,
      locks: Object.fromEntries(locks.map((l) => [lockKey(l.entityType, l.entityId), l.holder])),
      rev,
      cursors: {},
      drafts: {},
    }),

  setMembers: (members) =>
    set((s) => {
      // Cursors/drafts of people who left must not linger on the canvas.
      const present = new Set(members.map((m) => m.userId));
      const cursors = Object.fromEntries(
        Object.entries(s.cursors).filter(([id]) => present.has(Number(id)))
      ) as Record<number, RemoteCursor>;
      const drafts = Object.fromEntries(
        Object.entries(s.drafts).filter(([id]) => present.has(Number(id)))
      ) as Record<number, RemoteDraft>;
      const self = s.self ? (members.find((m) => m.userId === s.self?.userId) ?? s.self) : s.self;
      return { members, cursors, drafts, self };
    }),

  setCursor: (userId, page, x, y) => {
    set((s) => {
      const prev = s.cursors[userId];
      const at = Date.now();
      // First sample (or a page hop) jumps straight there — lerping across a
      // page change would sweep the cursor over unrelated geometry.
      const jump = !prev || prev.page !== page;
      return {
        cursors: {
          ...s.cursors,
          [userId]: jump
            ? { page, x, y, tx: x, ty: y, at }
            : { ...prev, page, tx: x, ty: y, at },
        },
      };
    });
    ensureAnimating();
  },

  setDraft: (userId, draft) =>
    set((s) => {
      if (draft.points.length === 0) {
        if (!(userId in s.drafts)) return s;
        const drafts = { ...s.drafts };
        delete drafts[userId];
        return { drafts };
      }
      return { drafts: { ...s.drafts, [userId]: draft } };
    }),

  setLock: (state) =>
    set((s) => ({ locks: { ...s.locks, [lockKey(state.entityType, state.entityId)]: state.holder } })),

  setRev: (rev) => set({ rev }),

  reset: () => set({ ...initial }),
}));

/** Non-hook read of who holds a lock (null/undefined = free). */
export const lockHolder = (entityType: LockState['entityType'], entityId: string): Presence | null =>
  useRealtimeStore.getState().locks[lockKey(entityType, entityId)] ?? null;
