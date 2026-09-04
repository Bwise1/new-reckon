/**
 * Client for the identity/accounts service (organizations & the person
 * account). Separate from api-client (which targets the Bill API): org data
 * lives in accounts, reached with the identity token stored at login via
 * VITE_AUTH_URL. When there is no identity token — a plain Bill-API login —
 * org features are unavailable, and callers guard on `accountsEnabled()`.
 */
const AUTH_URL = import.meta.env.VITE_AUTH_URL || null;

export const accountsEnabled = () => Boolean(AUTH_URL && localStorage.getItem('identityToken'));

/**
 * The identity token is short-lived (15 min). Exchange the stored refresh
 * token for a fresh one. The suite token IS the Bill API token, so we store
 * it under both keys — the same thing login does. Returns the new access
 * token, or null when refresh is impossible (no refresh token, or it was
 * itself rejected — the caller then surfaces the 401 and the user re-logs in).
 * Concurrent callers share one in-flight refresh so a burst of 401s does not
 * spend the single-use refresh token more than once.
 */
let refreshing: Promise<string | null> | null = null;
export const refreshIdentityToken = async (): Promise<string | null> => {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (!AUTH_URL) return null;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${AUTH_URL}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json().catch(() => ({}))) as {
        data?: { token?: string; refreshToken?: string };
      };
      const next = body?.data;
      if (!next?.token) return null;
      localStorage.setItem('identityToken', next.token);
      localStorage.setItem('token', next.token);
      if (next.refreshToken) localStorage.setItem('refreshToken', next.refreshToken);
      return next.token;
    } catch {
      return null;
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
};

const request = async <T>(path: string, init: RequestInit = {}, retried = false): Promise<T> => {
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
  // An expired identity token comes back as 401; refresh once and retry. The
  // refresh endpoint is not itself retried (it carries no bearer).
  if (res.status === 401 && !retried && path !== '/refresh-token') {
    const fresh = await refreshIdentityToken();
    if (fresh) return request<T>(path, init, true);
  }
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
  createEducational: (name: string, education: EducationPayload) =>
    request<{ orgId: string; token: string }>('/orgs', {
      method: 'POST',
      body: JSON.stringify({ name, kind: 'educational', education }),
    }),
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

  // Active sessions (Security settings). Sending the stored refresh token lets
  // the server flag which row is THIS device (the one you must not revoke).
  listSessions: () => {
    const rt = (() => { try { return localStorage.getItem('refreshToken'); } catch { return null; } })();
    return request<{ sessions: AccountSession[] }>('/sessions', {
      headers: rt ? { 'x-refresh-token': rt } : {},
    });
  },
  revokeSession: (id: string) => request<unknown>(`/sessions/${id}`, { method: 'DELETE' }),
  logoutOthers: () => request<unknown>('/logout-all', { method: 'POST', body: '{}' }),
};

export interface EducationPayload {
  institutionName: string;
  institutionType: string;
  courseTitle: string;
  courseCode: string;
  level: string;
}

export interface AccountSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  client: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}
