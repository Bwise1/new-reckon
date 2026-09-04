import { create } from 'zustand';
import { accountsService, accountsEnabled, type OrgSummary } from '@/services/accounts.service';

const ACTIVE_KEY = 'reckon_active_org';

/**
 * The active workspace (personal or an organization). Org data lives in the
 * accounts service; switching there returns a fresh suite token that carries
 * the new `org`/`org_role` claims, which IS the Bill API token (Bill accepts
 * suite tokens). So switching stores that token as both `token` and
 * `identityToken`, then the caller refetches projects.
 */
interface WorkspaceState {
  orgs: OrgSummary[];
  activeOrgId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  switchTo: (orgId: string) => Promise<void>;
  active: () => OrgSummary | null;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  orgs: [],
  activeOrgId: (() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  })(),
  loading: false,

  load: async () => {
    if (!accountsEnabled()) return;
    set({ loading: true });
    try {
      const { orgs } = await accountsService.listOrgs();
      // Default active = stored choice if still a member, else the personal org.
      let activeOrgId = get().activeOrgId;
      if (!activeOrgId || !orgs.some((o) => o.id === activeOrgId)) {
        activeOrgId = orgs.find((o) => o.kind === 'personal')?.id ?? orgs[0]?.id ?? null;
      }
      set({ orgs, activeOrgId });
    } catch {
      // Accounts unreachable — stay personal-only.
    } finally {
      set({ loading: false });
    }
  },

  switchTo: async (orgId) => {
    const { token, activeOrgId } = await accountsService.setActiveOrg(orgId);
    // The returned suite token carries the new org context and authenticates
    // against Bill directly.
    localStorage.setItem('identityToken', token);
    localStorage.setItem('token', token);
    try { localStorage.setItem(ACTIVE_KEY, activeOrgId); } catch { /* ignore */ }
    set({ activeOrgId });
  },

  active: () => {
    const { orgs, activeOrgId } = get();
    return orgs.find((o) => o.id === activeOrgId) ?? orgs.find((o) => o.kind === 'personal') ?? null;
  },
}));
