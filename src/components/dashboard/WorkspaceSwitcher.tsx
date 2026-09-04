import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, Plus, User } from 'lucide-react';
import { initials } from '@/lib/avatar';
import { accountsEnabled } from '@/services/accounts.service';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import CreateOrganizationModal from './CreateOrganizationModal';

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
  const [pending, setPending] = useState(false);

  useEffect(() => { void load(); }, [load]);

  const enabled = accountsEnabled();
  const current = active();
  const name = current?.kind === 'personal' || !current ? 'Personal Workspace' : current.name;
  const subtitle = current && current.kind !== 'personal' ? 'Organization' : 'Personal Space';

  const choose = async (orgId: string) => {
    setOpen(false);
    if (current?.id === orgId) return;
    await switchTo(orgId);
    qc.invalidateQueries({ queryKey: ['projects'] });
    navigate('/dashboard');
  };

  const submitCreate = async (companyName: string, teamSize: string) => {
    setPending(true);
    try {
      const { accountsService } = await import('@/services/accounts.service');
      const { orgId, token } = await accountsService.createOrg(companyName, teamSize);
      // The create response already switches the active org; adopt its token.
      localStorage.setItem('identityToken', token);
      localStorage.setItem('token', token);
      localStorage.setItem('reckon_active_org', orgId);
      await load();
      useWorkspaceStore.setState({ activeOrgId: orgId });
      setCreating(false);
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/settings/team');
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
            ? <Building2 className="h-4 w-4" />
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
            {(enabled ? orgs : [{ id: 'personal', kind: 'personal', name: 'Personal Workspace', slug: null, role: 'owner' as const }]).map((ws) => (
              <button key={ws.id} type="button" onClick={() => (enabled ? choose(ws.id) : setOpen(false))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-overlay/10 text-[10px] font-semibold text-body">
                  {ws.kind === 'personal' ? (ownerName ? initials(ownerName) : '?') : <Building2 className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{ws.kind === 'personal' ? 'Personal Workspace' : ws.name}</span>
                {current?.id === ws.id && <Check className="h-3.5 w-3.5 shrink-0 text-body" />}
              </button>
            ))}
            <div className="mx-1 my-1 h-px bg-border" />
            {enabled ? (
              <button type="button" onClick={() => { setOpen(false); setCreating(true); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer">
                <Plus className="h-3.5 w-3.5 text-muted" />
                Create Organization
              </button>
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted">Organizations arrive when you sign in through Reckon accounts.</p>
            )}
          </div>
        </>
      )}

      <CreateOrganizationModal open={creating} onClose={() => setCreating(false)} pending={pending} onSubmit={submitCreate} />
    </div>
  );
}
