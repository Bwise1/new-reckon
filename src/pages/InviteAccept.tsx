import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { membersService } from '@/services/members.service';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_LABELS } from '@/types/members';
import Logo from '@/assets/images/logo_blue.svg';

export const PENDING_INVITE_KEY = 'reckon_pending_invite';

/**
 * /invite/:token — the page an invite email opens. Shows who invited you to
 * what, and accepts with one click. Signed out: remembers the link, sends
 * you to sign in (or sign up), and resumes here afterwards.
 */
export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => membersService.invitePreview(token).then((r) => r.data.invite),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    // Nothing to resume once we are here signed in.
    if (isAuthenticated) localStorage.removeItem(PENDING_INVITE_KEY);
  }, [isAuthenticated]);

  const goSignIn = (path: '/login' | '/signup') => {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    navigate(path);
  };

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await membersService.acceptInvite(token);
      navigate(`/project/${res.data.projectId}`, { replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not accept this invite.');
      setAccepting(false);
    }
  };

  const card = (body: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <img src={Logo} alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold text-body">Reckon Bill</span>
        </div>
        {body}
      </div>
    </div>
  );

  if (isLoading) return card(<p className="text-sm text-muted">Checking your invite…</p>);
  if (isError || !data) {
    return card(
      <>
        <h1 className="text-lg font-semibold text-body">This invite link isn't valid</h1>
        <p className="mt-2 text-sm text-muted">Ask the person who invited you to send a new one.</p>
      </>
    );
  }
  if (data.state === 'accepted') {
    return card(
      <>
        <h1 className="text-lg font-semibold text-body">Already accepted</h1>
        <p className="mt-2 text-sm text-muted">This invite has been used. The project is in your dashboard.</p>
        <button type="button" onClick={() => navigate('/dashboard')} className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg cursor-pointer">
          Go to dashboard
        </button>
      </>
    );
  }
  if (data.state === 'expired') {
    return card(
      <>
        <h1 className="text-lg font-semibold text-body">This invite has expired</h1>
        <p className="mt-2 text-sm text-muted">Invites work for 14 days. Ask {data.inviter} to send a new one.</p>
      </>
    );
  }

  return card(
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">You're invited</p>
      <h1 className="mt-1 text-lg font-semibold text-body text-balance">
        {data.inviter} invited you to <span className="text-accent">{data.projectTitle}</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        As <strong className="text-body">{ROLE_LABELS[data.role]}</strong>. Sent to {data.email}.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {isAuthenticated ? (
        <button
          type="button"
          onClick={() => void accept()}
          disabled={accepting}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {accepting ? 'Joining…' : 'Accept and open the project'}
        </button>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={() => goSignIn('/login')} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg hover:opacity-90 cursor-pointer">
            Sign in to accept
          </button>
          <button type="button" onClick={() => goSignIn('/signup')} className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-body hover:bg-surface-muted cursor-pointer">
            Create an account
          </button>
          <p className="mt-1 text-center text-[11px] text-muted">Use {data.email} so the invite finds you.</p>
        </div>
      )}
    </>
  );
}
