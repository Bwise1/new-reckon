import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { accountsService, accountsEnabled } from '@/services/accounts.service';
import { useAuthStore } from '@/stores/auth.store';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import Logo from '@/assets/images/logo_blue.svg';

export const PENDING_ORG_INVITE_KEY = 'reckon_pending_org_invite';
const ROLE_LABELS: Record<string, string> = { admin: 'Administrator', member: 'Member', guest: 'Guest' };

/** /org-invite/:token — the page an org-invite email opens. */
export default function OrgInviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['org-invite', token],
    queryFn: () => accountsService.invitePreview(token).then((d) => d.invite),
    enabled: Boolean(token) && Boolean(import.meta.env.VITE_AUTH_URL),
    retry: false,
  });

  useEffect(() => { if (isAuthenticated) localStorage.removeItem(PENDING_ORG_INVITE_KEY); }, [isAuthenticated]);

  const goSignIn = (path: '/login' | '/signup') => {
    localStorage.setItem(PENDING_ORG_INVITE_KEY, token);
    navigate(path);
  };
  const accept = async () => {
    setAccepting(true); setError(null);
    try {
      const { orgId, token: fresh } = await accountsService.acceptInvite(token);
      localStorage.setItem('identityToken', fresh);
      localStorage.setItem('token', fresh);
      localStorage.setItem('reckon_active_org', orgId);
      useWorkspaceStore.setState({ activeOrgId: orgId });
      await useWorkspaceStore.getState().load();
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not accept this invite.');
      setAccepting(false);
    }
  };

  const card = (body: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2"><img src={Logo} alt="" className="h-6 w-6" /><span className="text-sm font-semibold text-body">Reckon Bill</span></div>
        {body}
      </div>
    </div>
  );

  if (!accountsEnabled() && !isAuthenticated && !import.meta.env.VITE_AUTH_URL) {
    return card(<><h1 className="text-lg font-semibold text-body">Organization invites need Reckon accounts</h1><p className="mt-2 text-sm text-muted">Sign in through Reckon accounts to accept this invite.</p></>);
  }
  if (isLoading) return card(<p className="text-sm text-muted">Checking your invite…</p>);
  if (isError || !data) return card(<><h1 className="text-lg font-semibold text-body">This invite link isn't valid</h1><p className="mt-2 text-sm text-muted">Ask whoever invited you to send a new one.</p></>);
  if (data.state === 'accepted') return card(<><h1 className="text-lg font-semibold text-body">Already accepted</h1><p className="mt-2 text-sm text-muted">You're already in {data.orgName}.</p><button type="button" onClick={() => navigate('/dashboard')} className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg cursor-pointer">Go to dashboard</button></>);
  if (data.state === 'expired') return card(<><h1 className="text-lg font-semibold text-body">This invite has expired</h1><p className="mt-2 text-sm text-muted">Invites work for 14 days. Ask {data.inviter} to send a new one.</p></>);

  return card(
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">You're invited</p>
      <h1 className="mt-1 text-lg font-semibold text-body text-balance">{data.inviter} invited you to join <span className="text-accent">{data.orgName}</span></h1>
      <p className="mt-2 text-sm text-muted">As <strong className="text-body">{ROLE_LABELS[data.role] ?? data.role}</strong>. Sent to {data.email}.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {isAuthenticated ? (
        <button type="button" onClick={accept} disabled={accepting} className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer">{accepting ? 'Joining…' : 'Accept and join'}</button>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={() => goSignIn('/login')} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg hover:opacity-90 cursor-pointer">Sign in to accept</button>
          <button type="button" onClick={() => goSignIn('/signup')} className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-body hover:bg-surface-muted cursor-pointer">Create an account</button>
          <p className="mt-1 text-center text-[11px] text-muted">Use {data.email} so the invite finds you.</p>
        </div>
      )}
    </>
  );
}
