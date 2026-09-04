import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_WIDTH = 176; // w-44

function Row({ member, isLast, canManage, onUpdateRole, onRemove }: {
  member: OrgPerson; isLast: boolean; canManage: boolean;
  onUpdateRole: (role: string) => void; onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwner = member.role === 'owner';

  // Position a portalled menu under the button, flipping above when there
  // isn't room below. Portalling escapes the table's overflow-hidden, which
  // otherwise clipped the menu at the card's edge.
  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const estHeight = 132; // ~3 items; enough to decide flip direction
      const below = window.innerHeight - r.bottom;
      const top = below < estHeight ? r.top - estHeight - 4 : r.bottom + 4;
      setPos({ top, left: Math.max(8, r.right - MENU_WIDTH) });
    }
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setMenuOpen(false);
    };
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const assignable = ASSIGNABLE.filter((r) => r.value !== member.role);

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
      <div className="flex justify-end">
        {canManage && !isOwner && (
          <button ref={triggerRef} type="button" aria-label="Member options"
            onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {menuOpen && createPortal(
          <div ref={menuRef} role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 99999 }}
            className="rounded-lg border border-border bg-surface py-1 shadow-lg">
            {assignable.map((r) => (
              <button key={r.value} type="button" role="menuitem"
                onClick={() => { setMenuOpen(false); onUpdateRole(r.value); }}
                className="block w-full px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                Make {r.label}
              </button>
            ))}
            {assignable.length > 0 && <div className="my-1 h-px bg-surface-muted" />}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRemove(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 cursor-pointer">
              <UserMinus className="h-3.5 w-3.5" /> Remove
            </button>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
