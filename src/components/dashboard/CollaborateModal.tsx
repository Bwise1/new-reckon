import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, RotateCw, Trash2, X } from 'lucide-react';
import { useProjectMembers, useMemberMutations } from '@/hooks/useProjectMembers';
import { useTheme } from '@/hooks/useProjectTheme';
import { avatarColor } from '@/lib/avatar';
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AssignableRole } from '@/types/members';

type Props = {
  projectId: string;
  projectTitle?: string;
  open: boolean;
  onClose: () => void;
};

/**
 * The prototype's Collaborate modal, live: invite by email with a role,
 * "People with access" with a role dropdown and remove, and pending invites
 * with Resend / Cancel. Non-admins see the list read-only.
 */
export default function CollaborateModal({ projectId, projectTitle, open, onClose }: Props) {
  const { theme } = useTheme();
  const { data, isLoading } = useProjectMembers(open ? projectId : null);
  const m = useMemberMutations(projectId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canManage = data?.me.can.manage ?? false;
  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    setError(null);
    setNotice(null);
    try {
      const res = await m.invite.mutateAsync({ email: value, role });
      setNotice(res.added ? `${value} is now on the project.` : `Invite sent to ${value}.`);
      setEmail('');
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not invite that person.');
    }
  };

  return createPortal(
    <div
      data-theme={theme}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Collaborate"
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-body">Collaborate</h2>
            {projectTitle && <p className="truncate text-xs text-muted">{projectTitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-body transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {canManage && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Invite people</label>
              <div className="mt-2 flex items-stretch gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="Email address"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AssignableRole)}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2 text-sm text-body outline-none focus:border-accent transition"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!email.trim() || m.invite.isPending}
                  className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {m.invite.isPending ? 'Inviting…' : 'Invite'}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {ASSIGNABLE_ROLES.find((r) => r.value === role)?.hint}
              </p>
              {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
              {notice && <p className="mt-1.5 text-xs text-muted">{notice}</p>}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">People with access</label>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {isLoading && <p className="px-2 py-3 text-xs text-muted">Loading…</p>}
              {members.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(p.name)}`}>
                      {p.initials}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-body">{p.name}</p>
                    <p className="truncate text-[11px] text-muted">{p.email}</p>
                  </div>
                  {p.role === 'owner' || !canManage ? (
                    <span className="shrink-0 text-xs font-medium text-muted">{ROLE_LABELS[p.role]}</span>
                  ) : (
                    <>
                      <select
                        value={p.role}
                        onChange={(e) => m.setRole.mutate({ userId: p.id, role: e.target.value as AssignableRole })}
                        className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-accent transition"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        title="Remove"
                        onClick={() => m.remove.mutate(p.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}

              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-body">{inv.email}</p>
                    <p className="truncate text-[11px] text-muted">Invited as {ROLE_LABELS[inv.role]} · pending</p>
                  </div>
                  <button
                    type="button"
                    title="Resend invite"
                    aria-label="Resend invite"
                    onClick={() => m.resend.mutate(inv.id, { onSuccess: () => setNotice(`Invite resent to ${inv.email}.`) })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Cancel invite"
                    aria-label="Cancel invite"
                    onClick={() => m.cancel.mutate(inv.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {!isLoading && members.length <= 1 && invites.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted">No one else has access yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
