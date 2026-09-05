import { useEffect, useMemo, useState } from 'react';
import { Clock, RotateCw, Trash2, UserPlus } from 'lucide-react';
import SettingsLayout from '@/layouts/SettingsLayout';
import TeamTable from '@/components/dashboard/TeamTable';
import InviteMemberModal from '@/components/dashboard/InviteMemberModal';
import AccessPolicyCard from '@/components/dashboard/AccessPolicyCard';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { accountsService, accountsEnabled, type OrgDetail } from '@/services/accounts.service';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

/** Settings › Team — manage who is in the active organization (prototype). */
export default function TeamSettings() {
  const confirm = useConfirm();
  const { active, load: loadWorkspaces } = useWorkspaceStore();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const current = active();
  const orgId = current && current.kind !== 'personal' ? current.id : null;

  const refresh = useMemo(() => async () => {
    if (!orgId) { setDetail(null); setLoading(false); return; }
    setLoading(true);
    try { setDetail(await accountsService.orgDetail(orgId)); }
    catch { setDetail(null); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!accountsEnabled()) {
    return <SettingsLayout><Shell><Empty text="Organizations are available when you sign in through Reckon accounts." /></Shell></SettingsLayout>;
  }
  if (!orgId) {
    return <SettingsLayout><Shell><Empty text="Switch to an organization to manage its team. Your personal workspace has no team." /></Shell></SettingsLayout>;
  }

  const canManage = detail?.me.canManage ?? false;

  const invite = async (email: string, role: string) => {
    await accountsService.invite(orgId, email, role);
    await refresh();
  };
  // Run a member/invite action with the busy flag and inline error feedback.
  // These used to reject unhandled, so a failed call left no trace in the UI.
  const run = async (fallback: string, fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try { await fn(); }
    catch (e) { setActionError(e instanceof Error && e.message ? e.message : fallback); }
    finally { setBusy(false); }
  };
  const setRole = (accountId: string, role: string) =>
    run('Could not change that role.', async () => { await accountsService.setRole(orgId, accountId, role); await refresh(); });
  const remove = async (accountId: string) => {
    const person = detail?.members.find((m) => m.accountId === accountId);
    const ok = await confirm({ title: 'Remove member?', message: <p><span className="font-medium text-body">{person?.name ?? 'This person'}</span> will lose access to the organization.</p>, confirmLabel: 'Remove', variant: 'danger' });
    if (!ok) return;
    await run('Could not remove that member.', async () => { await accountsService.removeMember(orgId, accountId); await refresh(); });
  };
  const setPolicy = (policy: 'open' | 'restricted') =>
    run('Could not update the access policy.', async () => { await accountsService.updateOrg(orgId, { accessPolicy: policy }); await refresh(); });
  const resendInvite = (inviteId: string) =>
    run('Could not resend that invite.', async () => { await accountsService.resendInvite(orgId, inviteId); });
  const cancelInvite = (inviteId: string) =>
    run('Could not cancel that invite.', async () => { await accountsService.cancelInvite(orgId, inviteId); await refresh(); });

  return (
    <SettingsLayout>
      <Shell>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-body">Team Management</h1>
            <p className="mt-0.5 text-sm text-muted">Manage who has access to {current?.name}.</p>
          </div>
          {canManage && (
            <button type="button" onClick={() => setInviteOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-sm transition-opacity hover:opacity-90 cursor-pointer">
              <UserPlus className="h-4 w-4" /> Invite Member
            </button>
          )}
        </div>

        {actionError && (
          <p role="alert" className="mt-3 text-sm text-danger">{actionError}</p>
        )}

        {loading ? (
          <div className="mt-6 h-40 animate-pulse rounded-xl border border-border bg-surface" />
        ) : detail ? (
          <>
            <div className="mt-6">
              <TeamTable members={detail.members} canManage={canManage && !busy} onUpdateRole={setRole} onRemove={remove} />
            </div>

            {canManage && detail.invites.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
                <div className="border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Pending invites</div>
                {detail.invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted"><Clock className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-body">{inv.email}</p>
                      <p className="truncate text-[11px] text-muted">Invited as {inv.role} · pending</p>
                    </div>
                    <button type="button" title="Resend" aria-label="Resend invite" disabled={busy} onClick={() => resendInvite(inv.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer disabled:opacity-50"><RotateCw className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Cancel" aria-label="Cancel invite" disabled={busy} onClick={() => cancelInvite(inv.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            {canManage && (
              <div className="mt-6">
                <AccessPolicyCard policy={detail.org.accessPolicy} disabled={busy} onChange={setPolicy} />
              </div>
            )}
          </>
        ) : (
          <Empty text="Could not load this organization." />
        )}

        <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={invite} />
      </Shell>
    </SettingsLayout>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // SettingsLayout already provides the outer container; this is a passthrough.
  return <>{children}</>;
}
function Empty({ text }: { text: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-overlay/15 py-16 text-center"><p className="max-w-sm text-sm text-muted">{text}</p></div>;
}
