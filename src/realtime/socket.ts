import { io, type Socket } from 'socket.io-client';
import { refreshIdentityToken } from '@/services/accounts.service';
import type { ClientToServerEvents, ServerToClientEvents } from '@/realtime/types';

/**
 * Singleton socket.io connection for live collaboration. Connects lazily on
 * first use, reconnects with socket.io's own backoff, and swaps in a freshly
 * refreshed bearer token after ONE `unauthorized` rejection per outage (the
 * same JWT the REST client sends).
 */
export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** `VITE_API_URL` is the REST base (`…/v1`); the socket lives on the origin. */
const apiOrigin = (): string => {
  const base = import.meta.env.VITE_API_URL || 'https://api.reckonio.com/v1';
  try {
    return new URL(base, window.location.origin).origin;
  } catch {
    return base.replace(/\/v1\/?$/, '');
  }
};

let socket: RealtimeSocket | null = null;
let refreshInFlight = false;
let refreshedThisOutage = false;

const create = (): RealtimeSocket => {
  const s: RealtimeSocket = io(apiOrigin(), {
    path: '/rt',
    // A function so every (re)connect attempt reads the CURRENT token — the
    // REST interceptor and refreshIdentityToken both rotate localStorage.
    auth: (cb) => cb({ token: localStorage.getItem('token') ?? '' }),
    // Polling first, then upgrade to WebSocket (socket.io's default order).
    // websocket-first is NOT safe here: engine.io does not fall back to the
    // next transport when the first one fails (only with tryAllTransports),
    // so a browser whose WebSocket is blocked (extension, corporate proxy)
    // would loop on "WebSocket connection failed" and never connect at all.
    // Polling always gets through; the upgrade is attempted and, if it
    // fails, the session silently stays on polling.
    transports: ['polling', 'websocket'],
    autoConnect: false,
  });

  s.on('connect', () => {
    refreshedThisOutage = false;
  });

  s.on('connect_error', (error) => {
    const message = (error?.message ?? '').toLowerCase();
    if (!message.includes('unauthorized')) {
      // Transport-level failure (socket.io keeps retrying with backoff).
      console.warn('[realtime] connect failed:', error?.message ?? error);
      return;
    }
    // A middleware rejection is terminal for socket.io (no auto-retry), so
    // refresh once and reconnect by hand. A second rejection means the
    // session is really gone; the REST layer's 401 handling takes it from
    // there.
    if (refreshedThisOutage || refreshInFlight) return;
    refreshInFlight = true;
    refreshedThisOutage = true;
    void refreshIdentityToken()
      .then((fresh) => {
        if (fresh) s.connect();
      })
      .finally(() => {
        refreshInFlight = false;
      });
  });

  return s;
};

export const realtimeSocket = {
  /** The shared socket (created on first call, not yet connected). */
  get: (): RealtimeSocket => {
    if (!socket) socket = create();
    return socket;
  },
  connect: (): RealtimeSocket => {
    const s = realtimeSocket.get();
    if (!s.connected) s.connect();
    return s;
  },
  disconnect: (): void => {
    socket?.disconnect();
  },
  get connected(): boolean {
    return socket?.connected ?? false;
  },
  emit: <E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void => {
    const s = realtimeSocket.get();
    // socket.io buffers emits while disconnected; cursor/draft are sent
    // volatile by the callers so they are dropped instead.
    s.emit(event, ...args);
  },
  on: (...args: Parameters<RealtimeSocket['on']>): void => {
    realtimeSocket.get().on(...args);
  },
  off: (...args: Parameters<RealtimeSocket['off']>): void => {
    socket?.off(...args);
  },
};
