import type { ProjectRole } from '@/types/members';
import type { SyncOp } from '@/services/syncQueue';
import type { Point } from '@/types/takeoff';

/**
 * Wire contract for the `/rt` socket (shared with the API server — keep the
 * two in lock-step). Coordinates are PLAN-PIXEL space: the same space stored
 * measurement points use, never screen pixels.
 */

export interface Presence {
  userId: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  /** CSS colour assigned by the server for cursors, rings and outlines. */
  color: string;
  page: number;
  role: ProjectRole;
  readOnly: boolean;
}

export type LockEntityType = 'measurement' | 'boq.item';

export interface LockState {
  entityType: LockEntityType;
  entityId: string;
  holder: Presence | null;
}

export type RemoteOpKind = SyncOp['kind'];

/** A mutation another client made, relayed by the server after it landed. */
export interface RemoteOp {
  kind: RemoteOpKind;
  projectId: number;
  clientUuid: string;
  /** Server-shaped body (the REST body the sender used), varies by kind. */
  body: Record<string, unknown> | null;
  /** Bill user id of the author — used for the echo guard. */
  by: number;
  rev: number;
  at: string;
}

export interface CursorEvent {
  userId: number;
  page: number;
  x: number;
  y: number;
}

export interface DraftEvent {
  userId: number;
  page: number;
  tool: string | null;
  points: Point[];
}

export type JoinAck =
  | { ok: true; self: Presence; members: Presence[]; locks: LockState[]; rev: number }
  | { ok: false; error: string };

export type LockAck = { ok: boolean; holder: Presence | null };

export interface ServerToClientEvents {
  'presence.state': (members: Presence[]) => void;
  cursor: (event: CursorEvent) => void;
  draft: (event: DraftEvent) => void;
  'lock.state': (state: LockState) => void;
  op: (op: RemoteOp) => void;
}

export interface ClientToServerEvents {
  'project.join': (payload: { projectId: number }, ack: (res: JoinAck) => void) => void;
  'project.leave': (payload: { projectId: number }) => void;
  cursor: (payload: { projectId: number; page: number; x: number; y: number }) => void;
  draft: (payload: { projectId: number; page: number; tool: string | null; points: Point[] }) => void;
  'lock.acquire': (
    payload: { projectId: number; entityType: LockEntityType; entityId: string },
    ack: (res: LockAck) => void
  ) => void;
  'lock.release': (payload: { projectId: number; entityType: LockEntityType; entityId: string }) => void;
}

export const lockKey = (entityType: LockEntityType, entityId: string) => `${entityType}:${entityId}`;
