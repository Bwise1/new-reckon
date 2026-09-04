import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, GraduationCap, Plus, Settings2, User } from 'lucide-react';
import { initials } from '@/lib/avatar';
import { accountsEnabled, type EducationPayload } from '@/services/accounts.service';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import CreateOrganizationModal from './CreateOrganizationModal';
import CreateEducationalModal from './CreateEducationalModal';
import ManageWorkspacesModal from './ManageWorkspacesModal';
import { WorkspaceKindIcon, WORKSPACE_KIND_LABELS } from './WorkspaceKindIcon';

/**
 * The prototype's workspace switcher, live: lists the personal workspace and
 * each organization, switches the active one (which re-mints the suite token
 * and reloads projects), and creates a new organization. When accounts login
 * is not in use, it shows the personal workspace only.
 */
export default function WorkspaceSwitcher({ ownerName }: { ownerName: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { orgs, load, switchTo, active } = useWorkspaceStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingEdu, setCreatingEdu] = useState(false);
  const [managing, setManaging] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => { void load(); }, [load]);

  const enabled = accountsEnabled();
  const current = active();
  const kind = current?.kind ?? 'personal';
  const name = kind === 'personal' || !current ? 'Personal Workspace' : current.name;
  const subtitle = kind === 'personal' ? 'Personal Space' : WORKSPACE_KIND_LABELS[kind];

  const choose = async (orgId: string) => {
    setOpen(false);
    setManaging(false);
    if (current?.id === orgId) return;
    await switchTo(orgId);
    qc.invalidateQueries({ queryKey: ['projects'] });
    navigate('/dashboard');
  };

  // A create response already switches the active org and returns its token.
  const adoptCreated = async (orgId: string, token: string, dest: string) => {
    localStorage.setItem('identityToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('reckon_active_org', orgId);
    await load();
    useWorkspaceStore.setState({ activeOrgId: orgId });
    qc.invalidateQueries({ queryKey: ['projects'] });
    navigate(dest);
  };

  const submitCreate = async (companyName: string, teamSize: string) => {
    setPending(true);
    try {
      const { accountsService } = await import('@/services/accounts.service');
      const { orgId, token } = await accountsService.createOrg(companyName, teamSize);
      setCreating(false);
      await adoptCreated(orgId, token, '/settings/team');
    } finally {
      setPending(false);
    }
  };

  const submitEducational = async (courseCode: string, education: EducationPayload) => {
    setPending(true);
    try {
      const { accountsService } = await import('@/services/accounts.service');
      const { orgId, token } = await accountsService.createEducational(courseCode, education);
      setCreatingEdu(false);
      await adoptCreated(orgId, token, '/settings/team');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-overlay/10 bg-overlay/5 px-3 py-2.5 text-left transition-colors hover:bg-overlay/10 cursor-pointer">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-overlay/10 text-xs font-semibold text-body">
          {current && current.kind !== 'personal'
            ? <WorkspaceKindIcon kind={current.kind} className="h-4 w-4" />
            : ownerName ? initials(ownerName) : <User className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-body">{name}</span>
          <span className="block truncate text-[11px] font-medium text-muted">{subtitle}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[240px] rounded-lg border border-border bg-surface py-1 shadow-lg">
            {(enabled ? orgs : [{ id: 'personal', kind: 'personal' as const, name: 'Personal Workspace', slug: null, role: 'owner' as const }]).map((ws) => (
              <button key={ws.id} type="button" onClick={() => (enabled ? choose(ws.id) : setOpen(false))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-overlay/10 text-[10px] font-semibold text-body">
                  {ws.kind === 'personal' ? (ownerName ? initials(ownerName) : '?') : <WorkspaceKindIcon kind={ws.kind} className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{ws.kind === 'personal' ? 'Personal Workspace' : ws.name}</span>
                {current?.id === ws.id && <Check className="h-3.5 w-3.5 shrink-0 text-body" />}
              </button>
            ))}
            <div className="mx-1 my-1 h-px bg-border" />
            {enabled ? (
              <>
                <button type="button" onClick={() => { setOpen(false); setCreating(true); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                  <Plus className="h-3.5 w-3.5 text-muted" />
                  Create Organization
                </button>
                <button type="button" onClick={() => { setOpen(false); setCreatingEdu(true); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                  <GraduationCap className="h-3.5 w-3.5 text-muted" />
                  Create Educational Hub
                </button>
                <button type="button" onClick={() => { setOpen(false); setManaging(true); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                  <Settings2 className="h-3.5 w-3.5 text-muted" />
                  Manage Workspaces
                </button>
              </>
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted">Organizations arrive when you sign in through Reckon accounts.</p>
            )}
          </div>
        </>
      )}

      <CreateOrganizationModal open={creating} onClose={() => setCreating(false)} pending={pending} onSubmit={submitCreate} />
      <CreateEducationalModal open={creatingEdu} onClose={() => setCreatingEdu(false)} pending={pending} onSubmit={submitEducational} />
      <ManageWorkspacesModal open={managing} onClose={() => setManaging(false)} onSwitch={choose} />
    </div>
  );
}
