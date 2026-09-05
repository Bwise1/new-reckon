import { useEffect, useState } from 'react';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
import { accountsService, type AccountSession } from '@/services/accounts.service';

type Kind = 'laptop' | 'phone' | 'desktop';
const ICON: Record<Kind, typeof Laptop> = { laptop: Laptop, phone: Smartphone, desktop: Monitor };

/** Best-effort device/browser/OS labels from a user-agent string. */
function describe(ua: string | null): { device: string; meta: string; kind: Kind } {
  const s = ua ?? '';
  const isPhone = /iphone|android|mobile/i.test(s);
  const isTablet = /ipad|tablet/i.test(s);
  const os =
    /iphone|ipad|ios/i.test(s) ? 'iOS'
    : /android/i.test(s) ? 'Android'
    : /mac os x|macintosh/i.test(s) ? 'macOS'
    : /windows/i.test(s) ? 'Windows'
    : /linux/i.test(s) ? 'Linux'
    : 'Unknown OS';
  const browser =
    /reckon/i.test(s) ? 'Reckon Bill app'
    : /edg\//i.test(s) ? 'Edge'
    : /chrome|crios/i.test(s) ? 'Chrome'
    : /firefox|fxios/i.test(s) ? 'Firefox'
    : /safari/i.test(s) ? 'Safari'
    : 'Browser';
  const kind: Kind = isPhone ? 'phone' : isTablet ? 'phone' : os === 'macOS' || os === 'iOS' ? 'laptop' : 'desktop';
  const device = os === 'iOS' ? (isTablet ? 'iPad' : 'iPhone') : os === 'Android' ? 'Android device' : `${os} device`;
  return { device, meta: `${browser} on ${os}`, kind };
}

function relative(iso: string | null): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return 'Active now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SessionList() {
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline feedback for a failed revoke; `error` above is for the list load.
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () =>
    accountsService
      .listSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => setError('Could not load sessions.'));

  useEffect(() => {
    void load();
  }, []);

  const revoke = async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await accountsService.revokeSession(id);
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'Could not revoke that session.');
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await accountsService.logoutOthers();
      setSessions((prev) => prev?.filter((s) => s.current) ?? null);
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'Could not sign out the other sessions.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!sessions)
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
        Loading sessions…
      </div>
    );
  if (sessions.length === 0) return <p className="text-sm text-muted">No active sessions.</p>;

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <div>
      <ul className="divide-y divide-border">
        {sessions.map((session) => {
          const d = describe(session.userAgent);
          const Icon = ICON[d.kind];
          return (
            <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-body">{d.device}</span>
                  {session.current ? (
                    <span className="rounded-full bg-overlay/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-body">
                      This device
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted">
                  {d.meta}
                  {session.ip ? ` · ${session.ip}` : ''} · {relative(session.lastUsedAt ?? session.createdAt)}
                </p>
              </div>
              {!session.current ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(session.id)}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-body transition-colors hover:bg-overlay/5 disabled:opacity-50"
                >
                  Revoke
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {actionError ? (
        <p role="alert" className="mt-3 text-xs text-danger">{actionError}</p>
      ) : null}

      {otherCount > 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={revokeOthers}
          className="mt-4 rounded-md border border-border px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          Sign out all other sessions
        </button>
      ) : null}
    </div>
  );
}
