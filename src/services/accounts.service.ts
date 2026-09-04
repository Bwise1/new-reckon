/**
 * Client for the identity/accounts service (organizations & the person
 * account). Separate from api-client (which targets the Bill API): org data
 * lives in accounts, reached with the identity token stored at login via
 * VITE_AUTH_URL. When there is no identity token — a plain Bill-API login —
 * org features are unavailable, and callers guard on `accountsEnabled()`.
 */
const AUTH_URL = import.meta.env.VITE_AUTH_URL || null;

export const accountsEnabled = () => Boolean(AUTH_URL && localStorage.getItem('identityToken'));

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!AUTH_URL) throw new Error('Accounts service is not configured');
  const token = localStorage.getItem('identityToken');
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string })?.message || `Request failed (${res.status})`);
  }
  return (body as { data: T }).data;
};

export interface OrgSummary {
  id: string;
  kind: 'personal' | 'organization' | 'educational';
  name: string;
  slug: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
}
export interface OrgPerson {
  accountId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  email: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
  joinedAt?: string;
}
export interface OrgInvite {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'guest';
  expiresAt: string;
  createdAt: string;
  invitedBy: string;
}
export interface OrgDetail {
  org: {
    id: string; kind: string; name: string; slug: string | null; logoUrl: string | null;
    accessPolicy: 'open' | 'restricted'; defaultProjectRole: string; teamSize: string | null;
  };
  members: OrgPerson[];
  invites: OrgInvite[];
  me: { role: string; canManage: boolean };
}

export const accountsService = {
  listOrgs: () => request<{ orgs: OrgSummary[] }>('/orgs'),
  createOrg: (name: string, teamSize?: string) =>
    request<{ orgId: string; token: string }>('/orgs', { method: 'POST', body: JSON.stringify({ name, teamSize }) }),
  convertOrg: (orgId: string, name: string, teamSize?: string) =>
    request<{ orgId: string; token: string }>(`/orgs/${orgId}/convert`, { method: 'POST', body: JSON.stringify({ name, teamSize }) }),
  orgDetail: (orgId: string) => request<OrgDetail>(`/orgs/${orgId}`),
  updateOrg: (orgId: string, fields: Record<string, unknown>) =>
    request<{ org: OrgDetail['org'] }>(`/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  invite: (orgId: string, email: string, role: string) =>
    request<{ added: boolean; inviteId?: string }>(`/orgs/${orgId}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  resendInvite: (orgId: string, inviteId: string) =>
    request<unknown>(`/orgs/${orgId}/invites/${inviteId}/resend`, { method: 'POST', body: '{}' }),
  cancelInvite: (orgId: string, inviteId: string) =>
    request<unknown>(`/orgs/${orgId}/invites/${inviteId}`, { method: 'DELETE' }),
  setRole: (orgId: string, accountId: string, role: string) =>
    request<unknown>(`/orgs/${orgId}/members/${accountId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (orgId: string, accountId: string) =>
    request<unknown>(`/orgs/${orgId}/members/${accountId}`, { method: 'DELETE' }),
  /** Switch the active org; returns a fresh suite token (org claims baked in). */
  setActiveOrg: (orgId: string) =>
    request<{ token: string; activeOrgId: string }>('/active-org', { method: 'POST', body: JSON.stringify({ orgId }) }),
  invitePreview: (token: string) =>
    request<{ invite: { orgName: string; inviter: string; role: string; email: string; state: 'open' | 'accepted' | 'expired' } }>(`/org-invites/${token}`),
  acceptInvite: (token: string) =>
    request<{ orgId: string; token: string }>(`/org-invites/${token}/accept`, { method: 'POST', body: '{}' }),
};
