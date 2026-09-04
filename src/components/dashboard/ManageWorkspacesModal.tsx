import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';
import { initials } from '@/lib/avatar';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { WorkspaceKindIcon, WORKSPACE_KIND_LABELS } from './WorkspaceKindIcon';

type Props = {
  open: boolean;
  onClose: () => void;
  onSwitch: (orgId: string) => void;
};

/** List every workspace with its kind and role; switch from one place. */
export default function ManageWorkspacesModal({ open, onClose, onSwitch }: Props) {
  const { theme } = useTheme();
  const orgs = useWorkspaceStore((s) => s.orgs);
  const activeOrgId = useWorkspaceStore((s) => s.activeOrgId);
  if (!open) return null;

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Manage Workspaces"
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-body">Manage Workspaces</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto px-3 py-3">
          {orgs.map((ws) => {
            const isActive = ws.id === activeOrgId;
            const role = ws.role === 'owner' ? 'Owner' : ws.role.charAt(0).toUpperCase() + ws.role.slice(1);
            const label = ws.kind === 'personal' ? 'Personal Workspace' : ws.name;
            return (
              <div key={ws.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-overlay/10 text-xs font-semibold text-body">
                  {ws.kind === 'personal' ? initials(label) : initials(ws.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-body">{label}</p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <WorkspaceKindIcon kind={ws.kind} />
                    <span className="truncate">{WORKSPACE_KIND_LABELS[ws.kind]} · {role}</span>
                  </p>
                </div>
                <button type="button" disabled={isActive} onClick={() => onSwitch(ws.id)}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-muted disabled:cursor-default disabled:opacity-40">
                  {isActive ? 'Active' : 'Switch'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
