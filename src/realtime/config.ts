/**
 * Live-collaboration tunables. Locked defaults — change deliberately, and
 * keep the server's matching constants (lock TTL) in step.
 */

/** Avatars shown in the canvas presence strip before collapsing to "+N". */
export const PRESENCE_STRIP_MAX = 8;

/** Max outbound cursor updates per second (volatile, trailing-throttled). */
export const CURSOR_HZ = 30;

/** Max outbound in-progress-draft updates per second. */
export const DRAFT_HZ = 15;

/**
 * After the socket reconnects, wait this long (collapsing bursts) before
 * refetching the whole project — ops broadcast while we were away are gone,
 * so a full hydrate is the only way back to a consistent state.
 */
export const RESYNC_DEBOUNCE_MS = 1000;

/**
 * Server-side lock lifetime. The client refreshes a lock it still holds by
 * re-acquiring it every LOCK_TTL_MS / 2 while the edit is still active, so a
 * lock only lapses when the holder is truly gone (tab closed, network dead).
 */
export const LOCK_TTL_MS = 60_000;

/**
 * A held measurement lock is released after this long with no pointer
 * activity on the shape, even if it is still selected — nobody should be
 * blocked by a colleague who walked away from their desk.
 */
export const LOCK_IDLE_RELEASE_MS = 60_000;

/** Remote cursors keep animating this long after their last update. */
export const CURSOR_ANIMATE_WINDOW_MS = 2000;

/**
 * Feature gate: `VITE_REALTIME=off` disables every collaboration feature
 * (no socket is ever opened) without touching the rest of the app.
 */
export const REALTIME_ENABLED = import.meta.env.VITE_REALTIME !== 'off';
