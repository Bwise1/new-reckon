import { useState } from 'react';
import { MoreHorizontal, UserMinus } from 'lucide-react';
import { avatarColor } from '@/lib/avatar';
import RoleBadge from './RoleBadge';
import type { OrgPerson } from '@/services/accounts.service';

const ASSIGNABLE = [
  { value: 'admin', label: 'Administrator' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
] as const;

/** The prototype's team roster: member, role badge, status, per-row menu. */
export default function TeamTable({ members, canManage, onUpdateRole, onRemove }: {
  members: OrgPerson[];
  canManage: boolean;
  onUpdateRole: (accountId: string, role: string) => void;
  onRemove: (accountId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[1fr_120px_40px] gap-3 border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>Member</span><span>Role</span><span />
      </div>
      {members.map((member, i) => (
        <Row key={member.accountId} member={member} isLast={i === members.length - 1}
          canManage={canManage}
          onUpdateRole={(role) => onUpdateRole(member.accountId, role)}
          onRemove={() => onRemove(member.accountId)} />
      ))}
    </div>
  );
}

function Row({ member, isLast, canManage, onUpdateRole, onRemove }: {
  member: OrgPerson; isLast: boolean; canManage: boolean;
  onUpdateRole: (role: string) => void; onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = member.role === 'owner';
  return (
    <div className={`grid grid-cols-[1fr_120px_40px] items-center gap-3 px-4 py-3 transition-colors hover:bg-overlay/5 ${isLast ? '' : 'border-b border-border'}`}>
      <div className="flex min-w-0 items-center gap-3">
        {member.avatarUrl
          ? <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          : <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(member.name)}`}>{member.initials}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-body">{member.name}</p>
          <p className="truncate text-xs text-muted">{member.email}</p>
        </div>
      </div>
      <RoleBadge role={member.role} />
      <div className="relative flex justify-end">
        {canManage && !isOwner && (
          <button type="button" aria-label="Member options" onClick={() => setMenuOpen((o) => !o)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
              {ASSIGNABLE.filter((r) => r.value !== member.role).map((r) => (
                <button key={r.value} type="button"
                  onClick={() => { setMenuOpen(false); onUpdateRole(r.value); }}
                  className="block w-full px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                  Make {r.label}
                </button>
              ))}
              <div className="my-1 h-px bg-surface-muted" />
              <button type="button" onClick={() => { setMenuOpen(false); onRemove(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 cursor-pointer">
                <UserMinus className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
