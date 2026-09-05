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
  // Inline feedback: a failed switch shows under the trigger; a failed create
  // shows inside its modal, which stays open so the user can retry.
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  const enabled = accountsEnabled();
  const current = active();
  const kind = current?.kind ?? 'personal';
  const name = kind === 'personal' || !current ? 'Personal Workspace' : current.name;
  const subtitle = kind === 'personal' ? 'Personal Space' : WORKSPACE_KIND_LABELS[kind];

  // The list is live only when accounts is on AND it answered. If accounts is
  // enabled but unreachable (orgs empty), show the same synthetic Personal row
  // used when accounts is off, so the dropdown is never empty.
  const PERSONAL_ROW = { id: 'personal', kind: 'personal' as const, name: 'Personal Workspace', slug: null, role: 'owner' as const };
  const live = enabled && orgs.length > 0;
  const rows = live ? orgs : [PERSONAL_ROW];

  const errorMessage = (e: unknown, fallback: string) =>
    e instanceof Error && e.message ? e.message : fallback;

  const choose = async (orgId: string) => {
    setOpen(false);
    setManaging(false);
    if (current?.id === orgId) return;
    setSwitchError(null);
    try {
      await switchTo(orgId);
    } catch (e) {
      setSwitchError(errorMessage(e, 'Could not switch workspace.'));
      return;
    }
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
    setCreateError(null);
    try {
      const { accountsService } = await import('@/services/accounts.service');
      const { orgId, token } = await accountsService.createOrg(companyName, teamSize);
      setCreating(false);
      await adoptCreated(orgId, token, '/settings/team');
    } catch (e) {
      setCreateError(errorMessage(e, 'Could not create the organization.'));
    } finally {
      setPending(false);
    }
  };

  const submitEducational = async (courseCode: string, education: EducationPayload) => {
    setPending(true);
    setCreateError(null);
    try {
      const { accountsService } = await import('@/services/accounts.service');
      const { orgId, token } = await accountsService.createEducational(courseCode, education);
      setCreatingEdu(false);
      await adoptCreated(orgId, token, '/settings/team');
    } catch (e) {
      setCreateError(errorMessage(e, 'Could not create the educational hub.'));
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
      {switchError && (
        <p role="alert" className="mt-1.5 px-1 text-[11px] text-danger">{switchError}</p>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[240px] rounded-lg border border-border bg-surface py-1 shadow-lg">
            {rows.map((ws) => (
              <button key={ws.id} type="button" onClick={() => (live ? choose(ws.id) : setOpen(false))}
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

      <CreateOrganizationModal open={creating} onClose={() => { setCreating(false); setCreateError(null); }} pending={pending} error={createError} onSubmit={submitCreate} />
      <CreateEducationalModal open={creatingEdu} onClose={() => { setCreatingEdu(false); setCreateError(null); }} pending={pending} error={createError} onSubmit={submitEducational} />
      <ManageWorkspacesModal open={managing} onClose={() => setManaging(false)} onSwitch={choose} />
    </div>
  );
}
