import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator', hint: 'Manages members, roles and settings' },
  { value: 'member', label: 'Member', hint: 'Works on the organization’s projects' },
  { value: 'guest', label: 'Guest', hint: 'Only specific projects they’re invited to' },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  pending?: boolean;
  onInvite: (email: string, role: string) => Promise<void>;
};

/** Invite Team Members — ported from the prototype (email + role). Project
 *  assignment from the prototype is per-project sharing in this build, so it
 *  is omitted here. */
export default function InviteMemberModal({ open, onClose, pending, onInvite }: Props) {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('member');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setError(null); setNotice(null);
    try {
      await onInvite(value, role);
      setNotice(`Invite handled for ${value}.`);
      setEmail('');
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Could not invite that person.');
    }
  };

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Invite Member"
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-body">Invite Team Member</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="space-y-4 px-5 py-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none focus:border-accent transition">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] text-muted">{ROLE_OPTIONS.find((o) => o.value === role)?.hint}</p>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            {notice && <p className="text-xs text-muted">{notice}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer">Cancel</button>
            <button type="submit" disabled={!email.trim() || pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer">
              {pending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
